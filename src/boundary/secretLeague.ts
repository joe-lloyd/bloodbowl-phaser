import { z } from "zod";
import teamFile from "../data/secretLeague/secretLeagueTeamBlueprints.json" with { type: "json" };
import playerFile from "../data/secretLeague/secretLeaguePlayerBlueprints.json" with { type: "json" };
import skillFile from "../data/secretLeague/secretLeagueTraitsAndSkills.json" with { type: "json" };
import ruleFile from "../data/secretLeague/secretLeagueTeamSpecialRules.json" with { type: "json" };
import artFile from "../data/secretLeague/secretLeaguePositionModels.json" with { type: "json" };

function reference(folder: string) {
  const prefix = `${folder}/`;
  return z
    .string()
    .startsWith(prefix)
    .transform((value) => value.slice(prefix.length));
}

const statLine = z.strictObject({
  ma: z.string(),
  st: z.string(),
  ag: z.string(),
  pa: z.string(),
  av: z.string(),
});

const playerBlueprint = z.strictObject({
  name: z.string(),
  cost: z.number().nullable(),
  keywords: z.array(z.string()),
  traitsAndSkills: z.array(reference("traitsAndSkills")),
  stats: statLine,
  primary: z.string(),
  secondary: z.string(),
});

const teamBlueprint = z.strictObject({
  name: z.string(),
  players: z.array(
    z.strictObject({
      quantity: z.string(),
      position: reference("playerBlueprints"),
    })
  ),
  rerollCost: z.number(),
  teamSpecialRules: z.array(reference("teamSpecialRules")),
  tier: z.number().nullable(),
  apothecary: z.boolean().nullable(),
  sourceUrl: z.string(),
});

const named = z.looseObject({ name: z.string() });

const teamArt = z.strictObject({
  catalogueName: z.string(),
  models: z.record(z.string(), z.string()),
});

export type SecretPlayerBlueprint = z.infer<typeof playerBlueprint>;
export type SecretTeamBlueprint = z.infer<typeof teamBlueprint>;

export const SECRET_LEAGUE_FILES = {
  teams: z
    .strictObject({ teamBlueprints: z.record(z.string(), teamBlueprint) })
    .parse(teamFile).teamBlueprints,
  players: z
    .strictObject({ playerBlueprints: z.record(z.string(), playerBlueprint) })
    .parse(playerFile).playerBlueprints,
  skills: z
    .strictObject({ traitsAndSkills: z.record(z.string(), named) })
    .parse(skillFile).traitsAndSkills,
  rules: z
    .strictObject({ teamSpecialRules: z.record(z.string(), named) })
    .parse(ruleFile).teamSpecialRules,
  art: z.record(z.string(), teamArt).parse(artFile),
};
