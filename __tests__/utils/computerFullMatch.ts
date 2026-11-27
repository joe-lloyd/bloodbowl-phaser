import { afterEach, describe, expect, it } from "vitest";
import { whenEngineQuiet } from "../../src/game/core/GameFlowManager";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { type HeadlessCommand } from "../../src/headless/protocol";
import { createComputerMatch } from "../../src/network/ComputerMatch";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { enumerateDecision } from "../../src/simulation/candidates";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { createLineupTeam } from "../../src/simulation/lineups";
import { createCoachRng } from "../../src/simulation/rng";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { RosterName } from "../../src/types/Team";
import { confirmComputerPregame } from "./computerPregame";

let match: OnlineMatch | null = null;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function sendHumanCommands(
  online: OnlineMatch,
  commands: readonly HeadlessCommand[]
): Promise<{ sent: number; refused: boolean }> {
  let sent = 0;
  for (const command of commands) {
    const response = await online.run(command);
    sent++;
    if (!response.ok) return { sent, refused: true };
  }
  return { sent, refused: false };
}

function acknowledgeBounces(bus: EventBus): void {
  bus.on(GameEventNames.PassFumbled, ({ presentationId }) => {
    if (presentationId)
      bus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: presentationId,
      });
  });
}

export function describeFullMatch(firstKicker: "human" | "computer"): void {
  afterEach(() => {
    match?.close();
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
  });

  describe("a match against the computer", () => {
    it(`plays to full time when the ${firstKicker} kicks first`, async () => {
      const team1 = stabilizeIds(
        createLineupTeam(RosterName.HUMAN, "Reavers", 0xcc0000),
        "team1"
      );
      const team2 = stabilizeIds(
        createLineupTeam(RosterName.ORC, "Gouged Eye", 0x0000cc),
        "team2"
      );
      const eventBus = new EventBus();
      acknowledgeBounces(eventBus);
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
      await confirmComputerPregame(match);

      await match.run({
        type: "start-setup",
        kickingTeamId: firstKicker === "human" ? team1.id : team2.id,
      });

      const game = fixtureValue(globalThis.__computerMatch).game;
      const rng = createCoachRng(5);
      let humanCommands = 0;
      let refused = 0;
      for (let i = 0; i < 40_000; i++) {
        await whenEngineQuiet();
        const snapshot = game.snapshot();
        if (snapshot.phase === GamePhase.GAME_OVER) break;
        if (
          !match.mayAct() ||
          (snapshot.phase === GamePhase.KICKOFF &&
            !game.pendingDecision() &&
            game.ctx.gameService.getState().kick)
        ) {
          await tick();
          continue;
        }
        const receiver =
          snapshot.activeTeamId === team1.id ? team2.id : team1.id;
        const kicker = snapshot.phase === GamePhase.KICKOFF ? receiver : null;
        const point = await enumerateDecision(game, kicker);

        expect(point.teamId).toBe(team1.id);
        const { index } = await heuristicCoach.choose({
          game,
          snapshot,
          point,
          rng,
        });
        const outcome = await sendHumanCommands(
          match,
          fixtureValue(point.candidates[index]).commands
        );
        humanCommands += outcome.sent;
        if (outcome.refused) refused++;
      }

      const final = game.snapshot();
      expect(final.phase).toBe(GamePhase.GAME_OVER);
      expect(humanCommands).toBeGreaterThan(50);
      expect(refused).toBe(0);

      expect(computerActivations).toBeGreaterThan(20);
    }, 120_000);
  });
}
