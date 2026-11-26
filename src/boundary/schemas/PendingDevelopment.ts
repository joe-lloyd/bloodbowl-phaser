import { z } from "zod";
import { skillCategorySchema } from "./SkillCategory";
import { skillTypeSchema } from "./SkillType";
import { skillRollCandidateSchema } from "./SkillRollCandidate";
import type { PendingDevelopment } from "../../types/Team";

const primaryProgressSchema = z.looseObject({
  route: z.literal("primary"),
  playerId: z.string(),
  category: skillCategorySchema,
  named: skillTypeSchema.array(),
});

const secondaryProgressSchema = z.looseObject({
  route: z.literal("secondary"),
  playerId: z.string(),
  rolled: z
    .looseObject({
      category: skillCategorySchema,
      candidates: skillRollCandidateSchema.array(),
    })
    .exactOptional(),
});

const skillSelectionProgressSchema = z
  .union([primaryProgressSchema, secondaryProgressSchema])
  .exactOptional();

export const pendingDevelopmentSchema: z.ZodType<PendingDevelopment> = z.union([
  z.looseObject({
    id: z.string(),
    kind: z.literal("raised-dead-recruit"),
    playerId: z.string(),
    createdAt: z.number(),
  }),
  z.looseObject({
    id: z.string(),
    kind: z.literal("advanced-league-advancement"),
    playerId: z.string(),
    createdAt: z.number(),
  }),
  z.looseObject({
    id: z.string(),
    kind: z.literal("sevens-skill-selection"),
    matchId: z.string(),
    eligibleParticipantIds: z.string().array(),
    createdAt: z.number(),
    progress: skillSelectionProgressSchema,
  }),
  z.looseObject({
    id: z.string(),
    kind: z.literal("drafted-player-offer"),
    playerId: z.string(),
    roll: z.number(),
    addedSkillCount: z.number(),
    matchId: z.string(),
    createdAt: z.number(),
  }),
  z.looseObject({
    id: z.string(),
    kind: z.literal("journeyman-offer"),
    playerId: z.string(),
    matchId: z.string(),
    createdAt: z.number(),
  }),
  z.looseObject({
    id: z.string(),
    kind: z.literal("expensive-mistakes"),
    fixtureKey: z.string(),
    createdAt: z.number(),
  }),
]);
