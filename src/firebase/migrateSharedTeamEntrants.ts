/**
 * Operator-run migration: repoint every competition entrant that referenced
 * the old `shared-teams` publish collection onto a direct owner/team
 * reference, then report what still needs attention before the
 * `shared-teams` collection itself is deleted (task 5.4/5.6).
 *
 * Run this once, after this change's Firestore rules are deployed (so
 * `users/{uid}/teams/{teamId}` is authenticated-read) but BEFORE deleting
 * the `shared-teams` collection — it needs to still exist to resolve
 * legacy references. There is no scheduled/automatic invocation; an
 * operator runs it from a trusted context (e.g. a one-off admin script)
 * against the real project.
 */

import { collection, getDocs } from "firebase/firestore";
import { getDb } from "./config";
import { CompetitionDoc } from "../competition/types";
import { saveCompetition } from "../competition/repository";
import {
  LegacySharedTeamRecord,
  repointCompetitionEntrants,
} from "../competition/migrateSharedEntrants";

async function fetchAllCompetitions(): Promise<CompetitionDoc[]> {
  const [leagues, tournaments] = await Promise.all([
    getDocs(collection(getDb(), "leagues")),
    getDocs(collection(getDb(), "tournaments")),
  ]);
  return [
    ...leagues.docs.map((item) => item.data() as CompetitionDoc),
    ...tournaments.docs.map((item) => item.data() as CompetitionDoc),
  ];
}

async function fetchLegacySharedTeams(): Promise<LegacySharedTeamRecord[]> {
  const snapshot = await getDocs(collection(getDb(), "shared-teams"));
  return snapshot.docs.map(
    (item) => item.data() as unknown as LegacySharedTeamRecord
  );
}

export interface MigrationReport {
  competitionsScanned: number;
  competitionsUpdated: number;
  /** `${competitionId}:${entrantId}` pairs that could not be verified. */
  unresolvedEntrants: string[];
}

/**
 * Repoint every competition's entrants and persist the ones that changed.
 * Idempotent — competitions with nothing but already-direct references are
 * read but not re-written.
 */
export async function runSharedTeamEntrantMigration(): Promise<MigrationReport> {
  const [competitions, sharedTeams] = await Promise.all([
    fetchAllCompetitions(),
    fetchLegacySharedTeams(),
  ]);

  const report: MigrationReport = {
    competitionsScanned: competitions.length,
    competitionsUpdated: 0,
    unresolvedEntrants: [],
  };

  for (const competition of competitions) {
    const before = JSON.stringify(competition.entrants);
    const { doc, unresolved } = repointCompetitionEntrants(
      competition,
      sharedTeams
    );
    report.unresolvedEntrants.push(
      ...unresolved.map((entrantId) => `${competition.id}:${entrantId}`)
    );
    if (JSON.stringify(doc.entrants) !== before) {
      await saveCompetition(doc);
      report.competitionsUpdated += 1;
    }
  }

  return report;
}
