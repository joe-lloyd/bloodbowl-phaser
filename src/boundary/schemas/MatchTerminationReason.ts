import { z } from "zod";
import type { MatchTerminationReason } from "../../types/GameState";

export const matchTerminationReasonSchema: z.ZodType<MatchTerminationReason> =
  z.union([
    z.literal("completed"),
    z.literal("concession"),
    z.literal("forfeit"),
  ]);
