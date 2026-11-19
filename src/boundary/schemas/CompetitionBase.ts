import { z } from "zod";
import { competitionStatusSchema } from "./CompetitionStatus";
import { competitionEntrantSchema } from "./CompetitionEntrant";
import { competitionFixtureSchema } from "./CompetitionFixture";
import { standingSchema } from "./Standing";
import { seedMetadataSchema } from "./SeedMetadata";
import { rosterRuleProfileSchema } from "./RosterRuleProfile";
import type { CompetitionBase } from "../../competition/types";

export const competitionBaseSchema: z.ZodType<CompetitionBase> = z.looseObject({
  ruleset: z
    .union([z.literal("gw-2025"), z.literal("naf-sevens-2026-09-26")])
    .exactOptional(),
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
  computerDifficulty: z
    .union([z.literal("standard"), z.literal("hard"), z.literal("legend")])
    .exactOptional(),
});
