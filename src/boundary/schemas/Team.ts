import { gameTypeSchema } from "./GameType";
import { z } from "zod";
import { rosterNameSchema } from "./RosterName";
import { teamColorsSchema } from "./TeamColors";
import { playerSchema } from "./Player";
import { formationSchema } from "./Formation";
import { seedMetadataSchema } from "./SeedMetadata";
import { sevensRulesetSchema } from "./SevensRuleset";
import { playedGameSchema } from "./PlayedGame";
import { teamAdvancementModeSchema } from "./TeamAdvancementMode";
import { matchedPlayAllocationSchema } from "./MatchedPlayAllocation";
import { inducementSelectionLineSchema } from "./InducementSelectionLine";
import { draftRecordSchema } from "./DraftRecord";
import { pendingDevelopmentSchema } from "./PendingDevelopment";
import { leagueSchema } from "./League";
import { favouredOfRuleSchema } from "./FavouredOfRule";
import { clubStateSchema } from "./ClubState";
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
  draftRuleset: sevensRulesetSchema.exactOptional(),
  gameType: gameTypeSchema.exactOptional(),
  recordedFixtureIds: z.string().array().exactOptional(),
  playedGames: playedGameSchema.array().exactOptional(),
  advancementMode: teamAdvancementModeSchema.exactOptional(),
  advancementModeLocked: z
    .union([z.literal(false), z.literal(true)])
    .exactOptional(),
  matchedPlayAllocations: matchedPlayAllocationSchema.array().exactOptional(),
  draftInducements: inducementSelectionLineSchema.array().exactOptional(),
  draftHistory: draftRecordSchema.array().exactOptional(),
  pendingDevelopment: pendingDevelopmentSchema.array().exactOptional(),
  computerCoached: z.literal(true).exactOptional(),
  computerTemplateId: z.string().exactOptional(),
  league: leagueSchema.exactOptional(),
  favouredOf: favouredOfRuleSchema.exactOptional(),
  club: clubStateSchema.exactOptional(),
});
