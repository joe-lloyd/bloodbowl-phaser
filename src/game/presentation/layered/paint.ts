import type { LayeredPalette } from "../../../boundary/layeredArt";
import type { TeamColors } from "../../../types/Team";

type Rgb = readonly [number, number, number];

const KIT_TONES = [0.42 / 0.96, 0.68 / 0.96, 1] as const;
const SHADE: Rgb = [20, 12, 26];
const SHADOW: Rgb = [34, 18, 48];
const LIGHT: Rgb = [255, 238, 216];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function numberRgb(n: number): Rgb {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampTint(colour: number, tone: number): Rgb {
  const c = numberRgb(colour);
  const stops: readonly (readonly [number, Rgb])[] = [
    [0, mix(c, SHADE, 0.8)],
    [0.5, mix(c, SHADOW, 0.45)],
    [0.78, c],
    [1, mix(c, LIGHT, 0.38)],
  ];
  for (let i = 1; i < stops.length; i += 1) {
    const [t1, c1] = stops[i] ?? [1, c];
    const [t0, c0] = stops[i - 1] ?? [0, c];
    if (tone <= t1) return mix(c0, c1, (tone - t0) / (t1 - t0));
  }
  return stops.at(-1)?.[1] ?? c;
}

export function colourTable(palette: LayeredPalette, colors: TeamColors): Uint8ClampedArray {
  const table = new Uint8ClampedArray(palette.colors.length * 4);
  palette.colors.forEach((hex, i) => {
    table.set([...hexRgb(hex), 255], i * 4);
  });
  const kits = [
    [palette.kit.kit1, colors.primary],
    [palette.kit.kit2, colors.secondary],
  ] as const;
  for (const [indices, colour] of kits) {
    indices.forEach((index, tone) => {
      table.set([...rampTint(colour, KIT_TONES[tone] ?? 1), 255], index * 4);
    });
  }
  return table;
}
