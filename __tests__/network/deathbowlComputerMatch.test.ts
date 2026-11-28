import { afterEach, describe, expect, it } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import { type OnlineMatch } from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import {
  type MatchSave,
  restoreMatchSave,
} from "../../src/headless/serialization";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import {
  type MatchSaveRepository,
  describeMatchSave,
  readMatchSave,
  setMatchSaveRepository,
} from "../../src/game/persistence/MatchSaveRepository";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import {
  activateMatchFormat,
  SEVENS_FORMAT,
} from "../../src/game/variants/activeMatch";
import { enumerateDecision } from "../../src/simulation/candidates";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { snapshotHash } from "../../src/simulation/runMatch";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import { RosterName } from "../../src/types/Team";

const ROSTERS = [
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.SKAVEN,
  RosterName.DWARF,
] as const;

const seatTeams = () => {
  const [north, east, south, west] = ROSTERS.map((roster, index) =>
    stabilizeIds(arenaSquad(roster, roster, 0xcc0000), `seat${String(index)}`)
  );
  return [
    fixtureValue(north),
    fixtureValue(east),
    fixtureValue(south),
    fixtureValue(west),
  ] as const;
};

function memorySlot(): MatchSaveRepository & { writes: () => number } {
  let saved: MatchSave | null = null;
  let writes = 0;
  return {
    writes: () => writes,
    read: () => saved,
    write: (save) => {
      saved = save;
      writes++;
    },
    clear: () => {
      saved = null;
    },
    describe: () => (saved ? describeMatchSave(saved) : null),
  };
}

let match: OnlineMatch | null = null;
afterEach(() => {
  match?.close();
  match = null;
  setMatchSaveRepository(null);
  ServiceContainer.reset();
  activateMatchFormat(SEVENS_FORMAT);
});

const liveGame = () => fixtureValue(globalThis.__computerMatch).game;

async function playHuman(live: OnlineMatch, until: () => boolean) {
  const rng = createCoachRng(3);
  const refused = new Set<string>();
  for (let step = 0; step < 20_000 && !until(); step++) {
    await whenEngineQuiet();
    if (!live.mayAct()) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      continue;
    }
    const game = liveGame();
    const offered = await enumerateDecision(game, null);
    const candidates = offered.candidates.filter((option) => !refused.has(JSON.stringify(option.commands)));
    const point = { ...offered, candidates };
    const snapshot = game.snapshot();
    const { index } = await heuristicCoach.choose({ game, snapshot, point, rng });
    const { commands } = fixtureValue(candidates[index]);
    for (const command of commands) {
      const response = await live.run(command);
      if (response.ok) refused.clear();
      else {
        refused.add(JSON.stringify(commands));
        break;
      }
    }
  }
}

describe("a Deathbowl match against three computer teams", () => {
  it("plays a round of four turns, saves to its own slot and resumes to the same hash", async () => {
    const sevens = memorySlot();
    const sevensSave = new HeadlessGame({ seed: 1 }).matchSave();
    sevens.write(sevensSave);
    setMatchSaveRepository(sevens);

    const slot = memorySlot();
    const teams = seatTeams();
    const eventBus = new EventBus();
    eventBus.on(GameEventNames.PassFumbled, ({ presentationId }) => {
      if (presentationId)
        eventBus.emit(GameEventNames.UI_PresentationAcknowledged, { id: presentationId });
    });
    const turns: string[] = [];
    eventBus.on(GameEventNames.TurnStarted, ({ teamId }) => {
      turns.push(teamId);
    });
    const live = createComputerMatch({
      eventBus,
      teams,
      humanTeamId: teams[0].id,
      coach: heuristicCoach,
      pace: 0,
      autosave: { difficulty: "standard", slot },
    });
    match = live;

    await playHuman(live, () => new Set(turns).size === 4);
    expect(new Set(turns)).toEqual(new Set(teams.map(({ id }) => id)));

    await playHuman(live, () => {
      const game = liveGame();
      return live.mayAct() && game.isAtRest() && !game.pendingDecision() && game.snapshot().phase === GamePhase.PLAY;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const hash = snapshotHash(liveGame().snapshot());
    live.close();
    match = null;

    const save = fixtureValue(slot.read());
    expect(save.computer).toEqual({ humanTeamId: "seat0", difficulty: "standard" });
    expect(save.teams.map(({ id }) => id)).toEqual(["seat0", "seat1", "seat2", "seat3"]);
    expect(readMatchSave()).toBe(sevensSave);
    expect(sevens.writes()).toBe(1);

    ServiceContainer.reset();
    const restored = restoreMatchSave(save);
    match = createComputerMatch({
      eventBus: new EventBus(),
      teams: restored.teams,
      humanTeamId: "seat0",
      coach: heuristicCoach,
      pace: 0,
      resume: restored,
      autosave: { difficulty: "standard", slot },
    });
    expect(snapshotHash(liveGame().snapshot())).toBe(hash);
    expect(readMatchSave()).toBe(sevensSave);
  }, 300_000);
});
