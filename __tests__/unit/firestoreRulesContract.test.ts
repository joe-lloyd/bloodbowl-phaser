import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");

describe("competition Firestore rule contract", () => {
  it("keeps shared teams owner-writable and authenticated-readable", () => {
    const block = rules.match(
      /match \/shared-teams\/\{teamId\} \{([\s\S]*?)\n {4}\}/
    )?.[1];
    expect(block).toContain("allow read: if request.auth != null");
    expect(block).toContain(
      "request.resource.data.ownerUid == request.auth.uid"
    );
    expect(block).toContain("resource.data.ownerUid == request.auth.uid");
  });

  it("limits participant competition updates to result-derived fields", () => {
    expect(rules).toContain("match /leagues/{leagueId}");
    expect(rules).toContain("match /tournaments/{tournamentId}");
    expect(rules).toContain(".hasOnly(['fixtures', 'standings', 'status'");
    expect(rules).toContain("'championEntrantId', 'updatedAt']");
  });
});
