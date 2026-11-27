import {
  buyOrder,
  isPregameOpening,
  shoppingTeamId,
} from "@/game/inducements/pregame";
import { GameEventNames } from "@/types/events";

import {
  affordsInducement,
  calculateInducementBudgets,
  draftListInventory as teamDraftList,
} from "@/game/inducements/rules";
import {
  inducementCatalog,
  startingFreeInducements,
} from "@/game/inducements/catalog";
import {
  PreDriveInducementsOperation,
  holdsDriveInducements,
} from "@/game/inducements/driveInducements";
import { activeMatchFormat } from "@/game/variants/activeMatch";
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
  type InducementInventoryEntry,
  type InducementOffer,
  type InducementRuleProfile,
} from "@/types/Inducements";
import { resumeApothecaryDecision } from "@/game/inducements/apothecary";
import type { GameParts } from "./parts";
import { matchTeamValue } from "@/types/Team";
import { grantFreePotion } from "@/game/inducements/inventory";

export function commitInducements({
  parts,
  profile,
  budgets,
  inventory,
}: {
  parts: GameParts;
  profile: InducementRuleProfile;
  budgets: Record<string, number>;
  inventory: InducementInventoryEntry[];
}): void {
  const { state, team1, team2 } = parts;
  if (state.pregameInducements) state.pregameInducements.resolving = true;
  state.inducements = {
    ...emptyInducementsState(),
    ...state.inducements,
    profile,
    budgets: { ...budgets },
    inventory: inventory.map((entry) => ({ ...entry })),
  };
  for (const kind of startingFreeInducements(activeMatchFormat().gameType))
    for (const team of [team1, team2]) grantFreePotion(state, team.id, kind);

  if (
    state.paysWinnings &&
    [team1, team2].some((team) => captainVacancyCandidates(team).length > 0)
  ) {
    parts.flowManager.add(new AppointTeamCaptainOperation());
  }

  const rollsOnTables = inventory.some(
    (entry) =>
      entry.inducement === Inducement.PRAYERS_TO_NUFFLE ||
      entry.inducement === Inducement.DESPERATE_MEASURES
  );
  if (rollsOnTables && !getMatchInducements(state).rolled) {
    parts.flowManager.add(new ResolvePregameInducementsOperation());
  }
  if (holdsDriveInducements(state, [team1, team2])) {
    parts.flowManager.add(new PreDriveInducementsOperation());
  }
  const pregame = state.pregameInducements;
  if (pregame) {
    parts.flowManager.add({
      name: "CompletePregameInducements",
      execute() {
        pregame.resolving = false;
        parts.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
        return Promise.resolve();
      },
    });
  }
}

function draftListInventory(parts: GameParts) {
  const { gameType } = activeMatchFormat();
  return [
    ...teamDraftList(parts.team1, gameType),
    ...teamDraftList(parts.team2, gameType),
  ];
}

function session(parts: GameParts): InducementSession {
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
    const { gameType } = activeMatchFormat();
    parts.inducementSession = new InducementSession(profile, budgets, {
      [parts.team1.id]: inducementCatalog(parts.team1, gameType),
      [parts.team2.id]: inducementCatalog(parts.team2, gameType),
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

function purchaseError(parts: GameParts, teamId: string): string | undefined {
  if (![parts.team1.id, parts.team2.id].includes(teamId)) return "unknown-team";
  const pregame = parts.state.pregameInducements;
  if (!pregame) return undefined;
  if (pregame.complete) return "inducements-already-confirmed";
  if ([parts.team1.id, parts.team2.id].some((id) => pregame.ready[id] !== true))
    return "teams-not-ready";
  if (!isPregameOpening(parts.state)) return "pregame-finished";
  if (shoppingTeamId(pregame, [parts.team1.id, parts.team2.id]) !== teamId)
    return "not-your-turn-to-buy";
  return undefined;
}

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
    pregame.buyOrder = buyOrder(
      { id: parts.team1.id, value: matchTeamValue(parts.team1) },
      { id: parts.team2.id, value: matchTeamValue(parts.team2) }
    );
  }
  parts.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
  return { ok: true, errors: [] };
}

export function selectInducement({
  parts,
  teamId,
  inducement,
  quantity,
}: {
  parts: GameParts;
  teamId: string;
  inducement: Inducement;
  quantity: number;
}) {
  const error = purchaseError(parts, teamId);
  if (error) return { ok: false, errors: [error] };
  const negotiation = session(parts);
  const result = negotiation.select(teamId, inducement, quantity);
  if (result.ok && parts.state.pregameInducements) {
    parts.state.pregameInducements.offer = offerFor(parts, negotiation);
    parts.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
  }
  return result;
}

export function confirmInducements(
  parts: GameParts,
  teamId: string
): { ok: boolean; errors: string[] } {
  const pregame = parts.state.pregameInducements;
  if (![parts.team1.id, parts.team2.id].includes(teamId))
    return { ok: false, errors: ["unknown-team"] };

  if (pregame?.complete || pregame?.offer?.confirmed[teamId] === true)
    return { ok: true, errors: [] };
  const error = purchaseError(parts, teamId);
  if (error) return { ok: false, errors: [error] };
  const negotiation = session(parts);
  const result = negotiation.confirm(teamId);
  if (!result.ok) return result;
  recordConfirmations(parts, negotiation);
  return result;
}

function recordConfirmations(
  parts: GameParts,
  negotiation: InducementSession
): void {
  const pregame = parts.state.pregameInducements;
  if (pregame) pregame.offer = offerFor(parts, negotiation);
  if (negotiation.bothConfirmed([parts.team1.id, parts.team2.id])) {
    if (pregame) pregame.complete = true;
    parts.game.commitInducements(
      negotiation.getProfile(),
      negotiation.getBudgets(),
      [...draftListInventory(parts), ...negotiation.toInventory()]
    );
  }
  parts.eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
}

export function skipUnaffordableInducements(parts: GameParts): void {
  const pregame = parts.state.pregameInducements;
  if (!pregame?.offer || pregame.complete || !isPregameOpening(parts.state))
    return;
  const negotiation = session(parts);
  const broke = [parts.team1.id, parts.team2.id].filter(
    (teamId) =>
      !negotiation.isConfirmed(teamId) &&
      !affordsInducement(
        negotiation.getCatalogFor(teamId),
        negotiation.getBudgetFor(teamId)
      )
  );
  if (broke.length === 0) return;
  for (const teamId of broke) negotiation.confirm(teamId);
  recordConfirmations(parts, negotiation);
}

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
