import type { GameSnapshot } from "../headless/serialization";
import { GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import type { InvariantViolation } from "./invariants";

interface Square {
  x: number;
  y: number;
}

function restingBalls(snapshot: GameSnapshot): Square[] {
  const airborne = snapshot.phase === GamePhase.KICKOFF && snapshot.kick !== undefined;
  const first = airborne ? null : snapshot.ballPosition;
  return [first, ...(snapshot.extraBalls ?? [])].filter(
    (square): square is Square => square !== null
  );
}

export function twoBallViolations(snapshot: GameSnapshot): InvariantViolation[] {
  const [first, second] = restingBalls(snapshot);
  if (!first || !second || first.x !== second.x || first.y !== second.y) return [];
  const at = `(${String(first.x)},${String(first.y)})`;
  const holder = snapshot.teams
    .flatMap(({ players }) => players)
    .find(
      ({ position, status }) =>
        status === PlayerStatus.ACTIVE &&
        position?.x === first.x &&
        position.y === first.y
    );
  const shared = { rule: "balls-share-square", message: `both balls rest on ${at}` };
  if (!holder) return [shared];
  return [
    shared,
    { rule: "player-holds-two-balls", message: `${holder.id} holds both balls at ${at}` },
  ];
}
