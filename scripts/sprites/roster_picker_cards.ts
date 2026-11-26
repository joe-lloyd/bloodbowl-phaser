import { mkdirSync, writeFileSync } from "node:fs";
import {
  parseLayeredModels,
  type LayerData,
} from "../../src/boundary/layeredArt";
import { COMPUTER_TEAM_CATALOGUE } from "../../src/data/computerTeamCatalogue";
import {
  getAvailableRosterNames,
  getRosterByRosterName,
} from "../../src/data/RosterTemplates";
import { composeFrame } from "../../src/game/presentation/layered/compose";
import {
  finishFrame,
  type FinishedFrame,
} from "../../src/game/presentation/layered/finish";
import { resolveLook } from "../../src/game/presentation/layered/looks";
import { colourTable } from "../../src/game/presentation/layered/paint";
import secretLeagueModels from "../../src/data/community/secretLeagueModels.json";
import secretLeagueRosters from "../../src/data/community/secretLeague2025.json";
import manifest from "../../src/game/presentation/spriteManifest.json";
import { encodePng, readLayerFiles } from "./spriteFiles";
import { PositionKeyWord, type PlayerTemplate } from "../../src/types/Player";
import type { RosterName, TeamColors } from "../../src/types/Team";

const WIDTH = 220;
const HEIGHT = 126;
const IDLE_FRAMES = 8;
const OUTPUT = "public/assets/roster-picker";

const layered = parseLayeredModels(manifest);
const rosterModels: Record<string, Record<string, string>> = manifest.positions;
const rawLayers = new Map<string, LayerData>();

interface Character {
  readonly frames: readonly FinishedFrame[];
  readonly palette: Uint8ClampedArray;
  readonly height: number;
}

interface Placement {
  readonly x: number;
  readonly foot: number;
  readonly height: number;
}

interface DrawTarget {
  readonly bytes: Buffer;
  readonly stride: number;
  readonly origin: number;
}

const POSITIONS: readonly Placement[] = [
  { x: 54, foot: 86, height: 80 },
  { x: 110, foot: 82, height: 76 },
  { x: 166, foot: 86, height: 80 },
  { x: 33, foot: 112, height: 91 },
  { x: 83, foot: 121, height: 100 },
  { x: 138, foot: 121, height: 100 },
  { x: 187, foot: 112, height: 91 },
];

function readLayer(base: string): LayerData {
  const cached = rawLayers.get(base);
  if (cached) return cached;
  const data = readLayerFiles(base);
  rawLayers.set(base, data);
  return data;
}

function character(model: string, colors: TeamColors): Character {
  const art = layered.get(model);
  if (!art) throw new Error(`No layered art for ${model}`);
  const look = resolveLook(art, undefined);
  const base = `public/sprites/bloodbowl/${model}/layered/${look.body}`;
  const layers = {
    layers: look.layers.map((part) => readLayer(`${base}/${part}`)),
    shades: look.shades.map((part) => readLayer(`${base}/${part}`)),
  };
  const frames = Array.from(
    { length: art.animations["idle"] ?? 0 },
    (_, frame) =>
      finishFrame(
        composeFrame(layers, `idle/s/${String(frame)}`),
        art.layered.palette
      )
  );
  if (
    frames.length !== IDLE_FRAMES ||
    frames.some((frame) => frame.height === 0)
  ) {
    throw new Error(`Expected ${String(IDLE_FRAMES)} idle frames for ${model}`);
  }
  return {
    frames,
    palette: colourTable(art.layered.palette, colors),
    height: Math.max(...frames.map((frame) => frame.height)),
  };
}

function representatives(players: readonly PlayerTemplate[]): PlayerTemplate[] {
  const lineman =
    players.find((player) =>
      player.keywords.includes(PositionKeyWord.LINEMAN)
    ) ?? players[0];
  const biggest = [...players].sort((a, b) => b.stats.ST - a.stats.ST)[0];
  if (!lineman || !biggest)
    throw new Error("Cannot illustrate an empty roster");
  const unique = [...new Set([lineman, biggest, ...players])].slice(0, 7);
  return [
    ...unique,
    ...Array.from({ length: 7 - unique.length }, () => lineman),
  ];
}

function lineupOf(models: readonly string[], colors: TeamColors): Character[] {
  const cache = new Map<string, Character>();
  return models
    .map((model) => {
      const cached = cache.get(model);
      if (cached) return cached;
      const figure = character(model, colors);
      cache.set(model, figure);
      return figure;
    })
    .sort((a, b) => b.height - a.height);
}

