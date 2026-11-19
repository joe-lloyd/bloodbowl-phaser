import { z } from "zod";
import type { TournamentFormat } from "../../competition/types";

export const tournamentFormatSchema: z.ZodType<TournamentFormat> = z.union([
  z.literal("single-elimination"),
  z.literal("round-robin"),
]);
