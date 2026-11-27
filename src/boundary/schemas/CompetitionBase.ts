import { gameTypeSchema } from "./GameType";
import { z } from "zod";
import { sevensRulesetSchema } from "./SevensRuleset";
import { competitionStatusSchema } from "./CompetitionStatus";
import { competitionEntrantSchema } from "./CompetitionEntrant";
import { competitionFixtureSchema } from "./CompetitionFixture";
import { standingSchema } from "./Standing";
import { seedMetadataSchema } from "./SeedMetadata";
import { rosterRuleProfileSchema } from "./RosterRuleProfile";
import { difficultySchema } from "./Difficulty";
import { onlineSetupSchema } from "./OnlineSetup";
import type { CompetitionBase } from "../../competition/types";

export const competitionBaseSchema: z.ZodType<CompetitionBase> = z.looseObject({
  ruleset: sevensRulesetSchema.exactOptional(),
  gameType: gameTypeSchema.exactOptional(),
  gameTypePool: gameTypeSchema.array().exactOptional(),
  id: z.string(),
  name: z.string(),
  organizerUid: z.union([z.null(), z.string()]),
  participantUids: z.string().array(),
  status: competitionStatusSchema,
  entrants: competitionEntrantSchema.array(),
  fixtures: competitionFixtureSchema.array(),
  standings: standingSchema.array(),
  reporterEntrantIndex: z.number().exactOptional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  seedMetadata: seedMetadataSchema.exactOptional(),
  rosterProfile: rosterRuleProfileSchema.exactOptional(),
  computerDifficulty: difficultySchema.exactOptional(),
  online: onlineSetupSchema.exactOptional(),
});