const SECRET_COLORS: TeamColors = { primary: 0x5a2a7a, secondary: 0xc8a04a };
const secretModels: Record<string, Record<string, string>> = secretLeagueModels;

function secretLineup(
  roster: (typeof secretLeagueRosters)[number]
): Character[] {
  const models = secretModels[roster.name];
  if (!models) throw new Error(`No models listed for ${roster.name}`);
  const modelOf = (position: string) => {
    const model = models[position];
    if (!model) throw new Error(`No model for ${roster.name} ${position}`);
    return model;
  };
  const [first, ...rest] = roster.positions;
  if (!first) throw new Error(`Cannot illustrate an empty roster`);
  const dearest = [...rest].sort((a, b) => b.cost - a.cost);
  const picks = [first, ...dearest].slice(0, 7).map((p) => modelOf(p.name));
  const filler = modelOf(first.name);
  return lineupOf(
    [...picks, ...Array.from({ length: 7 - picks.length }, () => filler)],
    SECRET_COLORS
  );
}

function rosterLineup(name: RosterName): Character[] {
  const roster = getRosterByRosterName(name);
  const examples = representatives(roster.playerTemplates);
  const colors = COMPUTER_TEAM_CATALOGUE.find(
    (entry) => entry.rosterName === name
  )?.colors ?? { primary: 0x8e1b1b, secondary: 0xffffff };
  return lineupOf(
    examples.map(({ positionName }) => {
      const model = rosterModels[name]?.[positionName];
      if (!model) throw new Error(`Missing model for ${name} ${positionName}`);
      return model;
    }),
    colors
  );
}

function copyPixel(
  target: DrawTarget,
  source: { frame: FinishedFrame; palette: Uint8ClampedArray },
  point: { x: number; y: number; px: number; py: number }
): void {
  if (point.x < 0 || point.x >= WIDTH || point.y < 0 || point.y >= HEIGHT)
    return;
  const index =
    source.frame.pixels[point.py * source.frame.width + point.px] ?? -1;
  if (index < 0) return;
  const address = point.y * target.stride + (target.origin + point.x) * 4;
  target.bytes.set(source.palette.subarray(index * 4, index * 4 + 4), address);
}

function paint(
  target: DrawTarget,
  characterAtSpot: { figure: Character; placement: Placement },
  index: number
): void {
  const { figure, placement } = characterAtSpot;
  const frame = figure.frames[index];
  const first = figure.frames[0];
  if (!frame || !first) throw new Error("Missing idle frame");
  const scale = Math.min(0.72, placement.height / figure.height);
  const x = Math.round(
    placement.x + (frame.x - first.x - first.width / 2) * scale
  );
  const y = Math.round(
    placement.foot + (frame.y - first.y - first.height) * scale
  );
  const source = { frame, palette: figure.palette };
  for (let row = 0; row < Math.round(frame.height * scale); row++) {
    for (let col = 0; col < Math.round(frame.width * scale); col++) {
      copyPixel(target, source, {
        x: x + col,
        y: y + row,
        px: Math.floor(col / scale),
        py: Math.floor(row / scale),
      });
    }
  }
}

function makeStrip(lineup: readonly Character[]): Buffer {
  const stride = WIDTH * IDLE_FRAMES * 4;
  const bytes = Buffer.alloc(stride * HEIGHT);
  for (let frame = 0; frame < IDLE_FRAMES; frame++) {
    for (const [i, figure] of lineup.entries()) {
      const placement = POSITIONS[i];
      if (!placement) throw new Error("Lineup has too many players");
      paint(
        { bytes, stride, origin: frame * WIDTH },
        { figure, placement },
        (frame + i * 3) % IDLE_FRAMES
      );
    }
  }
  return encodePng({ pixels: bytes, width: WIDTH * IDLE_FRAMES, height: HEIGHT });
}

mkdirSync(OUTPUT, { recursive: true });
for (const name of getAvailableRosterNames()) {
  const lineup = rosterLineup(name);
  writeFileSync(`${OUTPUT}/${name}.png`, makeStrip(lineup));
  rawLayers.clear();
}
mkdirSync(`${OUTPUT}/secret`, { recursive: true });
for (const roster of secretLeagueRosters) {
  writeFileSync(
    `${OUTPUT}/secret/${roster.name}.png`,
    makeStrip(secretLineup(roster))
  );
  rawLayers.clear();
}
