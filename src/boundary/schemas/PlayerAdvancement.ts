import { z } from "zod";
import type { PlayerAdvancement } from "../../types/Player";

export const playerAdvancementSchema: z.ZodType<PlayerAdvancement> =
  z.looseObject({
    id: z.string(),
    type: z.union([
      z.literal("primary-skill"),
      z.literal("secondary-skill"),
      z.literal("characteristic"),
    ]),
    name: z.string(),
    sppCost: z.number(),
    valueIncrease: z.number(),
    elite: z.union([z.literal(false), z.literal(true)]).exactOptional(),
    source: z
      .union([
        z.literal("advanced-league-spp"),
        z.literal("matched-play-package"),
        z.literal("sevens-skill-selection"),
      ])
      .exactOptional(),
    sourceMatchId: z.string().exactOptional(),
    candidateRolls: z
      .looseObject({
        skill: z.string(),
        firstD6: z.number(),
        secondD6: z.number(),
      })
      .array()
      .exactOptional(),
  });
