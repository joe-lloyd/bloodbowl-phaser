import { VAMPIRE_NAME_BOOKS } from "./vampireNames";

export type Gender = "male" | "female";

interface HouseParts {
  readonly prefixes: readonly string[];
  readonly suffixes: readonly string[];
  readonly particles: readonly string[];
}

export interface NameBook {
  readonly given: Readonly<Record<Gender, readonly string[]>>;
  readonly surnames: readonly string[];
  readonly house: HouseParts;
  readonly epithets: readonly string[];
}

export interface PlayerName {
  readonly given: string;
  readonly family: string;
  readonly epithet?: string;
}

export type Random = () => number;

const NAME_BOOKS: Readonly<Record<string, Readonly<Record<string, NameBook>>>> = {
  Vampire: VAMPIRE_NAME_BOOKS,
};

const EPITHET_CHANCE = 0.3;
const HOUSE_CHANCE = 0.5;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list");
  return item;
}

function houseName(house: HouseParts, random: Random): string {
  const root = `${pick(house.prefixes, random)}${pick(house.suffixes, random)}`;
  return house.particles.length > 0 ? `${pick(house.particles, random)} ${root}` : root;
}

export function nameBookFor(rosterName: string, positionName: string): NameBook | undefined {
  return NAME_BOOKS[rosterName]?.[positionName];
}

export function generatePlayerName(book: NameBook, gender: Gender, random: Random = Math.random): PlayerName {
  const given = pick(book.given[gender], random);
  const family = random() < HOUSE_CHANCE ? houseName(book.house, random) : pick(book.surnames, random);
  const name = { given, family };
  return random() < EPITHET_CHANCE ? { ...name, epithet: pick(book.epithets, random) } : name;
}

export function formatPlayerName(name: PlayerName): string {
  const full = `${name.given} ${name.family}`;
  return name.epithet ? `${full}, ${name.epithet}` : full;
}
