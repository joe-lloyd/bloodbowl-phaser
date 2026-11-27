import { rivalsOf, type Seating } from "../seating";

export interface TurnSpend {
  readonly blitzed: readonly string[];
  readonly fouled: readonly string[];
  readonly passes: number;
  readonly handOffs: number;
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

const BALLS_IN_PLAY = 1;

export function freshSpend(): TurnSpend {
  return { blitzed: [], fouled: [], passes: 0, handOffs: 0 };
}

function spentTargets(ledger: TurnSpend, kind: Targeted): readonly string[] {
  return kind === "blitz" ? ledger.blitzed : ledger.fouled;
}

export function maySpend(ledger: TurnSpend, declaration: Declaration): boolean {
  if ("against" in declaration) {
    return !spentTargets(ledger, declaration.kind).includes(declaration.against);
  }
  const used = declaration.kind === "pass" ? ledger.passes : ledger.handOffs;
  return used < BALLS_IN_PLAY;
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
    blitzed: wire.hasBlitzed ? [...rivals] : [],
    fouled: wire.hasFouled ? [...rivals] : [],
    passes: wire.hasPassed ? 1 : 0,
    handOffs: wire.hasHandedOff ? 1 : 0,
  };
}
