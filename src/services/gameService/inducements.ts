import { isPregameOpening, shoppingTeamId } from "@/game/inducements/pregame";
import { GameEventNames } from "@/types/events";
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
  if (state.pregameInducements) state.pregameInducements.resolving = true;
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
  if (state.pregameInducements) {
    parts.flowManager.add({
      name: "CompletePregameInducements",
      async execute() {
        state.pregameInducements!.resolving = false;
        parts.eventBus.emit(GameEventNames.UI_SyncBoard);
      },
    });
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
  const saved = parts.state.pregameInducements?.offer;
  if (saved)
    return new InducementSession(
      saved.profile,
      saved.budgets,
      saved.catalogs,
      saved
    );
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
  return offerFor(parts, session(parts));
}

function offerFor(
  parts: GameParts,
  negotiation: InducementSession
): InducementOffer {
  const { team1, team2 } = parts;
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

/** Reject purchases outside the ready, uncommitted opening. */
function purchaseError(parts: GameParts, teamId: string): string | undefined {
  if (![parts.team1.id, parts.team2.id].includes(teamId)) return "unknown-team";
  const pregame = parts.state.pregameInducements;
  if (!pregame) return undefined; // Existing headless scenarios and saves.
  if (pregame.complete) return "inducements-already-confirmed";
  if (![parts.team1.id, parts.team2.id].every((id) => pregame.ready[id]))
    return "teams-not-ready";
  if (!isPregameOpening(parts.state)) return "pregame-finished";
  if (shoppingTeamId(pregame, [parts.team1.id, parts.team2.id]) !== teamId)
    return "not-your-turn-to-buy";
  return undefined;
}

/** A coach readied up for the weather, which readies them for the match too. */
export function readyInducements(parts: GameParts, teamId: string) {
  const pregame = parts.state.pregameInducements;
  if (!pregame || ![parts.team1.id, parts.team2.id].includes(teamId))
    return { ok: false, errors: ["pregame-unavailable"] };
  if (pregame.complete || !isPregameOpening(parts.state))
    return { ok: false, errors: ["pregame-finished"] };
  pregame.ready[teamId] = true;
  if (
    [parts.team1.id, parts.team2.id].every((id) => pregame.ready[id]) &&
    !pregame.offer
  ) {
    parts.inducementSession = null;
    pregame.offer = offerFor(parts, session(parts));
  }
  parts.eventBus.emit(GameEventNames.UI_SyncBoard);
  return { ok: true, errors: [] };
}

export function selectInducement(
  parts: GameParts,
  teamId: string,
  inducement: Inducement,
  quantity: number
) {
  const error = purchaseError(parts, teamId);
  if (error) return { ok: false, errors: [error] };
  const negotiation = session(parts);
  const result = negotiation.select(teamId, inducement, quantity);
  if (result.ok && parts.state.pregameInducements) {
    parts.state.pregameInducements.offer = offerFor(parts, negotiation);
    parts.eventBus.emit(GameEventNames.UI_SyncBoard);
  }
  return result;
}

/** Confirm a team's pregame selection; commits the inventory once both have. */
export function confirmInducements(
  parts: GameParts,
  teamId: string
): { ok: boolean; errors: string[] } {
  const pregame = parts.state.pregameInducements;
  if (![parts.team1.id, parts.team2.id].includes(teamId))
    return { ok: false, errors: ["unknown-team"] };
  // Replayed or duplicate confirmation must not replenish spent inventory.
  if (pregame?.complete) return { ok: true, errors: [] };
  const error = purchaseError(parts, teamId);
  if (error) return { ok: false, errors: [error] };
  const negotiation = session(parts);
  const result = negotiation.confirm(teamId);
  if (!result.ok) return result;
  if (pregame) pregame.offer = offerFor(parts, negotiation);
  if (negotiation.bothConfirmed([parts.team1.id, parts.team2.id])) {
    if (pregame) pregame.complete = true;
    parts.game.commitInducements(
      negotiation.getProfile(),
      negotiation.getBudgets(),
      [...draftListInventory(parts), ...negotiation.toInventory()]
    );
  }
  parts.eventBus.emit(GameEventNames.UI_SyncBoard);
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
  if (
    !parts.state.pregameInducements &&
    !parts.state.inducements &&
    draftList.length > 0
  ) {
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
