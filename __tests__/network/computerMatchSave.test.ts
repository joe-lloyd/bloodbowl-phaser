/**
 * Coming back to a match against the computer: the match saves itself from
 * the toss on, and a page that reloads picks up from that save. The human
 * side is played by the heuristic coach through the match's own `run`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import { OnlineMatch } from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { createLineupTeam } from "../../src/simulation/lineups";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { MatchSave, restoreMatchSave } from "../../src/headless/serialization";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import {
  MatchSaveRepository,
  describeMatchSave,
  setMatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { RosterName } from "../../src/types/Team";

const autosave = { difficulty: "standard", pitchThemeId: "chalk" };
const ms = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time));

let latest: MatchSave | null = null;
/** The choice each save was written over, if one was open. */
let writtenOver: (string | null)[] = [];
const repository: MatchSaveRepository = {
  read: () => latest,
  write: (save) => {
    latest = save;
    writtenOver.push(liveGame().pendingDecision()?.type ?? null);
  },
  clear: () => {
    latest = null;
  },
  describe: () => (latest ? describeMatchSave(latest) : null),
};

let match: OnlineMatch | null = null;
afterEach(() => {
  match?.close();
  match = null;
  latest = null;
  writtenOver = [];
  setMatchSaveRepository(null);
  ServiceContainer.reset();
});

const liveGame = () =>
  (
    globalThis.window as unknown as {
      __computerMatch: { game: HeadlessGame };
    }
  ).__computerMatch.game;

function startNew(pace: number): OnlineMatch {
  setMatchSaveRepository(repository);
  match = createComputerMatch({
    eventBus: new EventBus(),
    team1: stabilizeIds(
      createLineupTeam(RosterName.DARK_ELF, "Poin", 0xcc0000),
      "team1"
    ),
    team2: stabilizeIds(
      createLineupTeam(RosterName.HUMAN, "Ready-made", 0x0000cc),
      "team2"
    ),
    computerTeamId: "team2",
    pace,
    autosave,
  });
  return match;
}

/** What a reloaded page does; the board's GameStateRestored is left to the caller. */
function resume(save: MatchSave, pace: number) {
  const restored = restoreMatchSave(save);
  const eventBus = new EventBus();
  match = createComputerMatch({
    eventBus,
    team1: restored.teams[0],
    team2: restored.teams[1],
    computerTeamId: save.computer!.computerTeamId,
    pace,
    resume: restored,
    autosave,
  });
  return {
    live: match,
    boardReady: () =>
      eventBus.emit(
        GameEventNames.GameStateRestored,
        liveGame().ctx.gameService.getState()
      ),
  };
}

/** One human decision, if there is one to make; the commands it took. */
async function humanStep(
  live: OnlineMatch,
  rng: ReturnType<typeof createCoachRng>
): Promise<number> {
  await whenEngineQuiet();
  const game = liveGame();
  const snapshot = game.snapshot();
  if (
    !live.mayAct() ||
    (snapshot.phase === GamePhase.KICKOFF &&
      !game.pendingDecision() &&
      game.ctx.gameService.getState().kickoffKickResolved)
  ) {
    await ms(1);
    return 0;
  }
  const kicker =
    snapshot.phase === GamePhase.KICKOFF
      ? snapshot.activeTeamId === "team1"
        ? "team2"
        : "team1"
      : null;
  const point = await enumerateDecision(game, kicker);
  const { index } = await heuristicCoach.choose({
    game,
    snapshot,
    point,
    rng,
  });
  let commands = 0;
  for (const command of point.candidates[index].commands) {
    const response = await live.run(command);
    expect(response.reason).toBeUndefined();
    commands++;
  }
  return commands;
}

/** Plays the human's side until it is their move in open play. */
async function playToHumanTurn(live: OnlineMatch): Promise<void> {
  const rng = createCoachRng(5);
  while (
    liveGame().snapshot().phase !== GamePhase.PLAY ||
    liveGame().pendingDecision() ||
    !live.mayAct()
  )
    await humanStep(live, rng);
}

