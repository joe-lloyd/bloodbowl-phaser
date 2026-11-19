import { z } from "zod";
import type { SubPhase } from "../../types/GameState";

export const subPhaseSchema: z.ZodType<SubPhase> = z.union([
  z.literal("INTRO"),
  z.literal("WEATHER"),
  z.literal("COIN_FLIP"),
  z.literal("SETUP_KICKING"),
  z.literal("SETUP_RECEIVING"),
  z.literal("SETUP_KICKOFF"),
  z.literal("ROLL_KICKOFF"),
  z.literal("RESOLVE_KICKOFF"),
  z.literal("PLACE_BALL"),
  z.literal("TURN_RECEIVING"),
  z.literal("TURN_KICKING"),
  z.literal("SCORING"),
  z.literal("RECOVER_KO"),
  z.literal("SECRET_WEAPONS"),
]);
