import Phaser from "phaser";
import { parseStadiumMeta, type StadiumMeta } from "../../boundary/stadium";
export type {
  DugoutBox,
  DugoutSquares,
  StadiumMeta,
} from "../../boundary/stadium";

const LAYERS = ["base", "home", "away"] as const;

function key(path: string, part: string): string {
  return `stadium:${path}:${part}`;
}

export function preloadStadium(scene: Phaser.Scene, path: string) {
  scene.load.json(key(path, "meta"), `${path}/meta.json`);
  for (const layer of LAYERS) {
    if (!scene.textures.exists(key(path, layer)))
      scene.load.image(key(path, layer), `${path}/${layer}.webp`);
  }
}

export interface TeamColours {
  home: number;
  away: number;
}

export class Stadium {
  public readonly meta: StadiumMeta;
  private image: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, path: string, colors: TeamColours) {
    this.meta = parseStadiumMeta(scene.cache.json.get(key(path, "meta")));
    const layers = LAYERS.filter((layer) =>
      scene.textures.exists(key(path, layer))
    ).flatMap((layer) => {
      const image = scene.textures.get(key(path, layer)).getSourceImage();
      const tint = layer === "base" ? 0xffffff : colors[layer];
      return image instanceof HTMLImageElement ? [{ image, tint }] : [];
    });
    const [first, ...rest] = layers;
    if (!first) return;

    const canvas = flatten([first, ...rest]);
    const texture = scene.textures.create(
      key(path, `match-${Phaser.Math.RND.uuid()}`),
      canvas
    );
    if (!texture) return;
    texture.add("__BASE", 0, 0, 0, canvas.width, canvas.height);
    this.image = scene.add.image(0, 0, texture).setOrigin(0).setDepth(0);
  }

  public get dugouts(): StadiumMeta["dugouts"] {
    return this.meta.dugouts;
  }

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

interface StadiumLayer {
  image: HTMLImageElement;
  tint: number;
}

function flatten(layers: [StadiumLayer, ...StadiumLayer[]]): HTMLCanvasElement {
  const { width, height } = layers[0].image;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas to flatten the stadium on");
  const out = context.createImageData(width, height);
  for (const { image, tint } of layers) {
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    blendPixels(out.data, context.getImageData(0, 0, width, height).data, tint);
  }
  context.putImageData(out, 0, 0);
  return canvas;
}

function blendPixels(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  tint: number
): void {
  const channels = [
    ((tint >> 16) & 0xff) / 255,
    ((tint >> 8) & 0xff) / 255,
    (tint & 0xff) / 255,
  ];
  for (let i = 0; i < target.length; i += 4) {
    const alpha = (source[i + 3] ?? 0) / 255;
    if (alpha === 0) continue;
    channels.forEach((channel, offset) => {
      const index = i + offset;
      target[index] =
        (source[index] ?? 0) * channel * alpha +
        (target[index] ?? 0) * (1 - alpha);
    });
    target[i + 3] = 255 * alpha + (target[i + 3] ?? 0) * (1 - alpha);
  }
}
