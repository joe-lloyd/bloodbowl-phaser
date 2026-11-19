import { z } from "zod";
import type { DopeStat } from "../../types/decisions";

export const dopeStatSchema: z.ZodType<DopeStat> = z.union([
  z.literal("ST"),
  z.literal("AG"),
]);
