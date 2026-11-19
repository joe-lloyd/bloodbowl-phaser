import { z } from "zod";
import { penaltyShootoutSchema } from "./PenaltyShootout";
import { fixtureWinningsSchema } from "./FixtureWinnings";
import type { FixtureResult } from "../../competition/types";

export const fixtureResultSchema: z.ZodType<FixtureResult> = z.looseObject({
  homeScore: z.number(),
  awayScore: z.number(),
  penalties: penaltyShootoutSchema.exactOptional(),
  winnerEntrantId: z.string().exactOptional(),
  completedAt: z.number(),
  bye: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  walkover: z
    .looseObject({
      withdrawnEntrantIndex: z.number(),
    })
    .exactOptional(),
  winnings: fixtureWinningsSchema.exactOptional(),
});
