import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KickoffTableDialog } from "../../src/ui/components/hud/KickoffTableDialog";

/** The Kick-off Table dialog, mounted on its own bus. */
describe("KickoffTableDialog", () => {
  let container: HTMLDivElement;
  let root: Root;
  let bus: EventBus;
  const dialog = () =>
    container.querySelector('[data-testid="kickoff-table-dialog"]');

  beforeEach(async () => {
    bus = new EventBus();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<KickoffTableDialog eventBus={bus} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("waits for Roll, then answers the engine's gate", async () => {
    const answers: string[] = [];
    bus.on(GameEventNames.UI_PresentationAcknowledged, ({ id }) =>
      answers.push(id)
    );
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-1",
        kickingTeamId: "team1",
      });
    });
    const roll = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "ROLL KICK-OFF"
    );
    expect(dialog()).not.toBeNull();
    expect(answers).toEqual([]);

    await act(async () => roll!.click());
    expect(answers).toEqual(["kickoff-ready-1"]);
  });

  it("never opens for a kick an online page replays while catching up", async () => {
    // Replayed without pacing: the whole kick-off runs before React renders
    await act(async () => {
      bus.emit(GameEventNames.KickoffTableReady, {
        presentationId: "kickoff-ready-2",
        kickingTeamId: "team1",
      });
      bus.emit(GameEventNames.DiceRoll, {
        rollType: "Kickoff Event",
        diceType: "2d6",
        value: [1, 2],
        total: 3,
        description: "Kickoff Event: 1 + 2 = 3",
      });
      bus.emit(GameEventNames.KickoffTableRolled, {
        presentationId: "kickoff-table-2",
        roll: 3,
        event: KickoffEvent.TIME_OUT,
      });
      bus.emit(GameEventNames.KickoffResult, {
        roll: 3,
        event: KickoffEvent.TIME_OUT,
        meaning: "",
        outcome: { event: KickoffEvent.TIME_OUT, meaning: "", perTeam: {} },
      });
    });

    expect(dialog()).toBeNull();
  });
});
