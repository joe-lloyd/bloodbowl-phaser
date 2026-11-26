import type { LayeredModel, LookOption } from "../../../boundary/layeredArt";
import type { PlayerAppearance } from "../../../types/Player";

const SHADE = "~shade";

export interface ResolvedLook {
  readonly body: string;
  readonly layers: readonly string[];
  readonly shades: readonly string[];
  readonly choice: Readonly<Record<string, string>>;
}

export type Random = () => number;

function firstValue(option: LookOption): string {
  return option[2][0]?.[0] ?? "";
}

function chosen(option: LookOption, appearance: PlayerAppearance | undefined): string {
  const [name, , values] = option;
  const wanted = appearance?.[name];
  return values.some(([value]) => value === wanted) && wanted !== undefined ? wanted : firstValue(option);
}

function bodyOf(art: LayeredModel, choice: Readonly<Record<string, string>>): string {
  const [bodyOption] = art.layered.options;
  const bodies = Object.keys(art.layered.bodies);
  const wanted = bodyOption ? choice[bodyOption[0]] : undefined;
  return wanted !== undefined && bodies.includes(wanted) ? wanted : (bodies[0] ?? "");
}

export function resolveLook(art: LayeredModel, appearance: PlayerAppearance | undefined): ResolvedLook {
  const choice = Object.fromEntries(art.layered.options.map((option) => [option[0], chosen(option, appearance)]));
  const body = bodyOf(art, choice);
  const available = art.layered.bodies[body] ?? [];
  const parts = art.layered.options.slice(1).map(([name]) => `${name}.${choice[name] ?? ""}`);
  const chosenParts = parts.filter((layer) => available.includes(layer));
  const shades = chosenParts.map((layer) => layer + SHADE).filter((layer) => available.includes(layer));
  return { body, layers: ["base", ...chosenParts], shades, choice };
}

export function lookKey(model: string, look: ResolvedLook): string {
  return `${model}:${look.body}:${look.layers.join("+")}`;
}

export function randomAppearance(options: readonly LookOption[], random: Random): PlayerAppearance {
  return Object.fromEntries(
    options.map((option) => [option[0], option[2][Math.floor(random() * option[2].length)]?.[0] ?? firstValue(option)])
  );
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16_777_619);
  return hash >>> 0;
}

export function seededRandom(seed: string): Random {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}
