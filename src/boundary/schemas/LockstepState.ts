import { z } from "zod";
import { gameSnapshotSchema } from "./GameSnapshot";
import { teamSchema } from "./Team";
import { pendingDecisionSchema } from "./PendingDecision";
import { rNGStateSchema } from "./RNGState";
import { matchStatsSnapshotSchema } from "./MatchStatsSnapshot";
import { headlessCommandSchema } from "./HeadlessCommand";
import type { LockstepState } from "../../network/envelope";

export const lockstepStateSchema: z.ZodType<LockstepState> = z.looseObject({
  snapshot: gameSnapshotSchema,
  teams: z.tuple([teamSchema, teamSchema]),
  pending: z.union([z.null(), pendingDecisionSchema]),
  rng: rNGStateSchema,
  matchStats: matchStatsSnapshotSchema,
  applied: z.number(),
  replay: headlessCommandSchema.array(),
  checksum: z.string(),
});
