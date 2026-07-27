/**
 * One-time repointing of competition entrants that referenced the old
 * `shared-teams` publish collection, onto direct owner/team references
 * (overhaul-team-lifecycle-management, shared-team-library: "Any
 * competition entrant referencing a shared team document is repointed at
 * the underlying owner uid and team id before the sharedTeams collection is
 * deleted. An entrant whose underlying team no longer exists retains its
 * cached display fields so historical fixtures still render.")
 *
 * Pure and side-effect free — src/firebase/migrateSharedTeamEntrants.ts
 * wires this against real Firestore documents for an operator to run once,
 * before the `shared-teams` collection is deleted.
 */

import { CompetitionDoc, CompetitionEntrant } from "./types";

/** Shape of a legacy `shared-teams/{id}` document (the collection this
 * change removes). Kept narrow and local since the app no longer has a
 * live type for it. */
export interface LegacySharedTeamRecord {
  id: string;
  ownerUid: string;
  ownerName: string;
  teamId: string;
}

/** An entrant as it may have been persisted before this change: it might
 * still carry the legacy `source`/`sharedTeamId` fields. */
export type LegacyEntrant = CompetitionEntrant & {
  source?: "shared" | "local";
  sharedTeamId?: string;
};

export interface RepointResult {
  entrant: CompetitionEntrant;
  /** True if this entrant needed no migration, or migration fully resolved
   * its owner/team reference against a known shared-team record. False
   * means the referenced shared team record could not be found — the
   * entrant's cached display fields are kept so historical fixtures still
   * render, but its ownerUid/teamId reference could not be verified. */
  verified: boolean;
}

function stripLegacyFields(entrant: LegacyEntrant): CompetitionEntrant {
  const { source: _source, sharedTeamId: _sharedTeamId, ...rest } = entrant;
  return rest;
}

/** Repoint a single entrant. Idempotent: an entrant with no legacy fields
 * passes through unchanged and verified. */
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
    // Nothing to repoint onto — keep the entrant's own cached fields so the
    // fixture still renders historically, but flag it as unverified.
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
  /** Entrant ids whose shared-team backing record could not be found. */
  unresolved: string[];
}

/** Repoint every entrant on a competition document. */
export function repointCompetitionEntrants(
  doc: CompetitionDoc,
  sharedTeams: readonly LegacySharedTeamRecord[]
): RepointCompetitionResult {
  const unresolved: string[] = [];
  const entrants = (doc.entrants as LegacyEntrant[]).map((entrant) => {
    const result = repointEntrant(entrant, sharedTeams);
    if (!result.verified) unresolved.push(result.entrant.id);
    return result.entrant;
  });
  return { doc: { ...doc, entrants }, unresolved };
}
