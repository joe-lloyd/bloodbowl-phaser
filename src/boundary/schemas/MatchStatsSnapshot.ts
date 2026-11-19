import { z } from "zod";
import { playerMatchStatsSchema } from "./PlayerMatchStats";
import type { MatchStatsSnapshot } from "../../game/progression/MatchStats";

export const matchStatsSnapshotSchema: z.ZodType<MatchStatsSnapshot> =
  z.looseObject({
    version: z.literal(1),
    progressionEnabled: z.boolean(),
    applied: z.boolean(),
    concedingTeamId: z.string().exactOptional(),
    players: playerMatchStatsSchema.array(),
  });
