import manifest from "../spriteManifest.json";
import {
  fetchLayer,
  parseLayeredModels,
  type LayerData,
  type LayeredModel,
  type LookOption,
} from "../../../boundary/layeredArt";
import type { PlayerAppearance } from "../../../types/Player";
import type { TeamColors } from "../../../types/Team";
import { MATCH_STYLE } from "../matchStyle";
import { buildLookAtlas, type LookAtlas } from "./lookAtlas";
import { lookKey, resolveLook, type ResolvedLook } from "./looks";

const LAYERED = parseLayeredModels(manifest);
const FACINGS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;

const layers = new Map<string, Promise<LayerData>>();
const atlases = new Map<string, Promise<LookAtlas>>();

export function layeredArt(model: string): LayeredModel | undefined {
  return LAYERED.get(model);
}

export function lookOptions(model: string): readonly LookOption[] {
  return LAYERED.get(model)?.layered.options ?? [];
}

export interface PlayerLookRequest {
  readonly model: string;
  readonly appearance: PlayerAppearance | undefined;
  readonly colors: TeamColors;
}

export function lookTextureKey(request: PlayerLookRequest): string | null {
  const art = LAYERED.get(request.model);
  return art ? lookAtlasKey(request, resolveLook(art, request.appearance)) : null;
}

export interface LookRequest {
  readonly model: string;
  readonly appearance: PlayerAppearance | undefined;
  readonly colors: TeamColors;
  readonly anims?: readonly string[];
  readonly facings?: readonly string[];
}

function frameNames(art: LayeredModel, request: Pick<LookRequest, "anims" | "facings">): string[] {
  const anims = request.anims ?? Object.keys(art.animations);
  const facings = request.facings ?? FACINGS;
  return anims.flatMap((anim) =>
    facings.flatMap((facing) =>
      Array.from({ length: art.animations[anim] ?? 0 }, (_, i) => `${anim}/${facing}/${String(i)}`)
    )
  );
}

function loadLayer(model: string, body: string, layer: string): Promise<LayerData> {
  const url = `${MATCH_STYLE.spritePath}/${model}/layered/${body}/${layer}`;
  let pending = layers.get(url);
  if (!pending) {
    pending = fetchLayer(url);
    pending.catch(() => layers.delete(url));
    layers.set(url, pending);
  }
  return pending;
}

function colourKey(colors: TeamColors): string {
  return `${colors.primary.toString(16)}-${colors.secondary.toString(16)}`;
}

function lookAtlasKey(request: LookRequest, look: ResolvedLook): string {
  const scope = `${(request.anims ?? ["all"]).join(",")}:${(request.facings ?? ["all"]).join(",")}`;
  return `look:${lookKey(request.model, look)}:${colourKey(request.colors)}:${scope}`;
}

async function build(art: LayeredModel, request: LookRequest, look: ResolvedLook): Promise<LookAtlas> {
  const load = (names: readonly string[]) => Promise.all(names.map((layer) => loadLayer(request.model, look.body, layer)));
  const [layers, shades] = await Promise.all([load(look.layers), load(look.shades)]);
  return buildLookAtlas({
    look: { layers, shades },
    names: frameNames(art, request),
    size: art.frame,
    palette: art.layered.palette,
    colors: request.colors,
  });
}

export function loadLookAtlas(request: LookRequest): Promise<LookAtlas> {
  const art = LAYERED.get(request.model);
  if (!art) return Promise.reject(new Error(`${request.model} has no layered art`));
  const look = resolveLook(art, request.appearance);
  const key = lookAtlasKey(request, look);
  let pending = atlases.get(key);
  if (!pending) {
    pending = build(art, request, look);
    pending.catch(() => atlases.delete(key));
    atlases.set(key, pending);
  }
  return pending;
}
