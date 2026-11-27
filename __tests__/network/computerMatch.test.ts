import { fixtureValue } from "../../src/testing/fixtureValue";
import { confirmComputerPregame } from "../utils/computerPregame";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { createLineupTeam } from "../../src/simulation/lineups";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { drawsFor } from "../../src/game/presentation/screenSettled";
import { type Coach } from "../../src/simulation/coach";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
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

const state = () => ServiceContainer.getInstance().gameService.getState();

const teams = () => ({
  team1: stabilizeIds(createLineupTeam(RosterName.HUMAN, "H", 1), "team1"),
  team2: stabilizeIds(createLineupTeam(RosterName.ORC, "O", 2), "team2"),
});
const listeners = (bus: EventBus) =>
  Object.values(GameEventNames)
    .filter((name) => name !== GameEventNames.PlayerDeselected)
    .reduce((count, name) => count + bus.listenerCount(name), 0);

describe("a match against the computer, once closed", () => {
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
    eventBus.on(GameEventNames.UI_SyncBoard, (data) => {
      synced.push(data);
    });
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
    eventBus.on(GameEventNames.UI_Notification, (note) => {
      announced.push(note);
    });
    eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.GAME_OVER,
    });
    expect(announced).toEqual([]);
  });
});

it("the computer waits for both teams, buys its own inducements and confirms before setup", async () => {
  const team1 = stabilizeIds(
    createLineupTeam(RosterName.HUMAN, "Home", 1),
    "team1"
  );
  const team2 = stabilizeIds(
    createLineupTeam(RosterName.HUMAN, "Computer", 2),
    "team2"
  );
  team1.rerolls = 6;
  team2.rerolls = 0;
  team1.advancementMode = team2.advancementMode = "advanced-league";
  match = createComputerMatch({
    eventBus: new EventBus(),
    team1,
    team2,
    computerTeamId: team2.id,
    pace: 0,
  });
  await vi.waitFor(() => {
    expect(state().pregameInducements?.ready["team2"]).toBe(true);
  });
  expect(state().inducements).toBeUndefined();
  expect(state().pregameInducements?.offer).toBeUndefined();
  await confirmComputerPregame(match);
  expect(state().inducements?.inventory.length).toBeGreaterThan(0);
  expect(
    state().inducements?.inventory.every(
      (entry) => entry.ownerTeamId === team2.id
    )
  ).toBe(true);
  expect(state().pregameInducements?.offer?.confirmed).toEqual({
    team1: true,
    team2: true,
  });
  expect(team2.rerolls).toBe(0);
});

describe("whose turn it is against the computer", () => {
  const activatesEveryone: Coach = {
    name: "activates-everyone",
    choose: async (input) => {
      const { candidates } = input.point;
      const finish = candidates.findIndex(
        (c) => c.commands[0]?.type === "end-activation"
      );
      if (finish !== -1) return { index: finish };
      const declare = candidates.findIndex((c) => c.kind === "declare");
      if (declare !== -1) return { index: declare };
      return plannerCoach.choose(input);
    },
  };

  const start = async () => {
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
    eventBus.on(GameEventNames.TurnStarted, ({ teamId }) => {
      turns.push(teamId);
    });
    match = createComputerMatch({
      eventBus,
      team1,
      team2,
      computerTeamId: team2.id,
      coach: activatesEveryone,
      pace: 1,
    });

    await confirmComputerPregame(match);
    await match.run({ type: "start-setup", kickingTeamId: team2.id });
    const game = fixtureValue(globalThis.__computerMatch).game;
    const rng = createCoachRng(5);
    const live = match;

    const settled = async () => {
      await whenEngineQuiet();
      return (
        game.snapshot().phase === GamePhase.PLAY && !game.pendingDecision()
      );
    };
    while (!(await settled())) {
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
      const { commands } = fixtureValue(point.candidates[index]);
      for (const command of commands) await live.run(command);
    }
    return { live, game, turns, team1, team2 };
  };

  it("keeps the human's turn after the computer activates every player", async () => {
    const { live, turns } = await start();
    expect(turns).toEqual(["team1"]);
    await live.run({ type: "end-turn" });
    while (turns.length < 3)
      await new Promise((resolve) => setTimeout(resolve, 50));

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(turns).toEqual(["team1", "team2", "team1"]);
  }, 60_000);

  it("refuses a second End Turn queued behind the first", async () => {
    const { live, turns } = await start();
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

    let finishWalk: (() => void) | undefined;
    const walk = new Promise<void>((resolve) => {
      finishWalk = resolve;
    });
    const stopDrawing = drawsFor(eventBus, () => walk);
    match = createComputerMatch({
      eventBus,
      team1,
      team2,
      computerTeamId: team2.id,
      pace: 0,
    });
    await confirmComputerPregame(match);
    await match.run({ type: "start-setup", kickingTeamId: team2.id });
    const game = fixtureValue(globalThis.__computerMatch).game;
    const placed = () =>
      fixtureValue(game.snapshot().teams[1]).players.filter((p) => p.position)
        .length;

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(placed()).toBe(0);

    finishWalk?.();
    const end = Date.now() + 5000;
    while (placed() === 0 && Date.now() < end) await tick();
    expect(placed()).toBeGreaterThan(0);
    stopDrawing();
  });
});
