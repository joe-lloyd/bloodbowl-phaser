import { z } from "zod";
import { rosterNameSchema } from "./RosterName";
import { teamColorsSchema } from "./TeamColors";
import { playerSchema } from "./Player";
import { formationSchema } from "./Formation";
import { seedMetadataSchema } from "./SeedMetadata";
import { playedGameSchema } from "./PlayedGame";
import { matchedPlayAllocationSchema } from "./MatchedPlayAllocation";
import { inducementSelectionLineSchema } from "./InducementSelectionLine";
import { draftRecordSchema } from "./DraftRecord";
import { pendingDevelopmentSchema } from "./PendingDevelopment";
import type { Team } from "../../types/Team";

export const teamSchema: z.ZodType<Team> = z.looseObject({
  id: z.string(),
  name: z.string(),
  coachName: z.string().exactOptional(),
  rosterName: rosterNameSchema,
  colors: teamColorsSchema,
  players: playerSchema.array(),
  maxRosterSize: z.number(),
  formations: formationSchema.array(),
  treasury: z.number(),
  startingTreasury: z.number(),
  rerolls: z.number(),
  rerollCost: z.number(),
  apothecary: z.boolean(),
  coaches: z.number(),
  cheerleaders: z.number(),
  dedicatedFans: z.number(),
  teamValue: z.number(),
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  touchdowns: z.number(),
  casualties: z.number(),
  firstMatchPlayedAt: z.number().exactOptional(),
  seedMetadata: seedMetadataSchema.exactOptional(),
  activeCompetitionId: z.string().exactOptional(),
  draftRuleset: z
    .union([z.literal("gw-2025"), z.literal("naf-sevens-2026-09-26")])
    .exactOptional(),
  recordedFixtureIds: z.string().array().exactOptional(),
  playedGames: playedGameSchema.array().exactOptional(),
  advancementMode: z
    .union([
      z.literal("sevens-skill-selection"),
      z.literal("matched-play"),
      z.literal("advanced-league"),
    ])
    .exactOptional(),
  advancementModeLocked: z
    .union([z.literal(false), z.literal(true)])
    .exactOptional(),
  matchedPlayAllocations: matchedPlayAllocationSchema.array().exactOptional(),
  draftInducements: inducementSelectionLineSchema.array().exactOptional(),
  draftHistory: draftRecordSchema.array().exactOptional(),
  pendingDevelopment: pendingDevelopmentSchema.array().exactOptional(),
  computerCoached: z.literal(true).exactOptional(),
  computerTemplateId: z.string().exactOptional(),
  league: z
    .union([
      z.literal("Badlands Brawl"),
      z.literal("Chaos Clash"),
      z.literal("Lustrian Superleague"),
      z.literal("Elven Kingdoms League"),
      z.literal("Old World Classic"),
      z.literal("Worlds Edge Superleague"),
      z.literal("Sylvanian Spotlight"),
      z.literal("Underworld Challenge"),
      z.literal("Halfling Thimble Cup"),
      z.literal("Woodland League"),
    ])
    .exactOptional(),
  favouredOf: z
    .union([
      z.literal("Favoured of Hashut"),
      z.literal("Favoured of Khorne"),
      z.literal("Favoured of Nurgle"),
      z.literal("Favoured of Slaanesh"),
      z.literal("Favoured of Tzeentch"),
      z.literal("Favoured of Undivided"),
    ])
    .exactOptional(),
});
