/**
 * The read-only browser test bridge.
 *
 * Browser E2E cases act through real controls — canvas clicks and HUD
 * buttons — but asserting on pixels alone would be both fragile and weak.
 * This bridge gives Playwright a precise view of what the game *thinks*
 * happened: the serialized snapshot, the emitted event log, the current
 * phase/scene, and any pending decision.
 *
 * Two properties make it safe to ship in the source tree:
 *
 *  1. It is compiled only into development/test builds. `import.meta.env.DEV`
 *     is statically false in a production build, so the installer's body is
 *     dropped by the bundler and `window.__bbTestBridge` never exists.
 *  2. It cannot mutate the game. The observer is a `HeadlessGame` constructed
 *     with `autoStartOnReady: false`, which only subscribes to the event bus
 *     and records; `execute()` is deliberately not exposed. Everything
 *     returned is a structured clone, so a test cannot reach in and edit
 *     live state through it either.
 */

import { HeadlessGame } from "../headless/HeadlessGame";
import { HeadlessGameContext } from "../headless/createHeadlessGame";
import { GameSnapshot } from "../headless/serialization";
import { EmittedEvent, PendingDecision } from "../headless/protocol";
import { GameConfig } from "../config/GameConfig";

export const TEST_BRIDGE_KEY = "__bbTestBridge" as const;
export const TEST_BRIDGE_VERSION = 1;

/** A team's stable identity, so a test can resolve `team1:3` in the browser. */
export interface BridgeTeam {
  id: string;
  name: string;
  players: { id: string; name: string; positionName: string }[];
}

export interface BrowserTestBridge {
  readonly version: number;
  /** Serialized game state, cloned. */
  snapshot(): GameSnapshot;
  /** Events emitted since the bridge was installed, in order. */
  events(sinceIndex?: number): EmittedEvent[];
  /** The decision the game is waiting on, if any. */
  pendingDecision(): PendingDecision | null;
  /** Current phase / sub-phase, without parsing the snapshot. */
  phase(): { phase: string; subPhase: string | null; activeTeamId: string | null };
  /** The Phaser scene keys currently active, for scene-transition assertions. */
  scenes(): string[];
  /** Both teams in `team1`, `team2` order, for stable reference resolution. */
  teams(): [BridgeTeam, BridgeTeam];
  /**
   * The centre of a grid square in Phaser canvas coordinates, straight from
   * the live `Pitch`. The E2E pitch page object converts this to a viewport
   * point, so canvas clicks use the game's own geometry rather than a second
   * copy of the offset arithmetic. Null before a pitch exists.
   */
  squareToCanvas(gridX: number, gridY: number): { x: number; y: number } | null;
  /**
   * The *live* design-space canvas size. Deliberately read from the running
   * Phaser scale manager rather than `GameConfig`: the scale manager fits the
   * game to its parent element, and the pitch is laid out from that runtime
   * width — so this is the number a canvas point must be scaled against.
   */
  canvasSize(): { width: number; height: number };
}

/** True when the bridge was compiled in AND installed on this page. */
export function isTestBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as Record<string, unknown>)[TEST_BRIDGE_KEY]
  );
}

/**
 * Whether this build may carry the bridge at all.
 *
 * Both `DEV` and `MODE` are *statically replaced* by Vite at build time, so
 * in a production build this expression folds to `false` and the minifier
 * drops the installer's body — the bridge is genuinely absent from the
 * shipped bundle, not merely unreachable. That is why the check reads the
 * fields inline rather than through a local alias, and why the E2E opt-in is
 * a build mode (`vite build --mode e2e`) rather than a custom env var: Vite
 * only inlines a `VITE_*` var when that mode actually defines it, so a custom
 * var leaves a runtime lookup behind.
 *
 * `MODE === "test"` is Vitest: a jsdom unit test has no use for the bridge
 * and would pay for an extra event-bus observer on every container.
 */
function bridgeAllowed(): boolean {
  return (
    (import.meta.env?.DEV === true || import.meta.env?.MODE === "e2e") &&
    import.meta.env?.MODE !== "test"
  );
}

function cloneTeam(team: HeadlessGameContext["team1"]): BridgeTeam {
  return {
    id: team.id,
    name: team.name,
    players: team.players.map((player) => ({
      id: player.id,
      name: player.playerName,
      positionName: player.positionName,
    })),
  };
}

/** The shape of a running scene the bridge is willing to look at. */
interface BridgeScene {
  scene: { key: string };
  getPitch?: () => { getPixelPosition(x: number, y: number): { x: number; y: number } } | undefined;
}

interface BridgePhaserGame {
  scene?: { getScenes?: (active: boolean) => BridgeScene[] };
  scale?: { width: number; height: number };
}

function phaserGame(): BridgePhaserGame | undefined {
  return (window as unknown as { game?: BridgePhaserGame }).game;
}

function activeScenes(): BridgeScene[] {
  return phaserGame()?.scene?.getScenes?.(true) ?? [];
}

let observer: HeadlessGame | null = null;

/**
 * Attach the bridge for a freshly built engine. Call once per match, as
 * early as possible: the observer only sees events emitted after it
 * subscribes.
 */
export function installBrowserTestBridge(ctx: HeadlessGameContext): void {
  if (!bridgeAllowed() || typeof window === "undefined") return;

  // `autoStartOnReady: false` is what makes this an observer rather than a
  // second coach — without it the observer would start play on ReadyToStart.
  observer = new HeadlessGame({ ctx, autoStartOnReady: false });
  const game = observer;

  const bridge: BrowserTestBridge = {
    version: TEST_BRIDGE_VERSION,
    snapshot: () => structuredClone(game.snapshot()),
    events: (sinceIndex = 0) => structuredClone(game.events().slice(sinceIndex)),
    pendingDecision: () => structuredClone(game.pendingDecision()),
    phase: () => {
      const snapshot = game.snapshot();
      return {
        phase: snapshot.phase,
        subPhase: snapshot.subPhase,
        activeTeamId: snapshot.activeTeamId,
      };
    },
    scenes: () => activeScenes().map((scene) => scene.scene.key),
    teams: () => [cloneTeam(ctx.team1), cloneTeam(ctx.team2)],
    squareToCanvas: (gridX, gridY) => {
      for (const scene of activeScenes()) {
        const pitch = scene.getPitch?.();
        if (pitch) return { ...pitch.getPixelPosition(gridX, gridY) };
      }
      return null;
    },
    canvasSize: () => {
      const scale = phaserGame()?.scale;
      return {
        width: scale?.width ?? GameConfig.CANVAS_WIDTH,
        height: scale?.height ?? GameConfig.CANVAS_HEIGHT,
      };
    },
  };

  (window as unknown as Record<string, unknown>)[TEST_BRIDGE_KEY] = bridge;
}

/**
 * Detach the bridge when the match's engine goes away.
 *
 * Guarded identically to the installer so a production build folds this to
 * nothing too — otherwise `ServiceContainer.reset()`'s unconditional call
 * would keep the key alive in the shipped bundle.
 */
export function uninstallBrowserTestBridge(): void {
  if (!bridgeAllowed() || typeof window === "undefined") return;
  observer = null;
  delete (window as unknown as Record<string, unknown>)[TEST_BRIDGE_KEY];
}
