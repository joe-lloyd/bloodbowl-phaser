import { AllEvents, GameEventNames } from "../../../types/events";

type Roll = AllEvents[GameEventNames.DiceRoll];
type Movement = "bounced" | "scattered" | "deviated" | "thrown in";
export interface BallMovement {
  kind: "ball";
  /** What moved: the ball, or a thrown team-mate */
  subject: "Ball" | "Team-mate";
  movement: Movement;
  squares: number;
  mixed?: boolean;
  destination?: { x: number; y: number };
  rolls: Roll[];
}

function movementFor(roll: Roll): Movement | null {
  if (/^(Kickoff )?Deviat/i.test(roll.rollType)) return "deviated";
  if (/^Bounce( Direction)?$/i.test(roll.rollType)) return "bounced";
  if (/^(Team-mate )?Scatter/i.test(roll.rollType)) return "scattered";
  if (/^Throw-in (Direction|Distance)$/i.test(roll.rollType))
    return "thrown in";
  return null;
}

/** Consecutive ball rolls form a single expandable result. Never consumes RNG. */
export function appendBallRoll(
  previous: BallMovement | null,
  roll: Roll
): BallMovement | null {
  const movement = movementFor(roll);
  if (!movement) return null;
  const group: BallMovement = previous ?? {
    kind: "ball",
    subject: /^Team-mate/i.test(roll.rollType) ? "Team-mate" : "Ball",
    movement,
    squares: 0,
    rolls: [],
  };
  const squares = /Distance/i.test(roll.rollType)
    ? roll.total
    : movement === "bounced"
      ? group.squares + 1
      : movement === "scattered"
        ? group.squares + (Array.isArray(roll.value) ? roll.value.length : 1)
        : group.squares;
  return {
    ...group,
    movement,
    squares,
    mixed: group.mixed || group.movement !== movement,
    rolls: [...group.rolls, roll],
  };
}

export function ballMovementText(group: BallMovement): string {
  const distance =
    !group.mixed && group.squares
      ? ` ${group.squares} ${group.squares === 1 ? "square" : "squares"}`
      : "";
  const destination = group.destination
    ? `, now at ${group.destination.x},${group.destination.y}`
    : "";
  return `${group.subject} ${group.mixed ? "moved" : group.movement}${distance}${destination}`;
}
