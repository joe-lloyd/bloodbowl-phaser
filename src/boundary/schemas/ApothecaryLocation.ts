import { z } from "zod";
import type { ApothecaryLocation } from "../../types/decisions";

export const apothecaryLocationSchema: z.ZodType<ApothecaryLocation> = z.union([
  z.literal("pitch"),
  z.literal("crowd"),
]);
