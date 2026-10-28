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
 */
export class Stadium {
  public readonly meta: StadiumMeta;
  private images: Phaser.GameObjects.Image[];

  constructor(
    scene: Phaser.Scene,
    style: PitchThemeId,
    colors: { home: number; away: number }
  ) {
    this.meta = scene.cache.json.get(key(style, "meta")) as StadiumMeta;
    this.images = LAYERS.filter((layer) =>
      scene.textures.exists(key(style, layer))
    ).map((layer) => {
      const image = scene.add.image(0, 0, key(style, layer));
      image.setOrigin(0).setDepth(0);
      if (layer !== "base") image.setTint(colors[layer]);
      return image;
    });
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
    this.images.forEach((image) => image.destroy());
    this.images = [];
  }
}
