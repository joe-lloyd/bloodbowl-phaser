import { z } from "zod";
import { keyWordSchema } from "./KeyWord";
import { playerStatsSchema } from "./PlayerStats";
import { skillSchema } from "./Skill";
import { skillCategorySchema } from "./SkillCategory";
import { playerAdvancementSchema } from "./PlayerAdvancement";
import { pendingAdvancementRollSchema } from "./PendingAdvancementRoll";
import { playerStatusSchema } from "./PlayerStatus";
import { playerConditionInstanceSchema } from "./PlayerConditionInstance";
import { injuryTypeSchema } from "./InjuryType";
import { playerCareerStatsSchema } from "./PlayerCareerStats";
import type { Player } from "../../types/Player";

export const playerSchema: z.ZodType<Player> = z.looseObject({
  id: z.string(),
  playerName: z.string(),
  positionName: z.string(),
  number: z.number(),
  keywords: z
    .unknown()
    .array()
    .transform((items) =>
      items.flatMap((item) => {
        const known = keyWordSchema.safeParse(item);
        return known.success ? known.data : [];
      })
    ),
  teamId: z.string(),
  stats: playerStatsSchema,
  baseStats: playerStatsSchema,
  skills: skillSchema.array(),
  primary: skillCategorySchema.array().exactOptional(),
  secondary: skillCategorySchema.array().exactOptional(),
  spp: z.number(),
  level: z.number(),
  playerKind: z
    .union([z.literal("roster"), z.literal("journeyman"), z.literal("star")])
    .exactOptional(),
  advancements: playerAdvancementSchema.array().exactOptional(),
  characteristicAdvances: z
    .looseObject({
      AV: z.number().exactOptional(),
      ST: z.number().exactOptional(),
      AG: z.number().exactOptional(),
      MA: z.number().exactOptional(),
      PA: z.number().exactOptional(),
    })
    .exactOptional(),
  pendingAdvancementRoll: pendingAdvancementRollSchema.exactOptional(),
  status: playerStatusSchema,
  conditions: playerConditionInstanceSchema.array().exactOptional(),
  injuries: injuryTypeSchema.array(),
  hasActed: z.boolean(),
  plagueRiddenUsed: z
    .union([z.literal(false), z.literal(true)])
    .exactOptional(),
  gridPosition: z
    .looseObject({
      x: z.number(),
      y: z.number(),
    })
    .exactOptional(),
  sewerPit: z
    .looseObject({
      x: z.number(),
      y: z.number(),
    })
    .exactOptional(),
  cost: z.number(),
  teamValue: z.number(),
  timesKeptFromDraft: z.number().exactOptional(),
  careerStats: playerCareerStatsSchema.exactOptional(),
  veteran: z.literal(true).exactOptional(),
  teamCaptain: z.literal(true).exactOptional(),
  hydrationWarning: z.string().exactOptional(),
  appearance: z.record(z.string(), z.string()).exactOptional(),
});
