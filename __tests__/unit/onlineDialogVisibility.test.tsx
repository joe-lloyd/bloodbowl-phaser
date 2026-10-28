import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import {
  OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { RerollDialog } from "../../src/ui/components/hud/RerollDialog";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";
import { BlockRollData } from "../../src/services/BlockResolutionService";

/**
 * Online, a decision prompt belongs on its owner's screen only; the block
 * dice belong on both, so the other coach sees the roll and the pick.
 */
describe("online dialogs", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;
  let mayAct = true;
  let team1Ids: string[];
  let team2Ids: string[];

  beforeEach(() => {
    const game = new HeadlessGame({ seed: 1 });
    eventBus = new EventBus();
    ServiceContainer.initialize(eventBus, game.ctx.team1, game.ctx.team2);
    team1Ids = game.ctx.team1.players.map((p) => p.id);
    team2Ids = game.ctx.team2.players.map((p) => p.id);
    setActiveOnlineMatch({ mayAct: () => mayAct } as OnlineMatch);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
  });

  const askReroll = () =>
    eventBus.emit(GameEventNames.DecisionRequested, {
      type: "reroll",
      playerId: team1Ids[0],
      chooserTeamId: "team1",
      rollKind: "dodge",
      sources: ["team"],
      roll: 1,
    } as never);

  it("shows a re-roll prompt to the coach who rolled it", async () => {
    mayAct = true;
    await act(async () => root.render(<RerollDialog eventBus={eventBus} />));
    await act(async () => askReroll());
    expect(container.textContent).toContain("Re-roll");
  });

  it("does not show it on the other coach's screen", async () => {
    mayAct = false;
    await act(async () => root.render(<RerollDialog eventBus={eventBus} />));
    await act(async () => askReroll());
    expect(container.innerHTML).toBe("");
  });

  it("shows the other coach's block dice and then the face they picked", async () => {
    mayAct = false;
    await act(async () => root.render(<BlockDiceDialog eventBus={eventBus} />));
    const roll = {
      attackerId: team1Ids[0],
      defenderId: team2Ids[0],
      numDice: 2,
      isAttackerChoice: true,
      results: [{ type: "pow" }, { type: "skull" }],
    } as unknown as BlockRollData;
    await act(async () => eventBus.emit(GameEventNames.BlockDiceRolled, roll));
    expect(container.innerHTML).toContain("block-dice-dialog");
    // The dice are thrown first; the faces follow once they come to rest
    // (here at once, as the test page has no WebGL to throw them with)
    for (
      let i = 0;
      i < 60 && !container.textContent?.includes("The other coach is choosing");
      i++
    ) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    }
    expect(container.textContent).toContain("The other coach is choosing");

    await act(async () =>
      eventBus.emit(GameEventNames.DecisionResolved, {
        type: "block-dice",
        result: "pow",
      })
    );
    expect(container.textContent).toContain("Chosen: POW");

    await act(async () => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(container.innerHTML).toBe("");
  });
});
