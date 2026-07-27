import { describe, expect, it } from "vitest";
import {
  computeMatchOptionsMenu,
  MatchOptionsMenuContext,
} from "../../src/ui/components/hud/computeMatchOptionsMenu";

/**
 * The in-match options menu never hides entries with ad hoc CSS — every
 * context this function can see must produce exactly the entries a coach
 * is allowed to act on (design.md, "Use one menu trigger with
 * context-derived entries"). These tests are the assertion surface for
 * that guarantee across local, sandbox, resumed(local-active), host and
 * guest, and every connection/end-request combination.
 */
describe("computeMatchOptionsMenu", () => {
  it("sandbox: offers only a plain exit", () => {
    const entries = computeMatchOptionsMenu({ kind: "sandbox" });
    expect(entries.map((e) => e.id)).toEqual(["exit-sandbox"]);
    expect(entries[0].destructive).toBeFalsy();
  });

  it("local, active/resumed match: Return is safe, Abandon is destructive and confirmed", () => {
    const entries = computeMatchOptionsMenu({
      kind: "local",
      matchOver: false,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "return-to-menu",
      "abandon-match",
    ]);

    const returnEntry = entries[0];
    expect(returnEntry.destructive).toBeFalsy();
    expect(returnEntry.confirm).toBeUndefined();
    expect(returnEntry.label).toBe("Return to Main Menu");

    const abandonEntry = entries[1];
    expect(abandonEntry.destructive).toBe(true);
    expect(abandonEntry.confirm).toBeDefined();
    expect(abandonEntry.confirm?.confirmLabel).toMatch(/abandon/i);
  });

  it("local, game over: only a non-destructive leave, no abandon", () => {
    const entries = computeMatchOptionsMenu({
      kind: "local",
      matchOver: true,
    });
    expect(entries.map((e) => e.id)).toEqual(["return-to-menu"]);
    expect(entries[0].label).toBe("Leave Results");
    expect(entries[0].destructive).toBeFalsy();
  });

  const ONLINE_ONLY_IDS = new Set([
    "save-and-exit",
    "leave-match",
    "request-end-match",
    "cancel-end-match",
    "respond-end-match",
    "connection-status",
    "reconnect",
    "force-abandon",
  ]);

  it("local and sandbox omit every online connection control (spec: local match omits online controls)", () => {
    for (const context of [
      { kind: "sandbox" as const },
      { kind: "local" as const, matchOver: false },
      { kind: "local" as const, matchOver: true },
    ]) {
      const ids = computeMatchOptionsMenu(context).map((e) => e.id);
      expect(ids.some((id) => ONLINE_ONLY_IDS.has(id))).toBe(false);
    }
  });

  describe("online", () => {
    const base = {
      kind: "online" as const,
      opponentName: "Skrag",
      endRequest: "none" as const,
      connection: "online" as const,
    };

    it("host: Save & Exit is a live, enabled action", () => {
      const hostEntries = computeMatchOptionsMenu({ ...base, role: "host" });
      const hostSave = hostEntries.find((e) => e.id === "save-and-exit")!;
      expect(hostSave.label).toBe("Save & Exit");
      expect(hostSave.disabled).toBeFalsy();
      expect(hostSave.destructive).toBeFalsy();
      expect(hostEntries.some((e) => e.id === "leave-match")).toBe(false);
    });

    it("guest cannot invoke the host-only Save & Exit; the restriction is communicated, and Leave Match covers actually leaving (spec: guest cannot invoke a host-only action)", () => {
      const guestEntries = computeMatchOptionsMenu({ ...base, role: "guest" });

      const guestSave = guestEntries.find((e) => e.id === "save-and-exit")!;
      expect(guestSave.disabled).toBe(true);
      expect(guestSave.description).toMatch(/host/i);

      const leave = guestEntries.find((e) => e.id === "leave-match")!;
      expect(leave).toBeDefined();
      expect(leave.disabled).toBeFalsy();
      expect(leave.destructive).toBeFalsy();
      expect(leave.description).toMatch(/host/i);
    });

    it("no end request: offers to propose ending, with a confirm step", () => {
      const entries = computeMatchOptionsMenu({ ...base, role: "host" });
      const request = entries.find((e) => e.id === "request-end-match")!;
      expect(request).toBeDefined();
      expect(request.destructive).toBe(true);
      expect(request.confirm).toBeDefined();
      expect(entries.some((e) => e.id === "cancel-end-match")).toBe(false);
      expect(entries.some((e) => e.id === "respond-end-match")).toBe(false);
    });

    it("my own end request: offers cancel, not propose or respond", () => {
      const entries = computeMatchOptionsMenu({
        ...base,
        role: "host",
        endRequest: "mine",
      });
      expect(entries.some((e) => e.id === "request-end-match")).toBe(false);
      expect(entries.some((e) => e.id === "respond-end-match")).toBe(false);
      const cancel = entries.find((e) => e.id === "cancel-end-match")!;
      expect(cancel).toBeDefined();
      expect(cancel.disabled).toBeFalsy();
    });

    it("opponent's end request: shows a disabled pointer to the response prompt", () => {
      const entries = computeMatchOptionsMenu({
        ...base,
        role: "guest",
        endRequest: "theirs",
      });
      expect(entries.some((e) => e.id === "request-end-match")).toBe(false);
      expect(entries.some((e) => e.id === "cancel-end-match")).toBe(false);
      const respond = entries.find((e) => e.id === "respond-end-match")!;
      expect(respond).toBeDefined();
      expect(respond.disabled).toBe(true);
    });

    it("connection: online shows status only, no reconnect, no force-abandon", () => {
      const entries = computeMatchOptionsMenu({ ...base, role: "host" });
      const status = entries.find((e) => e.id === "connection-status")!;
      expect(status.disabled).toBe(true);
      expect(status.label).toMatch(/connected/i);
      expect(entries.some((e) => e.id === "reconnect")).toBe(false);
      expect(entries.some((e) => e.id === "force-abandon")).toBe(false);
    });

    it("connection: reconnecting offers a live reconnect action, no force-abandon yet (spec: disconnected coach sees reconnect)", () => {
      const entries = computeMatchOptionsMenu({
        ...base,
        role: "host",
        connection: "reconnecting",
      });
      const status = entries.find((e) => e.id === "connection-status")!;
      expect(status.label).toMatch(/reconnect/i);
      const reconnect = entries.find((e) => e.id === "reconnect")!;
      expect(reconnect).toBeDefined();
      expect(reconnect.disabled).toBeFalsy();
      expect(reconnect.destructive).toBeFalsy();
      expect(entries.some((e) => e.id === "force-abandon")).toBe(false);
    });

    it("connection: abandonable still offers reconnect alongside force-abandon", () => {
      const entries = computeMatchOptionsMenu({
        ...base,
        role: "host",
        connection: "abandonable",
      });
      expect(entries.some((e) => e.id === "reconnect")).toBe(true);
      expect(entries.some((e) => e.id === "force-abandon")).toBe(true);
    });

    it("connection: abandonable adds a confirmed force-abandon entry", () => {
      const entries = computeMatchOptionsMenu({
        ...base,
        role: "host",
        connection: "abandonable",
      });
      const forceAbandon = entries.find((e) => e.id === "force-abandon")!;
      expect(forceAbandon).toBeDefined();
      expect(forceAbandon.destructive).toBe(true);
      expect(forceAbandon.confirm).toBeDefined();
    });

    it("recomputes fresh from context every call (no hidden memoized state)", () => {
      const online = computeMatchOptionsMenu({
        ...base,
        role: "guest",
        connection: "online",
      });
      const abandonable = computeMatchOptionsMenu({
        ...base,
        role: "guest",
        connection: "abandonable",
      });
      expect(online.some((e) => e.id === "force-abandon")).toBe(false);
      expect(abandonable.some((e) => e.id === "force-abandon")).toBe(true);
    });
  });

  it("every destructive entry across every context carries a confirm step", () => {
    const contexts: MatchOptionsMenuContext[] = [
      { kind: "sandbox" },
      { kind: "local", matchOver: false },
      { kind: "local", matchOver: true },
      {
        kind: "online",
        role: "host",
        opponentName: "Skrag",
        connection: "online",
        endRequest: "none",
      },
      {
        kind: "online",
        role: "guest",
        opponentName: "Skrag",
        connection: "abandonable",
        endRequest: "none",
      },
    ];
    for (const context of contexts) {
      for (const entry of computeMatchOptionsMenu(context)) {
        if (entry.destructive) {
          expect(entry.confirm, `${context.kind}/${entry.id}`).toBeDefined();
        }
      }
    }
  });
});
