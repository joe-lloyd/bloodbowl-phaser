import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { TurnIndicator } from "../../src/ui/components/hud/TurnIndicator";
import { GamePhase } from "../../src/types/GameState";

async function render(phase: GamePhase, turnNumber: number | null) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<TurnIndicator phase={phase} turnNumber={turnNumber} />);
  });
  const text = container.textContent;
  await act(async () => root.unmount());
  return text;
}

describe("TurnIndicator", () => {
  it("shows HALF TIME between the halves, not the last turn", async () => {
    expect(await render(GamePhase.HALFTIME, 6)).toBe("HALF TIME");
    expect(await render(GamePhase.HALFTIME, null)).toBe("HALF TIME");
  });

  it("shows the turn of the half during play and SETUP during setup", async () => {
    expect(await render(GamePhase.PLAY, 3)).toBe("Turn 3 of 6");
    expect(await render(GamePhase.SETUP, 3)).toBe("SETUP");
  });
});
