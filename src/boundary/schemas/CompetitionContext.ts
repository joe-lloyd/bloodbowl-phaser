import { gameTypeSchema } from "./GameType";
import { z } from "zod";
import { sevensRulesetSchema } from "./SevensRuleset";
import { competitionTypeSchema } from "./CompetitionType";
import { fixturePlaySchema } from "./FixturePlay";
import type { CompetitionContext } from "../../competition/types";

export const competitionContextSchema: z.ZodType<CompetitionContext> =
  z.looseObject({
    ruleset: sevensRulesetSchema.exactOptional(),
    gameType: gameTypeSchema.exactOptional(),
    competitionType: competitionTypeSchema,
    competitionId: z.string(),
    fixtureId: z.string(),
    knockout: z.union([z.literal(false), z.literal(true)]).exactOptional(),
    playOffs: z.literal(true).exactOptional(),
    playedVia: fixturePlaySchema.exactOptional(),
  });
