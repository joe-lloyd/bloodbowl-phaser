import { z } from "zod";
import type { ActionType } from "../../types/gameEvents/match";

export const actionTypeSchema: z.ZodType<ActionType> = z.union([
  z.literal("move"),
  z.literal("block"),
  z.literal("multipleBlock"),
  z.literal("blitz"),
  z.literal("pass"),
  z.literal("punt"),
  z.literal("handoff"),
  z.literal("foul"),
  z.literal("standUp"),
  z.literal("throwTeamMate"),
  z.literal("secureBall"),
  z.literal("special"),
  z.literal("stab"),
  z.literal("breatheFire"),
  z.literal("vomit"),
  z.literal("gaze"),
  z.literal("chomp"),
  z.literal("chainsaw"),
  z.literal("throwBomb"),
  z.literal("ballAndChain"),
  z.literal("forgoe"),
]);