async function savedTurn(teamId: string): Promise<MatchSave> {
  while (latest?.snapshot.activeTeamId !== teamId) await ms(10);
  return latest;
}

describe("saving a match against the computer", () => {
  it("saves nothing until the toss has been made", async () => {
    const live = startNew(0);
    await ms(150);
    expect(latest).toBeNull();

    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    while (!latest) await ms(10);

    expect(latest.computer).toEqual({
      computerTeamId: "team2",
      difficulty: "standard",
    });
    expect(latest.presentation?.pitchThemeId).toBe("chalk");
  });

  it("saves once a coin-flip command has made the toss", async () => {
    const live = startNew(0);
    await live.run({ type: "coin-flip" });
    const end = Date.now() + 2000;
    while (!latest && Date.now() < end) await ms(10);
    expect(latest?.computer?.computerTeamId).toBe("team2");
  });

  it("resumes on the same board, score and turn", async () => {
    const live = startNew(0);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    await playToHumanTurn(live);
    await whenEngineQuiet();
    await ms(150);
    const save = latest!;
    live.close();

    resume(save, 0);

    const { turnManager, ...resumed } = liveGame().snapshot();
    const { turnManager: _saved, ...saved } = save.snapshot;
    expect(JSON.parse(JSON.stringify(resumed))).toEqual(saved);
    expect(turnManager).toEqual(save.turnManager);
    expect(resumed.phase).toBe(GamePhase.PLAY);
    expect(resumed.activeTeamId).toBe("team1");
  }, 60_000);

  it("holds the computer's turn until the board is ready", async () => {
    const live = startNew(1);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    await playToHumanTurn(live);
    await live.run({ type: "end-turn" });
    const save = await savedTurn("team2");
    live.close();

    const { boardReady } = resume(save, 0);
    const before = JSON.stringify(liveGame().snapshot());
    await ms(400);
    expect(JSON.stringify(liveGame().snapshot())).toBe(before);

    boardReady();
    while (JSON.stringify(liveGame().snapshot()) === before) await ms(20);
  }, 60_000);

  it("never saves while a block, push or kick-off choice is open", async () => {
    const live = startNew(0);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    const rng = createCoachRng(11);
    while (!liveGame().snapshot().turn.isHalf2) {
      // A person takes a moment over each action and each choice
      if (live.mayAct()) await ms(100);
      await humanStep(live, rng);
    }

    // A resume restores the board, not the prompt for a choice half-made.
    expect(writtenOver.length).toBeGreaterThan(10);
    expect(writtenOver.filter((open) => open !== null)).toEqual([]);
  }, 120_000);

  it("plays to full time across reloads, then clears the save", async () => {
    let live = startNew(0);
    await live.run({ type: "start-setup", kickingTeamId: "team2" });
    const rng = createCoachRng(5);
    let reloads = 0;
    let sinceReload = 0;
    let resumedFrom = "";
    for (let i = 0; i < 60000; i++) {
      if (liveGame().snapshot().phase === GamePhase.GAME_OVER) break;
      sinceReload += await humanStep(live, rng);
      if (sinceReload < 25) continue;
      await whenEngineQuiet();
      await ms(100);
      const save = latest!;
      // Coming back to the save last resumed from replays the same stretch,
      // and a fast drive (set-up, kick-off) can outrun the autosave every
      // time: reload once there is something newer to come back to.
      const saved = JSON.stringify(save.snapshot);
      if (saved === resumedFrom) {
        // Saves land after each action; only set-up and the kick-off run
        // long without one. An autosave that stopped would show here.
        expect(sinceReload, "human commands with no newer save").toBeLessThan(
          150
        );
        continue;
      }
      resumedFrom = saved;
      live.close();
      const next = resume(save, 0);
      live = next.live;
      next.boardReady();
      reloads++;
      sinceReload = 0;
    }

    const final = liveGame().snapshot();
    expect(final.phase).toBe(GamePhase.GAME_OVER);
    expect(final.turn.isHalf2).toBe(true);
    expect(reloads).toBeGreaterThan(3);

    await whenEngineQuiet();
    await ms(150);
    live.close();
    match = null;
    expect(latest).toBeNull();
  }, 280_000);
});
