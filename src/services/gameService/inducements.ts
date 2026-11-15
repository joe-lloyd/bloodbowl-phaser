/**
 * Pregame inducements: the negotiation both coaches confirm, and committing
 * what they bought into the match.
 */

import {
  calculateInducementBudgets,
  draftListInventory as teamDraftList,
} from "@/game/inducements/rules";
import { sevensInducementCatalog } from "@/game/inducements/catalog";
import { InducementSession } from "@/game/inducements/InducementSession";
import { captainVacancyCandidates } from "@/game/rules/teamCaptain";
import {
  AppointTeamCaptainOperation,
  ResolvePregameInducementsOperation,
  getMatchInducements,
} from "@/game/inducements/matchInducements";
import {
  buildSeventsInducementProfile,
  emptyInducementsState,
  Inducement,
  InducementInventoryEntry,
  InducementOffer,
  InducementRuleProfile,
} from "@/types/Inducements";
import { resumeApothecaryDecision } from "@/game/inducements/apothecary";
import type { GameParts } from "./parts";

/** Commit a confirmed pregame inducement selection into match state. */
export function commitInducements(
  parts: GameParts,
  profile: InducementRuleProfile,
  budgets: Record<string, number>,
  inventory: InducementInventoryEntry[]
): void {
  const { state, team1, team2 } = parts;
  state.inducements = {
    ...emptyInducementsState(),
    ...state.inducements,
    profile,
    budgets: { ...budgets },
    inventory: inventory.map((entry) => ({ ...entry })),
  };
  // A league team that lost its Team Captain appoints a new one first.
  if (
    state.paysWinnings &&
    [team1, team2].some((team) => captainVacancyCandidates(team).length > 0)
  ) {
    parts.flowManager.add(new AppointTeamCaptainOperation());
  }
  // Prayers and Desperate Measures are rolled once, before the first
  // set-up (L4, L5).
  const rollsOnTables = inventory.some(
    (entry) =>
      entry.inducement === Inducement.PRAYERS_TO_NUFFLE ||
      entry.inducement === Inducement.DESPERATE_MEASURES
  );
  if (rollsOnTables && !getMatchInducements(state).rolled) {
    parts.flowManager.add(new ResolvePregameInducementsOperation());
  }
}

/** Both teams' Matched Play draft-list inducements (MP2). */
export function draftListInventory(parts: GameParts) {
  return [...teamDraftList(parts.team1), ...teamDraftList(parts.team2)];
}

/**
 * The pregame inducement negotiation, held by GameService (not in the
 * browser or the headless protocol layer) so local, online-host, and
 * headless callers all validate against the exact same authoritative
 * session regardless of which surface drives it.
 */
export function session(parts: GameParts): InducementSession {
  if (!parts.inducementSession) {
    const profile = buildSeventsInducementProfile({ advancedLeague: false });
    const budgets = calculateInducementBudgets(parts.team1, parts.team2);
    parts.inducementSession = new InducementSession(profile, budgets, {
      [parts.team1.id]: sevensInducementCatalog(parts.team1),
      [parts.team2.id]: sevensInducementCatalog(parts.team2),
    });
  }
  return parts.inducementSession;
}

export function inducementOffer(parts: GameParts): InducementOffer {
  const { team1, team2 } = parts;
  const negotiation = session(parts);
  return {
    profile: negotiation.getProfile(),
    budgets: negotiation.getBudgets(),
    catalogs: negotiation.getCatalogs(),
    selections: {
      [team1.id]: negotiation.getSelection(team1.id),
      [team2.id]: negotiation.getSelection(team2.id),
    },
    confirmed: {
      [team1.id]: negotiation.isConfirmed(team1.id),
      [team2.id]: negotiation.isConfirmed(team2.id),
    },
  };
}

/** Confirm a team's pregame selection; commits the inventory once both have. */
export function confirmInducements(
  parts: GameParts,
  teamId: string
): { ok: boolean; errors: string[] } {
  const negotiation = session(parts);
  const result = negotiation.confirm(teamId);
  if (!result.ok) return result;
  if (negotiation.bothConfirmed([parts.team1.id, parts.team2.id])) {
    parts.game.commitInducements(
      negotiation.getProfile(),
      negotiation.getBudgets(),
      [...draftListInventory(parts), ...negotiation.toInventory()]
    );
  }
  return result;
}

/**
 * Inducements already settled when the match is built. Matched Play
 * inducements come on the draft list (MP2): there is no petty cash to
 * negotiate, so they are in the match from the start. A restored save may
 * still have an unresolved Apothecary decision — the operation that
 * requested it is long gone, so re-arm the decision channel directly
 * rather than trying to resume a suspended await.
 */
export function restoreMatchInducements(parts: GameParts): void {
  const draftList = draftListInventory(parts);
  if (!parts.state.inducements && draftList.length > 0) {
    parts.game.commitInducements(
      buildSeventsInducementProfile({ advancedLeague: false }),
      calculateInducementBudgets(parts.team1, parts.team2),
      draftList
    );
  }

  const pendingApothecary = parts.state.inducements?.pendingApothecaryDecision;
  if (pendingApothecary) {
    resumeApothecaryDecision(parts.game, parts.eventBus, pendingApothecary);
  }
}
