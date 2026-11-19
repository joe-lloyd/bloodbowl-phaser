import { z } from "zod";
import { skillTypeSchema } from "./SkillType";
import type { MatchGrant } from "../../game/inducements/matchInducements";

export const matchGrantSchema: z.ZodType<MatchGrant> = z.union([
  z.looseObject({
    kind: z.literal("skill"),
    playerId: z.string(),
    skill: skillTypeSchema,
  }),
  z.looseObject({
    kind: z.literal("stat"),
    playerId: z.string(),
    stat: z.union([z.literal("AV"), z.literal("ST"), z.literal("AG")]),
    delta: z.number(),
  }),
]);
