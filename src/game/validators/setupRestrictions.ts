import type {
  SetupRestriction,
  ValidationResult,
} from "../../types/SetupTypes";

export const SHORT_HANDED_MESSAGE =
  "A team with fewer than three available players must place every player in Centre Field on its Line of Scrimmage.";

interface SetupFacts {
  placedCount: number;
  uniqueCount: number;
  requiredCount: number;
  maximumCount: number;
  configuredMaximum: number;
  availableCount: number;
  wideCounts: { top: number; bottom: number };
  onCentreLos: number;
  inNeutralZone: boolean;
  inSetupArea: boolean;
}

function areaRestrictions(facts: SetupFacts): SetupRestriction[] {
  return [
    {
      id: "neutral-zone",
      satisfied: !facts.inNeutralZone,
      satisfiable: true,
      message: "Neither team may set up between the Lines of Scrimmage.",
    },
    {
      id: "setup-area",
      satisfied: facts.inSetupArea,
      satisfiable: true,
      message:
        "Players must stay between their own End Zone and Line of Scrimmage.",
    },
    {
      id: "duplicate-square",
      satisfied: facts.uniqueCount === facts.placedCount,
      satisfiable: true,
      message: "Only one player may occupy a pitch square.",
    },
    {
      id: "max-seven",
      satisfied: facts.placedCount <= facts.maximumCount,
      satisfiable: true,
      message: `A maximum of ${String(facts.maximumCount)} players may be set up.`,
    },
  ];
}

function wideZoneRestriction({ wideCounts }: SetupFacts): SetupRestriction {
  return {
    id: "wide-zone-limit",
    summary: `Wide zones: at most 1 each (top ${String(wideCounts.top)}, bottom ${String(wideCounts.bottom)})`,
    wideZones: wideCounts,
    satisfied: wideCounts.top <= 1 && wideCounts.bottom <= 1,
    satisfiable: true,
    message: "Only one player may be set up in each Wide Zone.",
  };
}

function lineRestrictions(facts: SetupFacts): SetupRestriction[] {
  const shortHanded = facts.requiredCount < 3;
  return [
    {
      id: "line-of-scrimmage",
      summary: `Line of scrimmage ${String(facts.onCentreLos)}/3`,
      satisfied: facts.onCentreLos >= 3,
      satisfiable: facts.availableCount >= 3,
      message:
        "At least three players must stand in Centre Field directly adjacent to the Line of Scrimmage.",
    },
    {
      id: "short-handed-line",
      summary: `Line of scrimmage ${String(facts.onCentreLos)}/${String(facts.requiredCount)}`,
      satisfied:
        !shortHanded ||
        (facts.placedCount === facts.onCentreLos &&
          facts.onCentreLos === facts.requiredCount),
      satisfiable: shortHanded,
      message: SHORT_HANDED_MESSAGE,
    },
  ];
}

function countMessage(facts: SetupFacts): string {
  if (facts.maximumCount > facts.requiredCount)
    return `Swarming allows up to ${String(facts.maximumCount - facts.requiredCount)} additional Linemen; the confirmed formation stays in place.`;
  if (facts.requiredCount === facts.configuredMaximum)
    return `Set up exactly ${String(facts.configuredMaximum)} players; extras remain in Reserves.`;
  return `Set up all ${String(facts.requiredCount)} available players.`;
}

function countRestriction(facts: SetupFacts): SetupRestriction {
  return {
    id: "required-player-count",
    summary:
      facts.maximumCount > facts.requiredCount
        ? `Players placed ${String(facts.placedCount)} · allowed ${String(facts.requiredCount)} to ${String(facts.maximumCount)}`
        : `Players placed ${String(facts.placedCount)}/${String(facts.requiredCount)}`,
    satisfied:
      facts.placedCount >= facts.requiredCount &&
      facts.placedCount <= facts.maximumCount,
    satisfiable: true,
    message: countMessage(facts),
  };
}

export function setupRestrictions(facts: SetupFacts): SetupRestriction[] {
  return [
    ...areaRestrictions(facts),
    wideZoneRestriction(facts),
    ...lineRestrictions(facts),
    countRestriction(facts),
  ];
}

export function setupValidation(
  restrictions: SetupRestriction[]
): ValidationResult {
  const errors = restrictions
    .filter((rule) => rule.satisfiable && !rule.satisfied)
    .map((rule) => rule.message);
  return { valid: errors.length === 0, errors, restrictions };
}
