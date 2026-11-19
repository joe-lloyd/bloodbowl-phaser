import Phaser from "phaser";
import { MATCH_STYLE } from "../presentation/matchStyle";

import { parseStadiumMeta, type StadiumMeta } from "../../boundary/stadium";
export type {
  DugoutBox,
  DugoutSquares,
  StadiumMeta,
} from "../../boundary/stadium";

const LAYERS = ["base", "home", "away"] as const;

function key(part: string): string {
  return `stadium:${part}`;
}

export function preloadStadium(scene: Phaser.Scene) {
  const path = MATCH_STYLE.stadiumPath;
  scene.load.json(key("meta"), `${path}/meta.json`);
  for (const layer of LAYERS) {
    if (!scene.textures.exists(key(layer)))
      scene.load.image(key(layer), `${path}/${layer}.webp`);
  }
}

export class Stadium {
  public readonly meta: StadiumMeta;
  private image: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, colors: { home: number; away: number }) {
    this.meta = parseStadiumMeta(scene.cache.json.get(key("meta")));
    const layers = LAYERS.filter((layer) =>
      scene.textures.exists(key(layer))
    ).flatMap((layer) => {
      const image = scene.textures.get(key(layer)).getSourceImage();
      const tint = layer === "base" ? 0xffffff : colors[layer];
      return image instanceof HTMLImageElement ? [{ image, tint }] : [];
    });
    const [first, ...rest] = layers;
    if (!first) return;

    const canvas = flatten([first, ...rest]);
    const texture = scene.textures.create(
      key(`match-${Phaser.Math.RND.uuid()}`),
      canvas
    );
    if (!texture) return;
    texture.add("__BASE", 0, 0, 0, canvas.width, canvas.height);
    this.image = scene.add.image(0, 0, texture).setOrigin(0).setDepth(0);
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
