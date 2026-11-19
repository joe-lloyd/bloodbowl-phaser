import { type CompetitionDoc, type CompetitionEntrant } from "./types";

export interface LegacySharedTeamRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  teamId: string;
}

export type LegacyEntrant = CompetitionEntrant & {
  source?: "shared" | "local";
  sharedTeamId?: string;
};

export interface RepointResult {
  entrant: CompetitionEntrant;

  verified: boolean;
}

function stripLegacyFields(entrant: LegacyEntrant): CompetitionEntrant {
  const copy = { ...entrant };
  delete copy.source;
  delete copy.sharedTeamId;
  return copy;
}

export function repointEntrant(
  entrant: LegacyEntrant,
  sharedTeams: readonly LegacySharedTeamRecord[]
): RepointResult {
  if (entrant.source !== "shared" || !entrant.sharedTeamId) {
    return { entrant: stripLegacyFields(entrant), verified: true };
  }

  const shared = sharedTeams.find(
    (record) => record.id === entrant.sharedTeamId
  );
  const base = stripLegacyFields(entrant);
  if (!shared) {
    return { entrant: base, verified: false };
  }

  return {
    entrant: {
      ...base,
      teamId: shared.teamId,
      ownerUid: shared.ownerUid,
      coachName: base.coachName ?? shared.ownerName,
    },
    verified: true,
  };
}

export interface RepointCompetitionResult {
  doc: CompetitionDoc;

  unresolved: string[];
}

export function repointCompetitionEntrants(
  doc: CompetitionDoc,
  sharedTeams: readonly LegacySharedTeamRecord[]
): RepointCompetitionResult {
  const unresolved: string[] = [];
  const entrants = doc.entrants.map((entrant) => {
    const result = repointEntrant(entrant, sharedTeams);
    if (!result.verified) unresolved.push(result.entrant.id);
    return result.entrant;
  });
  return { doc: { ...doc, entrants }, unresolved };
}
