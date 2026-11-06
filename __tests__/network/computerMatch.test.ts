/**
 * A match against the computer, end to end through ComputerMatch: the
 * human side is played by the heuristic coach through the match's own
 * `run`, the way the board's actions arrive, and the computer plays its
 * side by itself. The human may never act for the computer's team.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { createLineupTeam } from "../../src/simulation/lineups";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { drawsFor } from "../../src/game/presentation/screenSettled";
import { Coach } from "../../src/simulation/coach";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { RosterName } from "../../src/types/Team";

let match: OnlineMatch | null = null;
afterEach(() => {
  match?.close();
  setActiveOnlineMatch(null);
  ServiceContainer.reset();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a match against the computer, once closed", () => {
  const teams = () => ({
    team1: stabilizeIds(createLineupTeam(RosterName.HUMAN, "H", 1), "team1"),
    team2: stabilizeIds(createLineupTeam(RosterName.ORC, "O", 2), "team2"),
  });
  const listeners = (bus: EventBus) =>
    Object.values(GameEventNames).reduce(
      (count, name) => count + bus.listenerCount(name),
      0
    );

  it("leaves no listeners on the page's event bus", () => {
    const eventBus = new EventBus();
    match = createComputerMatch({
      eventBus,
      ...teams(),
      computerTeamId: "team2",
    });
    expect(listeners(eventBus)).toBeGreaterThan(0);
    match.close();
    expect(listeners(eventBus)).toBe(0);
  });

  it("sends the page nothing from a command still running as it closes", async () => {
    const eventBus = new EventBus();
    match = createComputerMatch({
      eventBus,
      ...teams(),
      computerTeamId: "team2",
    });
    const synced: unknown[] = [];
    eventBus.on(GameEventNames.UI_SyncBoard, (data) => synced.push(data));
    const running = match.run({ type: "end-turn" });
    match.close();
    await running;
    expect(synced).toEqual([]);
  });

  it("does not announce full time when a later match ends", () => {
    const eventBus = new EventBus();
    match = createComputerMatch({
      eventBus,
      ...teams(),
      computerTeamId: "team2",
    });
    match.close();
    const announced: unknown[] = [];
    eventBus.on(GameEventNames.UI_Notification, (note) => announced.push(note));
    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.GAME_OVER,
    });
    expect(announced).toEqual([]);
  });
});

describe("whose turn it is against the computer", () => {
  // Activates every player it can, then has only End Turn left to choose,
  // while the engine is about to end the turn by itself.
  const activatesEveryone: Coach = {
    name: "activates-everyone",
    choose: async (input) => {
      const { candidates } = input.point;
      const finish = candidates.findIndex(
        (c) => c.commands[0]?.type === "end-activation"
      );
      if (finish >= 0) return { index: finish };
      const declare = candidates.findIndex((c) => c.kind === "declare");
      if (declare >= 0) return { index: declare };
      return plannerCoach.choose(input);
    },
  };

  const start = async (pace: number) => {
    const team1 = stabilizeIds(
      createLineupTeam(RosterName.DARK_ELF, "Poin", 0xcc0000),
      "team1"
    );
    const team2 = stabilizeIds(
      createLineupTeam(RosterName.HUMAN, "Ready-made", 0x0000cc),
      "team2"
    );
    const eventBus = new EventBus();
    const turns: string[] = [];
    eventBus.on(GameEventNames.TurnStarted, ({ teamId }) => turns.push(teamId));
    match = createComputerMatch({
      eventBus,
      team1,
      team2,
      computerTeamId: team2.id,
      coach: activatesEveryone,
      pace,
    });
    // The computer kicks, so the human takes the first turn.
    await match.run({ type: "start-setup", kickingTeamId: team2.id });
    const game = (
      globalThis.window as unknown as {
        __computerMatch: { game: HeadlessGame };
      }
    ).__computerMatch.game;
    const rng = createCoachRng(5);
    const live = match;
    // Plays the human's side up to their first turn, touchback included.
    while (game.snapshot().phase !== GamePhase.PLAY || game.pendingDecision()) {
      if (!live.mayAct()) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      const snapshot = game.snapshot();
      const point = await enumerateDecision(game, null);
      if (point.candidates.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
      const { index } = await heuristicCoach.choose({
        game,
        snapshot,
        point,
        rng,
      });
      for (const command of point.candidates[index].commands)
        await live.run(command);
    }
    return { live, game, turns, team1, team2 };
  };

  it("keeps the human's turn after the computer activates every player", async () => {
    const { live, turns } = await start(1);
    expect(turns).toEqual(["team1"]);
    await live.run({ type: "end-turn" });
    while (turns.length < 3)
      await new Promise((resolve) => setTimeout(resolve, 50));

    // The computer's End Turn was on its way when the engine ended the turn.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(turns).toEqual(["team1", "team2", "team1"]);
  }, 60_000);

  it("refuses a second End Turn queued behind the first", async () => {
    const { live, turns } = await start(1);
    const [first, second] = await Promise.all([
      live.run({ type: "end-turn" }),
      live.run({ type: "end-turn" }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("not-your-turn");
    expect(turns).toEqual(["team1", "team2"]);
  }, 60_000);
});

describe("a match against the computer", () => {
  // Whoever kicks first decides who ends each half; the computer must set
  // up again after ending a half itself.
  it.each(["human", "computer"] as const)(
    "plays to full time when the %s kicks first",
    async (firstKicker) => {
      const team1 = stabilizeIds(
        createLineupTeam(RosterName.HUMAN, "Reavers", 0xcc0000),
        "team1"
      );
      const team2 = stabilizeIds(
        createLineupTeam(RosterName.ORC, "Gouged Eye", 0x0000cc),
        "team2"
      );
      const eventBus = new EventBus();
      let computerActivations = 0;
      eventBus.on(GameEventNames.PlayerActivated, (playerId: string) => {
        if (playerId.startsWith(team2.id)) computerActivations++;
      });
      match = createComputerMatch({
        eventBus,
        team1,
        team2,
        computerTeamId: team2.id,
        pace: 0,
      });
      // The board's coin toss.
      await match.run({
        type: "start-setup",
        kickingTeamId: firstKicker === "human" ? team1.id : team2.id,
      });

      const game = (
        globalThis.window as unknown as {
          __computerMatch: { game: HeadlessGame };
        }
      ).__computerMatch.game;
      const rng = createCoachRng(5);
      let humanCommands = 0;
      let refused = 0;
      for (let i = 0; i < 40000; i++) {
        // A person sees the turn end before choosing what to do next.
        await whenEngineQuiet();
        const snapshot = game.snapshot();
        if (snapshot.phase === GamePhase.GAME_OVER) break;
        if (
          !match.mayAct() ||
          // The kick is in the air: nothing to do until it lands.
          (snapshot.phase === GamePhase.KICKOFF &&
            !game.pendingDecision() &&
            game.ctx.gameService.getState().kickoffKickResolved)
        ) {
          await tick();
          continue;
        }
        const kicker =
          snapshot.phase === GamePhase.KICKOFF
            ? snapshot.activeTeamId === team1.id
              ? team2.id
              : team1.id
            : null;
        const point = await enumerateDecision(game, kicker);
        // Whatever the human may do is the human's own team's business.
        expect(point.teamId).toBe(team1.id);
        const { index } = await heuristicCoach.choose({
          game,
          snapshot,
          point,
          rng,
        });
        for (const command of point.candidates[index].commands) {
          const response = await match.run(command);
          humanCommands++;
          if (!response.ok) {
            refused++;
            break;
          }
        }
      }

      const final = game.snapshot();
      expect(final.phase).toBe(GamePhase.GAME_OVER);
      expect(humanCommands).toBeGreaterThan(50);
      expect(refused).toBe(0);
      // The computer coached its own players through the match.
      expect(computerActivations).toBeGreaterThan(20);
    },
    120_000
  );
});

describe("the computer's pace", () => {
  it("waits for the board to finish drawing before its next step", async () => {
    const team1 = stabilizeIds(
      createLineupTeam(RosterName.HUMAN, "H", 1),
      "team1"
    );
    const team2 = stabilizeIds(
      createLineupTeam(RosterName.ORC, "O", 2),
      "team2"
    );
    const eventBus = new EventBus();
    // A walk is still on screen when the computer is due to set up.
    let finishWalk = () => {};
    const walk = new Promise<void>((resolve) => (finishWalk = resolve));
    const stopDrawing = drawsFor(eventBus, () => walk);
    match = createComputerMatch({
      eventBus,
      team1,
      team2,
      computerTeamId: team2.id,
      pace: 0,
    });
    await match.run({ type: "start-setup", kickingTeamId: team2.id });
    const game = (
      globalThis.window as unknown as {
        __computerMatch: { game: HeadlessGame };
      }
    ).__computerMatch.game;
    const placed = () =>
      game.snapshot().teams[1].players.filter((p) => p.position).length;

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(placed()).toBe(0);

    finishWalk();
    const end = Date.now() + 5000;
    while (placed() === 0 && Date.now() < end) await tick();
    expect(placed()).toBeGreaterThan(0);
    stopDrawing();
  });
});
