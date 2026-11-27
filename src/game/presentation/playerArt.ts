import Phaser from "phaser";
import manifest from "./spriteManifest.json";
import { ISO } from "../elements/GridUtils";
import { MATCH_STYLE } from "./matchStyle";
import { layeredArt } from "./layered/layeredModels";
import { SECRET_POSITION_MODELS } from "../../data/secretLeague/secretRosters";

const FACINGS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;
export type Facing = (typeof FACINGS)[number];

export type Animation = "idle" | "run" | "fall" | "cheer" | "block" | "pass";
export const LAYERS = ["base", "kit1", "kit2"] as const;
export type Layer = (typeof LAYERS)[number];

export interface ModelArt {
  frame: number;

  anchor: [number, number];
  animations: Record<Animation, number>;
}

const MODELS = manifest.models as unknown as Record<string, ModelArt>;
const POSITIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ...manifest.positions,
  ...SECRET_POSITION_MODELS,
};

const FALLBACK_MODEL = "human_lineman";

export function modelFor(rosterName: string, positionName: string): string {
  const model = POSITIONS[rosterName]?.[positionName];
  if (model && MODELS[model] !== undefined) return model;

  const roster = Object.values(POSITIONS[rosterName] ?? {});
  return roster.find((m) => MODELS[m]) ?? FALLBACK_MODEL;
}

export function rosterModels(rosterName: string): string[] {
  const models = Object.values(POSITIONS[rosterName] ?? {}).filter((m) => MODELS[m]);
  return models.length > 0 ? [...new Set(models)] : [FALLBACK_MODEL];
}

export function hasModelArt(model: string): boolean {
  return MODELS[model] !== undefined;
}

export function modelArt(model: string): ModelArt {
  const art = MODELS[model] ?? MODELS[FALLBACK_MODEL];
  if (!art) throw new Error(`Missing player art for ${model}`);
  return art;
}

export function textureKey(model: string, layer: Layer): string {
  return `player:${model}:${layer}`;
}

export function frameName(anim: Animation, facing: Facing, index: number) {
  return `${anim}/${facing}/${String(index)}`;
}

export function preloadPlayerArt(
  scene: Phaser.Scene,
  players: { rosterName: string; positionName: string }[]
): void {
  const models = new Set(
    players.map((p) => modelFor(p.rosterName, p.positionName))
  );
  preloadModels(scene, models);
}

export function preloadModels(
  scene: Phaser.Scene,
  models: Iterable<string>
): void {
  const base = MATCH_STYLE.spritePath;
  for (const model of models) {
    if (layeredArt(model)) continue;
    for (const layer of LAYERS) {
      const key = textureKey(model, layer);
      if (scene.textures.exists(key)) continue;
      scene.load.atlas(
        key,
        `${base}/${model}/${layer}.png`,
        `${base}/${model}/${layer}.json`
      );
    }
  }
}

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
  return table[`${String(sx)},${String(sy)}`] ?? null;
}
