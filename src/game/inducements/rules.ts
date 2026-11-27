import { type Team, matchTeamValue } from "../../types/Team";
import {
  Inducement,
  type InducementCatalogEntry,
  type InducementInventoryEntry,
  type InducementSelectionLine,
} from "../../types/Inducements";
import { inducementCatalog } from "./catalog";
import { type MatchType } from "../variants/gameTypes";

export interface InducementValidationResult {
  valid: boolean;
  errors: string[];
  totalCost: number;
}

export function calculateInducementBudgets(
  teamA: Team,
  teamB: Team
): Record<string, number> {
  const tvA = matchTeamValue(teamA);
  const tvB = matchTeamValue(teamB);
  const pettyCash = (team: Team, own: number, other: number) =>
    team.advancementMode === "matched-play" ? 0 : Math.max(0, other - own);
  return {
    [teamA.id]: pettyCash(teamA, tvA, tvB),
    [teamB.id]: pettyCash(teamB, tvB, tvA),
  };
}

export function affordsInducement(
  catalog: InducementCatalogEntry[],
  budget: number
): boolean {
  return catalog.some((entry) => entry.maxCount > 0 && entry.price <= budget);
}

function catalogEntry(
  catalog: InducementCatalogEntry[],
  inducement: Inducement
): InducementCatalogEntry | undefined {
  return catalog.find((entry) => entry.inducement === inducement);
}

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
        `quantity-exceeds-limit:${line.inducement}:${String(line.quantity)}>${String(entry.maxCount)}`
      );
      continue;
    }
    totalCost += entry.price * line.quantity;
  }

  if (totalCost > budget) {
    errors.push(`budget-exceeded:${String(totalCost)}>${String(budget)}`);
  }

  return { valid: errors.length === 0, errors, totalCost };
}

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

export function draftListInventory(
  team: Team,
  gameType: MatchType
): InducementInventoryEntry[] {
  if (team.advancementMode !== "matched-play") return [];
  return toInventoryEntries(
    inducementCatalog(team, gameType),
    team.id,
    team.draftInducements ?? []
  );
}
