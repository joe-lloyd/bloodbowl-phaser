import { z } from "zod";
import { teamSchema } from "./Team";
import { rNGStateSchema } from "./RNGState";
import { matchStatsSnapshotSchema } from "./MatchStatsSnapshot";
import type { MatchResume } from "../../firebase/lobby";

export const matchResumeSchema: z.ZodType<MatchResume> = z.looseObject({
  teams: z.tuple([teamSchema, teamSchema]).exactOptional(),
  rng: rNGStateSchema,
  matchStats: matchStatsSnapshotSchema,
  applied: z.number(),
});
