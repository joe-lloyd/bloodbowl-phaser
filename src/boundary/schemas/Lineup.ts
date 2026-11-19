import { z } from "zod";
import type { Lineup } from "../../simulation/runMatch";

export const lineupSchema: z.ZodType<Lineup> = z.union([
  z.literal("test-team"),
  z.literal("sevens-lineup"),
]);
