import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames, AllEvents } from "../../src/types/events";
import { DiceLog } from "../../src/ui/components/hud/DiceLog";
import {
  appendBallRoll,
  ballMovementText,
} from "../../src/ui/components/hud/ballMovementLog";

function roll(rollType: string, value = 5): AllEvents[GameEventNames.DiceRoll] {
  return {
    rollType,
    diceType: "1d8",
    description: `${rollType}: ${value}`,
    value,
    total: value,
  };
}

it("groups repeated bounces and preserves every roll", () => {
  const first = appendBallRoll(null, roll("Bounce Direction"));
  const group = appendBallRoll(first, roll("Bounce Direction", 2));
  expect(group?.rolls).toHaveLength(2);
  expect(
    group && ballMovementText({ ...group, destination: { x: 9, y: 5 } })
  ).toBe("Ball bounced 2 squares, now at 9,5");
  expect(appendBallRoll(null, roll("Dodge"))).toBeNull();
});

it("groups deviation direction and distance without counting distance dice as squares", () => {
  const group = appendBallRoll(
    appendBallRoll(null, roll("Kickoff Deviate Direction")),
    roll("Kickoff Deviate Distance", 3)
  );
  expect(group?.rolls).toHaveLength(2);
  expect(
    group && ballMovementText({ ...group, destination: { x: 9, y: 5 } })
  ).toBe("Ball deviated 3 squares, now at 9,5");
});

it("renders one expandable ball movement with raw dice and a separate next action", async () => {
  const bus = new EventBus();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<DiceLog eventBus={bus} />));
    await act(async () => {
      bus.emit(GameEventNames.DiceRoll, roll("Bounce Direction"));
      bus.emit(GameEventNames.BallPlaced, { x: 8, y: 5 });
      bus.emit(GameEventNames.DiceRoll, roll("Bounce Direction", 2));
      bus.emit(GameEventNames.BallPlaced, { x: 9, y: 5 });
      bus.emit(GameEventNames.DiceRoll, roll("Dodge", 1));
    });
    expect(
      host.querySelectorAll('[data-testid="ball-movement-log"]')
    ).toHaveLength(1);
    const details = host.querySelector("details");
    expect(details?.querySelector("summary")?.textContent).toContain(
      "Ball bounced 2 squares, now at 9,5"
    );
    expect(details?.textContent).toContain("Bounce Direction: 5");
    expect(details?.textContent).toContain("Bounce Direction: 2");
    expect(host.textContent).toContain("Dodge");
  } finally {
    await act(async () => root.unmount());
  }
});

it("does not call a deviation followed by a bounce four bounced squares", () => {
  const deviation = appendBallRoll(
    appendBallRoll(null, roll("Kickoff Deviate Direction")),
    roll("Kickoff Deviate Distance", 3)
  );
  const group = appendBallRoll(deviation, roll("Bounce Direction"));
  expect(
    group && ballMovementText({ ...group, destination: { x: 9, y: 5 } })
  ).toBe("Ball moved, now at 9,5");
});

it("counts scatter steps and uses the resolved throw-in distance", () => {
  const scatter = appendBallRoll(null, {
    ...roll("Scatter"),
    value: [1, 2, 3],
  });
  expect(scatter && ballMovementText(scatter)).toBe("Ball scattered 3 squares");
  const thrown = appendBallRoll(
    appendBallRoll(null, roll("Throw-in Direction")),
    roll("Throw-in Distance", 4)
  );
  expect(
    thrown &&
      ballMovementText({ ...thrown, squares: 6, destination: { x: 9, y: 5 } })
  ).toBe("Ball thrown in 6 squares, now at 9,5");
});
