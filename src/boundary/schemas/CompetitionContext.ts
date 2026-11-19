import { z } from "zod";
import { sevensRulesetSchema } from "./SevensRuleset";
import { competitionTypeSchema } from "./CompetitionType";
import type { CompetitionContext } from "../../competition/types";

export const competitionContextSchema: z.ZodType<CompetitionContext> =
  z.looseObject({
    ruleset: sevensRulesetSchema.exactOptional(),
    competitionType: competitionTypeSchema,
    competitionId: z.string(),
    fixtureId: z.string(),
    knockout: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  });
