import { z } from "zod";
import type { GamePhase } from "../../types/GameState";

export const gamePhaseSchema: z.ZodType<GamePhase> = z.union([
  z.literal("SANDBOX_IDLE"),
  z.literal("SETUP"),
  z.literal("KICKOFF"),
  z.literal("PLAY"),
  z.literal("TOUCHDOWN"),
  z.literal("HALFTIME"),
  z.literal("GAME_OVER"),
]);
