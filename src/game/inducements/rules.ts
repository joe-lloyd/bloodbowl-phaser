/**
 * Sevens inducement budgeting and purchase validation — the authoritative
 * rules a pregame offer is built from and confirmed selections are checked
 * against. Pure functions: no engine/state dependency, so the browser,
 * headless, and online lobby all validate identically against the same
 * catalog (see design.md "Build offers from a competition rule profile").
 */

import { Team, calculateTeamValue } from "../../types/Team";
import {
  Inducement,
  InducementCatalogEntry,
  InducementInventoryEntry,
  InducementRuleProfile,
} from "../../types/Inducements";

/** One team's requested purchase — quantity 0 is legal (removes a line). */
export interface InducementSelectionLine {
  inducement: Inducement;
  quantity: number;
}

export interface InducementValidationResult {
  valid: boolean;
  errors: string[];
  totalCost: number;
}

/**
 * Petty cash: the lower-TV team's coach receives gold equal to the TV gap to
 * spend on inducements; the higher-TV (or equal) team receives none. Budgets
 * are resolved once, from both teams' TV at confirmation time, and
 * serialized verbatim rather than re-derived later.
 */
export function calculateInducementBudgets(
  teamA: Team,
  teamB: Team
): Record<string, number> {
  const tvA = calculateTeamValue(teamA);
  const tvB = calculateTeamValue(teamB);
  const gap = Math.abs(tvA - tvB);
  if (tvA === tvB) return { [teamA.id]: 0, [teamB.id]: 0 };
  return tvA < tvB
    ? { [teamA.id]: gap, [teamB.id]: 0 }
    : { [teamA.id]: 0, [teamB.id]: gap };
}

function catalogEntry(
  profile: InducementRuleProfile,
  inducement: Inducement
): InducementCatalogEntry | undefined {
  return profile.catalog.find((entry) => entry.inducement === inducement);
}

/**
 * Validate a full selection (every requested line) against the profile's
 * catalog and a resolved budget. Runs identically whether the caller is a
 * trusted local UI or a submitted online/headless confirmation — "Purchases
 * are validated again when confirmed" (design.md).
 */
export function validateInducementSelection(
  profile: InducementRuleProfile,
  budget: number,
  selection: InducementSelectionLine[]
): InducementValidationResult {
  const errors: string[] = [];
  let totalCost = 0;

  for (const line of selection) {
    if (line.quantity <= 0) continue;
    if (line.inducement === Inducement.STAR_PLAYER) {
      errors.push("star-players-unavailable-in-sevens");
      continue;
    }
    const entry = catalogEntry(profile, line.inducement);
    if (!entry) {
      errors.push(`inducement-not-offered:${line.inducement}`);
      continue;
    }
    if (line.quantity > entry.maxCount) {
      errors.push(
        `quantity-exceeds-limit:${line.inducement}:${line.quantity}>${entry.maxCount}`
      );
      continue;
    }
    totalCost += entry.price * line.quantity;
  }

  if (totalCost > budget) {
    errors.push(`budget-exceeded:${totalCost}>${budget}`);
  }

  return { valid: errors.length === 0, errors, totalCost };
}

/**
 * Turn a validated selection into match-scoped inventory entries. Callers
 * must validate first — this does not re-check budget/limits, only shapes
 * legal lines into inventory (so a rejected confirmation never reaches it).
 */
export function toInventoryEntries(
  profile: InducementRuleProfile,
  ownerTeamId: string,
  selection: InducementSelectionLine[]
): InducementInventoryEntry[] {
  const entries: InducementInventoryEntry[] = [];
  for (const line of selection) {
    if (line.quantity <= 0) continue;
    const entry = catalogEntry(profile, line.inducement);
    if (!entry) continue;
    entries.push({
      inducement: line.inducement,
      ownerTeamId,
      quantity: line.quantity,
      remainingUses: line.quantity,
      price: entry.price * line.quantity,
      provenance: "purchased",
      duration: entry.duration,
    });
  }
  return entries;
}

/** Reset drive-scoped inducement uses back to full quantity at a new drive. */
export function expireDriveInducements(
  inventory: InducementInventoryEntry[]
): InducementInventoryEntry[] {
  return inventory.map((entry) =>
    entry.duration === "drive"
      ? { ...entry, remainingUses: entry.quantity }
      : entry
  );
}
