import Phaser from "phaser";
import { PitchThemeId, resolvePitchTheme } from "../presentation/pitchThemes";

/** The dugout boxes a stadium has, each a list of square centres in grid units. */
export type DugoutBox = "reserves" | "ko" | "injured" | "sent off";
export type DugoutSquares = Record<DugoutBox, [number, number][]>;

/** What scripts/sprites/stadium.py writes next to the render. */
export interface StadiumMeta {
  layout: string;
  square_m: number;
  cols: number;
  rows: number;
  dugouts: { home: DugoutSquares; away: DugoutSquares };
  /** Scoreboard screen centre: grid x, grid y and metres up. */
  screen: [number, number, number];
  sizes: {
    lo: {
      width: number;
      height: number;
      px_per_unit: number;
      /** Where the far corner of square (0, 0) lands in the image. */
      origin: [number, number];
    };
  };
}

const LAYERS = ["base", "home", "away"] as const;

function key(style: PitchThemeId, part: string): string {
  return `stadium:${style}:${part}`;
}

/** Queue the backdrop layers and meta for a style. */
export function preloadStadium(scene: Phaser.Scene, style: PitchThemeId) {
  const path = resolvePitchTheme(style).stadiumPath;
  scene.load.json(key(style, "meta"), `${path}/meta.json`);
  for (const layer of LAYERS) {
    if (!scene.textures.exists(key(style, layer)))
      scene.load.image(key(style, layer), `${path}/${layer}.webp`);
  }
}

/**
 * Stadium: the pre-rendered backdrop, drawn at world (0, 0) one image pixel
 * to one world pixel. The crowd, seats, flags and end zones in team colours
 * come out of a mask render as their own layers, tinted here per match.
 *
 * The tinted layers are flattened into one texture when the match starts.
 * Each layer covers the whole screen, so drawing three of them every frame
 * tripled the fill, which software WebGL pays for on the CPU.
 */
export class Stadium {
  public readonly meta: StadiumMeta;
  private image: Phaser.GameObjects.Image | null = null;

  constructor(
    scene: Phaser.Scene,
    style: PitchThemeId,
    colors: { home: number; away: number }
  ) {
    this.meta = scene.cache.json.get(key(style, "meta")) as StadiumMeta;
    const layers = LAYERS.filter((layer) =>
      scene.textures.exists(key(style, layer))
    ).flatMap((layer) => {
      const image = scene.textures.get(key(style, layer)).getSourceImage();
      const tint = layer === "base" ? 0xffffff : colors[layer];
      return image instanceof HTMLImageElement ? [{ image, tint }] : [];
    });
    if (layers.length === 0) return;
    // A plain texture: addCanvas would keep a 28 MB copy of the pixels
    const canvas = flatten(layers);
    const texture = scene.textures.create(
      key(style, `match-${Phaser.Math.RND.uuid()}`),
      canvas
    );
    if (!texture) return;
    texture.add("__BASE", 0, 0, 0, canvas.width, canvas.height);
    this.image = scene.add.image(0, 0, texture).setOrigin(0).setDepth(0);
  }

  /** World position of the far corner of square (0, 0): the pitch origin. */
  public get origin(): { x: number; y: number } {
    const [x, y] = this.meta.sizes.lo.origin;
    return { x, y };
  }

  public get width(): number {
    return this.meta.sizes.lo.width;
  }

  public get height(): number {
    return this.meta.sizes.lo.height;
  }

  public destroy(): void {
    const texture = this.image?.texture;
    this.image?.destroy();
    this.image = null;
    texture?.destroy();
  }
}

/**
 * Lay the tinted layers over each other once, on the CPU, the way the
 * renderer blends them: each layer's colour times its tint, over what is
 * below by the layer's alpha. The result is the same size as the layers,
 * so it is sampled exactly as they were.
 */
function flatten(
  layers: { image: HTMLImageElement; tint: number }[]
): HTMLCanvasElement {
  const { width, height } = layers[0].image;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas to flatten the stadium on");
  const out = context.createImageData(width, height);
  const px = out.data;
  for (const { image, tint } of layers) {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    const src = context.getImageData(0, 0, width, height).data;
    const tr = ((tint >> 16) & 0xff) / 255;
    const tg = ((tint >> 8) & 0xff) / 255;
    const tb = (tint & 0xff) / 255;
    for (let i = 0; i < px.length; i += 4) {
      const a = src[i + 3] / 255;
      if (a === 0) continue;
      px[i] = src[i] * tr * a + px[i] * (1 - a);
      px[i + 1] = src[i + 1] * tg * a + px[i + 1] * (1 - a);
      px[i + 2] = src[i + 2] * tb * a + px[i + 2] * (1 - a);
      px[i + 3] = 255 * a + px[i + 3] * (1 - a);
    }
  }
  context.putImageData(out, 0, 0);
  return canvas;
}
