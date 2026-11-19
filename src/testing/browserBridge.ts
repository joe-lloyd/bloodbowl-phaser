import { HeadlessGame } from "../headless/HeadlessGame";
import { type HeadlessGameContext } from "../headless/createHeadlessGame";
import { type GameSnapshot } from "../headless/serialization";
import { type EmittedEvent, type PendingDecision } from "../headless/protocol";
import { GameConfig } from "../config/GameConfig";

const TEST_BRIDGE_KEY = "__bbTestBridge" as const;
const TEST_BRIDGE_VERSION = 1;

export interface BridgeTeam {
  id: string;
  name: string;
  players: { id: string; name: string; positionName: string }[];
}

export interface BrowserTestBridge {
  readonly version: number;

  snapshot(): GameSnapshot;

  events(sinceIndex?: number): EmittedEvent[];

  pendingDecision(): PendingDecision | null;

  phase(): {
    phase: string;
    subPhase: string | null;
    activeTeamId: string | null;
  };

  scenes(): string[];

  teams(): [BridgeTeam, BridgeTeam];

  squareToCanvas(gridX: number, gridY: number): { x: number; y: number } | null;

  cameraMoving(): boolean;

  cameraState(): {
    zoom: number;
    centre: { x: number; y: number };
    panning: boolean;
    zooming: boolean;
  } | null;

  pitchLayers(): string[];

  pitchHighlights(): { x: number; y: number }[];

  canvasSize(): { width: number; height: number };
}

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

interface BridgeCamera {
  zoom: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  worldView: { x: number; y: number };
  panEffect: { isRunning: boolean };
  zoomEffect: { isRunning: boolean };
}

interface BridgeScene {
  scene: { key: string };
  cameras?: { main?: BridgeCamera };
  getPitch?: () =>
    | {
        getPixelPosition(x: number, y: number): { x: number; y: number };
        layerNames(): string[];
        visibleHighlights(): { x: number; y: number }[];
      }
    | undefined;
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

export function installBrowserTestBridge(ctx: HeadlessGameContext): void {
  if (!bridgeAllowed() || typeof window === "undefined") return;

  observer = new HeadlessGame({ ctx, autoStartOnReady: false });
  const game = observer;

  const bridge: BrowserTestBridge = {
    version: TEST_BRIDGE_VERSION,
    snapshot: () => structuredClone(game.snapshot()),
    events: (sinceIndex = 0) =>
      structuredClone(game.events().slice(sinceIndex)),
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
        if (!pitch) continue;
        const world = pitch.getPixelPosition(gridX, gridY);
        const cam = scene.cameras?.main;
        if (!cam) return { ...world };
        return {
          x: (world.x - cam.worldView.x) * cam.zoom,
          y: (world.y - cam.worldView.y) * cam.zoom,
        };
      }
      return null;
    },
    cameraMoving: () =>
      activeScenes().some((scene) => {
        const cam = scene.cameras?.main;
        return !!cam && (cam.panEffect.isRunning || cam.zoomEffect.isRunning);
      }),
    cameraState: () => {
      const cam = activeScenes().find((scene) => scene.getPitch?.())?.cameras
        ?.main;
      return cam
        ? {
            zoom: cam.zoom,
            centre: {
              x: cam.scrollX + cam.width / 2,
              y: cam.scrollY + cam.height / 2,
            },
            panning: cam.panEffect.isRunning,
            zooming: cam.zoomEffect.isRunning,
          }
        : null;
    },
    pitchLayers: () =>
      activeScenes().flatMap((scene) => scene.getPitch?.()?.layerNames() ?? []),
    pitchHighlights: () =>
      activeScenes().flatMap(
        (scene) => scene.getPitch?.()?.visibleHighlights() ?? []
      ),
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

export function uninstallBrowserTestBridge(): void {
  if (!bridgeAllowed() || typeof window === "undefined") return;
  observer = null;
  delete (window as unknown as Record<string, unknown>)[TEST_BRIDGE_KEY];
}
