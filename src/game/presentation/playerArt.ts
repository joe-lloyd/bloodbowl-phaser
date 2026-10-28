import Phaser from "phaser";
import manifest from "./spriteManifest.json";
import { ISO } from "../elements/GridUtils";
import { PitchThemeId, resolvePitchTheme } from "./pitchThemes";

/**
 * Pre-rendered player art. Every model was rendered in Blender from the
 * board camera in eight facings, with idle, run and fall animations, then
 * split into three layers: the figure, and its primary and secondary kit
 * pixels in grey for Phaser to tint with the team's colours. See
 * scripts/sprites/ for the pipeline and spriteManifest.json for its output.
 */

export const FACINGS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;
export type Facing = (typeof FACINGS)[number];
export type Animation = "idle" | "run" | "fall";
export const LAYERS = ["base", "kit1", "kit2"] as const;
export type Layer = (typeof LAYERS)[number];

export interface ModelArt {
  /** Square frame size, in pixels, before trimming. */
  frame: number;
  /** Where the feet are inside the frame. */
  anchor: [number, number];
  animations: Record<Animation, number>;
}

const MODELS = manifest.models as unknown as Record<string, ModelArt>;
const POSITIONS = manifest.positions as Record<string, Record<string, string>>;

/** Used when a roster position has no model of its own. */
const FALLBACK_MODEL = "human_lineman";

/** The model rendered for a roster position. */
export function modelFor(rosterName: string, positionName: string): string {
  const model = POSITIONS[rosterName]?.[positionName];
  if (model && MODELS[model]) return model;
  // A new or renamed position: borrow the roster's first rendered model.
  const roster = Object.values(POSITIONS[rosterName] ?? {});
  return roster.find((m) => MODELS[m]) ?? FALLBACK_MODEL;
}

export function modelArt(model: string): ModelArt {
  return MODELS[model] ?? MODELS[FALLBACK_MODEL];
}

export function textureKey(
  style: PitchThemeId,
  model: string,
  layer: Layer
): string {
  return `player:${style}:${model}:${layer}`;
}

export function frameName(anim: Animation, facing: Facing, index: number) {
  return `${anim}/${facing}/${index}`;
}

/** Queue the atlases for every model these players use. */
export function preloadPlayerArt(
  scene: Phaser.Scene,
  style: PitchThemeId,
  players: { rosterName: string; positionName: string }[]
): void {
  const base = resolvePitchTheme(style).spritePath;
  const models = new Set(
    players.map((p) => modelFor(p.rosterName, p.positionName))
  );
  for (const model of models) {
    for (const layer of LAYERS) {
      const key = textureKey(style, model, layer);
      if (scene.textures.exists(key)) continue;
      scene.load.atlas(
        key,
        `${base}/${model}/${layer}.png`,
        `${base}/${model}/${layer}.json`
      );
    }
  }
}

/**
 * The facing for a step across the screen. Grid x runs down-right and grid
 * y down-left, so a screen delta converts back to grid units first.
 */
export function facingForStep(dx: number, dy: number): Facing | null {
  const u = dx / ISO.gx.x;
  const v = dy / ISO.gx.y;
  const gx = (u + v) / 2;
  const gy = (v - u) / 2;
  if (Math.abs(gx) < 1e-6 && Math.abs(gy) < 1e-6) return null;
  const sx = Math.abs(gx) < 0.38 * Math.abs(gy) ? 0 : Math.sign(gx);
  const sy = Math.abs(gy) < 0.38 * Math.abs(gx) ? 0 : Math.sign(gy);
  const table: Record<string, Facing> = {
    "0,1": "s",
    "1,1": "se",
    "1,0": "e",
    "1,-1": "ne",
    "0,-1": "n",
    "-1,-1": "nw",
    "-1,0": "w",
    "-1,1": "sw",
  };
  return table[`${sx},${sy}`] ?? null;
}
