/**
 * Sevens inducement budgeting and purchase validation — the authoritative
 * rules a pregame offer is built from and confirmed selections are checked
 * against. Pure functions: no engine/state dependency, so the browser,
 * headless, and online lobby all validate identically against the same
 * catalogue.
 */

import { Team, calculateTeamValue } from "../../types/Team";
import {
  Inducement,
  InducementCatalogEntry,
  InducementInventoryEntry,
  InducementSelectionLine,
} from "../../types/Inducements";
import { sevensInducementCatalog } from "./catalog";

export interface InducementValidationResult {
  valid: boolean;
  errors: string[];
  totalCost: number;
}

/**
 * Petty cash: the lower-TV team's coach receives gold equal to the TV gap to
 * spend on inducements; the higher-TV (or equal) team receives none. A
 * Matched Play team never gets petty cash (MP2): it buys inducements from
 * its draft budget instead. Budgets are resolved once, from both teams' TV
 * at confirmation time, and serialized verbatim rather than re-derived later.
 */
export function calculateInducementBudgets(
  teamA: Team,
  teamB: Team
): Record<string, number> {
  const tvA = calculateTeamValue(teamA);
  const tvB = calculateTeamValue(teamB);
  const pettyCash = (team: Team, own: number, other: number) =>
    team.advancementMode === "matched-play" ? 0 : Math.max(0, other - own);
  return {
    [teamA.id]: pettyCash(teamA, tvA, tvB),
    [teamB.id]: pettyCash(teamB, tvB, tvA),
  };
}

function catalogEntry(
  catalog: InducementCatalogEntry[],
  inducement: Inducement
): InducementCatalogEntry | undefined {
  return catalog.find((entry) => entry.inducement === inducement);
}

/**
 * Validate a full selection (every requested line) against a team's
 * catalogue and a resolved budget. Runs identically whether the caller is a
 * trusted local UI or a submitted online/headless confirmation.
 */
export function validateInducementSelection(
  catalog: InducementCatalogEntry[],
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
    const entry = catalogEntry(catalog, line.inducement);
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
  catalog: InducementCatalogEntry[],
  ownerTeamId: string,
  selection: InducementSelectionLine[]
): InducementInventoryEntry[] {
  const entries: InducementInventoryEntry[] = [];
  for (const line of selection) {
    if (line.quantity <= 0) continue;
    const entry = catalogEntry(catalog, line.inducement);
    if (!entry) continue;
    entries.push({
      inducement: line.inducement,
      ownerTeamId,
      quantity: line.quantity,
      remainingUses: line.quantity,
      price: entry.price * line.quantity,
      provenance: "purchased",
    });
  }
  return entries;
}

/**
 * A Matched Play team's inducements bought onto its draft list (MP2). They
 * come with the team to every match, so each match starts them fresh.
 */
export function draftListInventory(team: Team): InducementInventoryEntry[] {
  if (team.advancementMode !== "matched-play") return [];
  return toInventoryEntries(
    sevensInducementCatalog(team),
    team.id,
    team.draftInducements ?? []
  );
}
