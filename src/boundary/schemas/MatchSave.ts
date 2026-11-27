import { z } from "zod";
import { gameSnapshotSchema } from "./GameSnapshot";
import { teamSchema } from "./Team";
import { matchDriveAssignmentSchema } from "./MatchDriveAssignment";
import { rNGStateSchema } from "./RNGState";
import { matchStatsSnapshotSchema } from "./MatchStatsSnapshot";
import { turnManagerStateSchema } from "./TurnManagerState";
import { competitionContextSchema } from "./CompetitionContext";
import { computerMatchSaveSchema } from "./ComputerMatchSave";
import type { MatchSave } from "../../headless/serialization";

export const matchSaveSchema: z.ZodType<MatchSave> = z.looseObject({
  version: z.literal(1),
  savedAt: z.number(),
  snapshot: gameSnapshotSchema,
  teams: z.union([
    z.tuple([teamSchema, teamSchema]),
    z.tuple([teamSchema, teamSchema, teamSchema, teamSchema]),
  ]),
  drive: matchDriveAssignmentSchema,
  rng: rNGStateSchema,
  matchStats: matchStatsSnapshotSchema,
  turnManager: turnManagerStateSchema.exactOptional(),
  competition: competitionContextSchema.exactOptional(),
  computer: computerMatchSaveSchema.exactOptional(),
});
