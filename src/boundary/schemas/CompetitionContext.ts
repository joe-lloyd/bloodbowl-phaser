import { z } from "zod";
import { competitionTypeSchema } from "./CompetitionType";
import type { CompetitionContext } from "../../competition/types";

export const competitionContextSchema: z.ZodType<CompetitionContext> =
  z.looseObject({
    ruleset: z
      .union([z.literal("gw-2025"), z.literal("naf-sevens-2026-09-26")])
      .exactOptional(),
    competitionType: competitionTypeSchema,
    competitionId: z.string(),
    fixtureId: z.string(),
    knockout: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  });
