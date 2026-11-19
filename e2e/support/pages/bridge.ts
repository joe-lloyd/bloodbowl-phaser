import { type Page, expect } from "@playwright/test";
import type { GameSnapshot } from "../../../src/headless/serialization";
import type {
  EmittedEvent,
  PendingDecision,
} from "../../../src/headless/protocol";
import type {
  BrowserTestBridge,
  BridgeTeam,
} from "../../../src/testing/browserBridge";

const BRIDGE_KEY = "__bbTestBridge";

export class GameBridge {
  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  async waitForReady(timeout = 20_000): Promise<void> {
    await this.page.waitForFunction(
      (key) => !!(window as never)[key],
      BRIDGE_KEY,
      { timeout }
    );
  }

  snapshot(): Promise<GameSnapshot> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.snapshot()
    );
  }

  events(sinceIndex = 0): Promise<EmittedEvent[]> {
    return this.page.evaluate(
      (since) =>
        ((window as unknown as Record<string, BrowserTestBridge>)[
          "__bbTestBridge"
        ])!.events(since),
      sinceIndex
    );
  }

  pendingDecision(): Promise<PendingDecision | null> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.pendingDecision()
    );
  }

  phase(): Promise<{
    phase: string;
    subPhase: string | null;
    activeTeamId: string | null;
  }> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.phase()
    );
  }

  scenes(): Promise<string[]> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.scenes()
    );
  }

  pitchLayers(): Promise<string[]> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.pitchLayers()
    );
  }

  pitchHighlights(): Promise<{ x: number; y: number }[]> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.pitchHighlights()
    );
  }

  teams(): Promise<[BridgeTeam, BridgeTeam]> {
    return this.page.evaluate(() =>
      ((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ])!.teams()
    );
  }

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

  async expectPhase(phase: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => (await this.phase()).phase, { timeout })
      .toBe(phase);
  }

  async expectEvent(name: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(async () => (await this.events()).some((e) => e.name === name), {
        timeout,
      })
      .toBe(true);
  }
}
