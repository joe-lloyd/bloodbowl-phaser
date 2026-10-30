/**
 * The e2e-online lane makes every emulator account an admin with
 * VITE_ADMIN_EMAILS=*, so its tests can open /sand-box. The wildcard only
 * counts against the local emulators: a deployed build keeps its list.
 */
import { describe, expect, it } from "vitest";
import { isAdminEmail } from "../../src/firebase/admin";

const EMULATOR = {
  VITE_ADMIN_EMAILS: "*",
  VITE_FIREBASE_USE_EMULATORS: "true",
};

describe("admin emails", () => {
  it("makes any emulator account an admin under the wildcard", () => {
    expect(isAdminEmail("ostrich.lion.428@example.com", EMULATOR)).toBe(true);
  });

  it("ignores the wildcard on a build that talks to the real backend", () => {
    expect(
      isAdminEmail("ostrich.lion.428@example.com", { VITE_ADMIN_EMAILS: "*" })
    ).toBe(false);
    expect(
      isAdminEmail("joe.lloyd.22.24@gmail.com", { VITE_ADMIN_EMAILS: "*" })
    ).toBe(true);
  });

  it("keeps a listed address an admin and an unlisted one not", () => {
    const env = { VITE_ADMIN_EMAILS: "Coach@Example.com, other@example.com" };
    expect(isAdminEmail("coach@example.com", env)).toBe(true);
    expect(isAdminEmail("stranger@example.com", env)).toBe(false);
    expect(isAdminEmail(undefined, EMULATOR)).toBe(false);
  });

  it("makes the e2e-online env file use the wildcard", async () => {
    const { readFileSync } = await import("node:fs");
    const file = readFileSync(".env.e2e-online", "utf8");
    expect(file).toMatch(/^VITE_ADMIN_EMAILS=\*$/m);
    expect(file).toMatch(/^VITE_FIREBASE_USE_EMULATORS=true$/m);
  });
});
