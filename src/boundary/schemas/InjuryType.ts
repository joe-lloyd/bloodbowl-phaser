import { z } from "zod";
import type { InjuryType } from "../../types/Player";

export const injuryTypeSchema: z.ZodType<InjuryType> = z.union([
  z.literal("Dead"),
  z.literal("None"),
  z.literal("Badly Hurt"),
  z.literal("Miss Next Game"),
  z.literal("Niggling Injury"),
  z.literal("-1 MA"),
  z.literal("-1 ST"),
  z.literal("-1 AG"),
  z.literal("-1 PA"),
  z.literal("-1 AV"),
]);
