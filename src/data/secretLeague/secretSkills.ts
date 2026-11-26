import { SECRET_LEAGUE_FILES } from "../../boundary/secretLeague";
import {
  SKILL_DEFINITIONS,
  type Skill,
  SkillType,
  getSkill,
} from "../../types/Skills";
import { type Parsed, found, letters, missing } from "./parsed";

const SPELLINGS: ReadonlyMap<string, SkillType> = new Map([
  ...Object.values(SkillType).map((type) => [letters(type), type] as const),
  ["pogostick", SkillType.POGO],
  ["timmber", SkillType.TIMMM_BER],
  ["unchanneledfury", SkillType.UNCHANNELLED_FURY],
  ["ballandchain", SkillType.BALL_AND_CHAIN],
  ["multiblock", SkillType.MULTIPLE_BLOCK],
]);

const ID_SUFFIXES: readonly (readonly [string, string | undefined])[] = [
  ["twoplus", "2+"],
  ["threeplus", "3+"],
  ["fourplus", "4+"],
  ["fiveplus", "5+"],
  ["allteammates", "all"],
  ["plusone", undefined],
];

const NAME_WITH_PARAMETER = /^(.+?) \((.+)\)$/;

function notInGame(name: string): Parsed<Skill> {
  return missing(`skill not in this game: ${name}`);
}

function withParameter(type: SkillType, parameter: string | undefined): Skill {
  return parameter === undefined ? getSkill(type) : getSkill(type, parameter);
}

function skillFromName(name: string): Parsed<Skill> {
  const exact = SPELLINGS.get(letters(name));
  if (exact) return found(getSkill(exact));
  const [, base = name, parameter] = NAME_WITH_PARAMETER.exec(name) ?? [];
  const type = SPELLINGS.get(letters(base));
  if (!type || !SKILL_DEFINITIONS[type].parameterForm) return notInGame(name);
  return found(withParameter(type, parameter));
}

function skillFromId(id: string): Parsed<Skill> {
  const key = letters(id);
  const exact = SPELLINGS.get(key);
  if (exact) return found(getSkill(exact));
  for (const [suffix, parameter] of ID_SUFFIXES) {
    const type = key.endsWith(suffix)
      ? SPELLINGS.get(key.slice(0, -suffix.length))
      : undefined;
    if (type) return found(withParameter(type, parameter));
  }
  return notInGame(id);
}

export function secretSkill(id: string): Parsed<Skill> {
  const named = SECRET_LEAGUE_FILES.skills[id];
  return named ? skillFromName(named.name) : skillFromId(id);
}
