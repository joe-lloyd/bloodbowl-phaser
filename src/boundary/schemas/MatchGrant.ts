import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import type { MatchGrant } from "../../game/inducements/matchInducements";

const statNameSchema = z.union([
  z.literal("MA"),
  z.literal("ST"),
  z.literal("AG"),
  z.literal("PA"),
  z.literal("AV"),
]);

export const matchGrantSchema: z.ZodType<MatchGrant> = z.union([
  z.looseObject({
    kind: z.literal("skill"),
    playerId: z.string(),
    skill: skillTypeSchema,
  }),
  z.looseObject({
    kind: z.literal("stat"),
    playerId: z.string(),
    stat: statNameSchema,
    delta: z.number(),
  }),
]);
