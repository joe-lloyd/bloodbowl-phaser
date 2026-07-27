import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

describe("competition Firestore rule contract", () => {
  /**
   * overhaul-team-lifecycle-management (shared-team-library) removes the
   * opt-in `shared-teams` publish collection: a coach's live team is
   * readable by any authenticated coach directly, and writable only by its
   * owner, with no separate copy.
   */
  it("makes a coach's live team authenticated-readable and owner-writable", () => {
    const block = rules.match(
      /match \/users\/\{uid\}\/teams\/\{teamId\} \{([\s\S]*?)\n {4}\}/
    )?.[1];
    expect(block).toContain("allow read: if request.auth != null;");
    expect(block).toContain(
      "allow write: if request.auth != null && request.auth.uid == uid;"
    );
    // Not a blanket owner-only read — that would block other coaches.
    expect(block).not.toContain(
      "allow read, write: if request.auth != null && request.auth.uid == uid;"
    );
  });

  it("has no opt-in shared-teams publish collection left to secure", () => {
    expect(rules).not.toContain("shared-teams");
  });

  it("limits participant competition updates to result-derived fields and the entrant display cache", () => {
    expect(rules).toContain("match /leagues/{leagueId}");
    expect(rules).toContain("match /tournaments/{tournamentId}");
    expect(rules).toContain(
      ".hasOnly(['entrants', 'fixtures', 'standings', 'status'"
    );
    expect(rules).toContain("'championEntrantId', 'updatedAt']");
  });
});
