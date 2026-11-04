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
