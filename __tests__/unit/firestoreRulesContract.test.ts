import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");

describe("competition Firestore rule contract", () => {
  it("makes a coach's live team authenticated-readable and owner-writable", () => {
    const block =
      /match \/users\/\{uid\}\/teams\/\{teamId\} \{([\s\S]*?)\n {4}\}/.exec(
        rules
      )?.[1];
    expect(block).toContain("allow read: if request.auth != null;");
    expect(block).toContain(
      "allow write: if request.auth != null && request.auth.uid == uid;"
    );

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
    expect(rules).toContain("'championEntrantId', 'reporterEntrantIndex',");
  });
});
