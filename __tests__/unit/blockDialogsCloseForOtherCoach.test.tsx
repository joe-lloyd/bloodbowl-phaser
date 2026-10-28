import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { Scenario } from "../../src/types/Scenario";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";
import { FollowUpDialog } from "../../src/ui/components/hud/FollowUpDialog";

/**
 * Online, the block dice and the follow-up prompt reach both coaches, and
 * only one of them answers. On the other coach's screen these dialogs used
 * to stay open for the rest of the match. A block played by the engine must
 * close them there too.
 */
const scenario: Scenario = {
  id: "block-dialogs-close",
  name: "Block next to a defender",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 7, y: 5, stats: { ST: 4 } },
      { playerIndex: 1, x: 2, y: 9 },
    ],
    team2Placements: [{ playerIndex: 0, x: 8, y: 5, stats: { ST: 2 } }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
});

describe("block dialogs on the other coach's screen", () => {
  it("close once the engine settles the block and the follow-up", async () => {
    for (let seed = 1; seed < 40; seed++) {
      const game = new HeadlessGame({ scenario, seed });
      const [attacker] = game.ctx.team1.players;
      const [defender] = game.ctx.team2.players;

      container?.remove();
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      const bus = game.ctx.eventBus as never;
      await act(async () =>
        root!.render(
          <>
            <BlockDiceDialog eventBus={bus} />
            <FollowUpDialog eventBus={bus} />
          </>
        )
      );

      await game.execute({
        type: "declare-action",
        playerId: attacker.id,
        action: "block",
      });
      const rolled = await game.execute({
        type: "block",
        attackerId: attacker.id,
        defenderId: defender.id,
      });
      if (rolled.pendingDecision?.type !== "block-dice") continue;
      const push = rolled.pendingDecision.options.findIndex(
        (option) => option.type === "push"
      );
      if (push < 0) continue;

      // The dialog as the other coach's page shows it, from the replayed event
      await act(async () =>
        game.ctx.eventBus.emit(GameEventNames.UI_BlockDialog, {
          attackerId: attacker.id,
          defenderId: defender.id,
          analysis: { diceCount: 2, isUphill: false } as never,
        })
      );
      expect(container.innerHTML).not.toBe("");

      let response = await act(async () =>
        game.execute({ type: "choose-block-result", index: push })
      );
      expect(container.innerHTML).toBe("");

      if (response.pendingDecision?.type === "push-direction") {
        const [direction] = response.pendingDecision.options;
        response = await act(async () =>
          game.execute({ type: "choose-push-direction", ...direction })
        );
      }
      if (response.pendingDecision?.type !== "follow-up") continue;
      const { targetSquare } = response.pendingDecision;
      await act(async () =>
        game.ctx.eventBus.emit(GameEventNames.UI_FollowUpPrompt, {
          attackerId: attacker.id,
          targetSquare,
        })
      );
      expect(container.innerHTML).not.toBe("");

      await act(async () =>
        game.execute({ type: "choose-follow-up", followUp: false })
      );
      expect(container.innerHTML).toBe("");
      return;
    }
    throw new Error("no seed gave a push with a follow-up");
  });
});
