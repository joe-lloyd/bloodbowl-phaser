/**
 * Playwright-side access to the read-only browser test bridge.
 *
 * The bridge is installed by `ServiceContainer.initialize` in dev/test
 * builds only. Everything here reads; nothing here can change game state,
 * which is the point — browser cases act through real controls and use this
 * only to see what the game concluded.
 */

import { Page, expect } from "@playwright/test";
import type { GameSnapshot } from "../../../src/headless/serialization";
import type {
  EmittedEvent,
  PendingDecision,
} from "../../../src/headless/protocol";
import type {
  BrowserTestBridge,
  BridgeTeam,
} from "../../../src/testing/browserBridge";

/**
 * Duplicated from `src/testing/browserBridge.ts` on purpose: this literal is
 * evaluated inside the page, where the import does not exist.
 */
const BRIDGE_KEY = "__bbTestBridge";

export class GameBridge {
  constructor(private readonly page: Page) {}

  /**
   * Wait until a match's engine exists and has published the bridge. Failing
   * here almost always means the page never started a match, or the suite is
   * pointed at a production build where the bridge is compiled out.
   */
  async waitForReady(timeout = 20_000): Promise<void> {
    await this.page.waitForFunction(
      (key) => !!(window as never as Record<string, unknown>)[key],
      BRIDGE_KEY,
      { timeout }
    );
  }

  snapshot(): Promise<GameSnapshot> {
    return this.page.evaluate(() =>
      (
        window as unknown as Record<string, BrowserTestBridge>
      ).__bbTestBridge.snapshot()
    ) as Promise<GameSnapshot>;
  }

  events(sinceIndex = 0): Promise<EmittedEvent[]> {
    return this.page.evaluate(
      (since) =>
        (
          window as unknown as Record<string, BrowserTestBridge>
        ).__bbTestBridge.events(since),
      sinceIndex
    ) as Promise<EmittedEvent[]>;
  }

  pendingDecision(): Promise<PendingDecision | null> {
    return this.page.evaluate(
      () =>
        (
          window as unknown as Record<string, BrowserTestBridge>
        ).__bbTestBridge.pendingDecision()
    ) as Promise<PendingDecision | null>;
  }

  phase(): Promise<{
    phase: string;
    subPhase: string | null;
    activeTeamId: string | null;
  }> {
    return this.page.evaluate(() =>
      (
        window as unknown as Record<string, BrowserTestBridge>
      ).__bbTestBridge.phase()
    );
  }

  scenes(): Promise<string[]> {
    return this.page.evaluate(() =>
      (
        window as unknown as Record<string, BrowserTestBridge>
      ).__bbTestBridge.scenes()
    );
  }

  teams(): Promise<[BridgeTeam, BridgeTeam]> {
    return this.page.evaluate(() =>
      (
        window as unknown as Record<string, BrowserTestBridge>
      ).__bbTestBridge.teams()
    ) as Promise<[BridgeTeam, BridgeTeam]>;
  }

  /** Resolve a stable `team1:3` reference to this page's runtime player id. */
  async resolveRef(ref: string): Promise<string> {
    const [team1, team2] = await this.teams();
    if (ref === "team1") return team1.id;
    if (ref === "team2") return team2.id;
    const match = /^(team1|team2):(\d+)$/.exec(ref);
    if (!match) return ref;
    const team = match[1] === "team1" ? team1 : team2;
    const player = team.players[Number(match[2])];
    if (!player) throw new Error(`no player for ref '${ref}' on this page`);
    return player.id;
  }

  /** Block until the game reports the phase the case expects. */
  async expectPhase(phase: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => (await this.phase()).phase, { timeout })
      .toBe(phase);
  }

  /** Block until an event with this name has been emitted. */
  async expectEvent(name: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => (await this.events()).some((e) => e.name === name), {
        timeout,
      })
      .toBe(true);
  }
}
