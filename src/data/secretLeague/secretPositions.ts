import type { SecretPlayerBlueprint } from "../../boundary/secretLeague";
import {
  type KeyWord,
  type PlayerStats,
  type PlayerTemplate,
  PositionKeyWord,
  RaceKeyWord,
  TraitKeyWord,
} from "../../types/Player";
import { SkillCategory } from "../../types/Skills";
import { type Parsed, found, missing, problemsOf } from "./parsed";
import { secretSkill } from "./secretSkills";

const CATEGORY_LETTERS: Readonly<Record<string, SkillCategory>> = {
  A: SkillCategory.AGILITY,
  D: SkillCategory.DEVIOUS,
  G: SkillCategory.GENERAL,
  M: SkillCategory.MUTATION,
  P: SkillCategory.PASSING,
  S: SkillCategory.STRENGTH,
};

const KNOWN_KEYWORDS: readonly KeyWord[] = [
  ...Object.values(RaceKeyWord),
  ...Object.values(PositionKeyWord),
  ...Object.values(TraitKeyWord),
];

const KEYWORD_SPELLINGS: Readonly<Record<string, readonly string[]>> = {
  Linemen: ["Lineman"],
  Humans: ["Human"],
  Blockers: ["Blocker"],
  "Blocker Human": ["Blocker", "Human"],
  "Blitzer Human": ["Blitzer", "Human"],
  "Dwarf Runner": ["Dwarf", "Runner"],
  "Undead Zombie": ["Undead", "Zombie"],
  "Special Undead": ["Special", "Undead"],
  "Big Guy. Troll": ["Big Guy", "Troll"],
};

const STAT = /^(\d{1,2})\+?$/;
const NO_PASSING = "-";
const QUANTITY = /^0-(\d+)$/;

function keywords(raw: readonly string[]): KeyWord[] {
  return raw
    .flatMap((keyword) => KEYWORD_SPELLINGS[keyword] ?? [keyword])
    .flatMap((keyword) => KNOWN_KEYWORDS.filter((known) => known === keyword));
}

function categories(code: string): Parsed<SkillCategory[]> {
  const letters = code === NO_PASSING ? [] : (code.match(/./gsu) ?? []);
  const list = letters.flatMap((letter) => CATEGORY_LETTERS[letter] ?? []);
  return list.length === letters.length
    ? found(list)
    : missing(`skill access "${code}"`);
}

function statValue(raw: string): number | undefined {
  const digits = STAT.exec(raw)?.[1];
  return digits === undefined ? undefined : Number(digits);
}

function statLine(stats: SecretPlayerBlueprint["stats"]): Parsed<PlayerStats> {
  const MA = statValue(stats.ma);
  const ST = statValue(stats.st);
  const AG = statValue(stats.ag);
  const PA = stats.pa === NO_PASSING ? 0 : statValue(stats.pa);
  const AV = statValue(stats.av);
  if (MA === undefined || ST === undefined || AG === undefined)
    return missing(`stats ${Object.values(stats).join("/")}`);
  if (PA === undefined || AV === undefined)
    return missing(`stats ${Object.values(stats).join("/")}`);
  return found({ MA, ST, AG, PA, AV });
}

function maxAllowed(quantity: string): Parsed<number> {
  const digits = QUANTITY.exec(quantity)?.[1];
  return digits === undefined
    ? missing(`quantity "${quantity}"`)
    : found(Number(digits));
}

function cost(value: number | null): Parsed<number> {
  return value === null ? missing("no cost") : found(value);
}

export function secretPosition(
  blueprint: SecretPlayerBlueprint,
  quantity: string
): Parsed<PlayerTemplate> {
  const parts = {
    cost: cost(blueprint.cost),
    stats: statLine(blueprint.stats),
    maxAllowed: maxAllowed(quantity),
    primary: categories(blueprint.primary),
    secondary: categories(blueprint.secondary),
  };
  const skills = blueprint.traitsAndSkills.map((element) => secretSkill(element));
  const { cost: price, stats, primary, secondary } = parts;
  if (
    !price.ok ||
    !stats.ok ||
    !parts.maxAllowed.ok ||
    !primary.ok ||
    !secondary.ok
  )
    return labelled(
      blueprint.name,
      problemsOf([...Object.values(parts), ...skills])
    );
  const known = skills.flatMap((skill) => (skill.ok ? [skill.value] : []));
  if (known.length < skills.length)
    return labelled(blueprint.name, problemsOf(skills));
  return found({
    positionName: blueprint.name,
    keywords: keywords(blueprint.keywords),
    cost: price.value,
    stats: stats.value,
    skills: known,
    maxAllowed: parts.maxAllowed.value,
    primary: primary.value,
    secondary: secondary.value,
  });
}

function labelled(name: string, problems: readonly string[]): Parsed<never> {
  return {
    ok: false,
    problems: problems.map((problem) => `${name}: ${problem}`),
  };
}
