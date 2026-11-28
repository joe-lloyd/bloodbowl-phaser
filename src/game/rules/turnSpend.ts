import { rivalsOf, type Seating } from "../seating";
import { activeRules } from "../variants/activeMatch";
import type { BallId } from "./balls";

export interface TurnSpend {
  readonly blitzed: readonly string[];
  readonly fouled: readonly string[];
  readonly passes: number;
  readonly handOffs: number;
  readonly passedBalls: readonly BallId[];
  readonly handedOffBalls: readonly BallId[];
  readonly thrownIds: readonly string[];
}

type Targeted = "blitz" | "foul";
type Counted = "pass" | "handoff";

export type Declaration =
  | { readonly kind: Targeted; readonly against: string }
  | { readonly kind: Counted };

export interface SpendWire {
  hasBlitzed: boolean;
  hasPassed: boolean;
  hasHandedOff: boolean;
  hasFouled: boolean;
  spend?: TurnSpend;
}

export function freshSpend(): TurnSpend {
  return {
    blitzed: [],
    fouled: [],
    passes: 0,
    handOffs: 0,
    passedBalls: [],
    handedOffBalls: [],
    thrownIds: [],
  };
}

function spentTargets(ledger: TurnSpend, kind: Targeted): readonly string[] {
  return kind === "blitz" ? ledger.blitzed : ledger.fouled;
}

export function maySpend(ledger: TurnSpend, declaration: Declaration): boolean {
  if ("against" in declaration) {
    return !spentTargets(ledger, declaration.kind).includes(declaration.against);
  }
  const used = declaration.kind === "pass" ? ledger.passes : ledger.handOffs;
  return used < activeRules().format.ballCount;
}

export function openTargets(
  ledger: TurnSpend,
  rivals: readonly string[],
  kind: Targeted
): readonly string[] {
  return rivals.filter((against) => maySpend(ledger, { kind, against }));
}

export function spend(ledger: TurnSpend, declaration: Declaration): TurnSpend {
  switch (declaration.kind) {
    case "blitz":
      return { ...ledger, blitzed: [...ledger.blitzed, declaration.against] };
    case "foul":
      return { ...ledger, fouled: [...ledger.fouled, declaration.against] };
    case "pass":
      return { ...ledger, passes: ledger.passes + 1 };
    case "handoff":
      return { ...ledger, handOffs: ledger.handOffs + 1 };
  }
}

function movedBalls(ledger: TurnSpend, kind: Counted): readonly BallId[] {
  return kind === "pass" ? ledger.passedBalls : ledger.handedOffBalls;
}

export function ballMoved(ledger: TurnSpend, kind: Counted, ball: BallId): boolean {
  return movedBalls(ledger, kind).includes(ball);
}

export function moveBall(ledger: TurnSpend, kind: Counted, ball: BallId): TurnSpend {
  const moved = [...movedBalls(ledger, kind), ball];
  return kind === "pass"
    ? { ...ledger, passedBalls: moved }
    : { ...ledger, handedOffBalls: moved };
}

export function throwPlayer(ledger: TurnSpend, playerId: string): TurnSpend {
  return { ...ledger, thrownIds: [...ledger.thrownIds, playerId] };
}

export function outsideTarget(
  active: { readonly against?: string } | null,
  teamId: string
): boolean {
  return active?.against !== undefined && active.against !== teamId;
}

export function targetOf(
  seating: Seating,
  moverTeamId: string,
  against: string | undefined
): string | undefined {
  if (against !== undefined) return against;
  const [only, ...more] = rivalsOf(seating, moverTeamId);
  return more.length === 0 ? only?.team.id : undefined;
}

export function spendToWire(ledger: TurnSpend, seats: number): SpendWire {
  return {
    hasBlitzed: ledger.blitzed.length > 0,
    hasPassed: ledger.passes > 0,
    hasHandedOff: ledger.handOffs > 0,
    hasFouled: ledger.fouled.length > 0,
    ...(seats > 2 && { spend: structuredClone(ledger) }),
  };
}

export function spendFromWire(
  wire: SpendWire,
  rivals: readonly string[]
): TurnSpend {
  if (wire.spend) return structuredClone(wire.spend);
  return {
    ...freshSpend(),
    blitzed: wire.hasBlitzed ? [...rivals] : [],
    fouled: wire.hasFouled ? [...rivals] : [],
    passes: wire.hasPassed ? 1 : 0,
    handOffs: wire.hasHandedOff ? 1 : 0,
  };
}
