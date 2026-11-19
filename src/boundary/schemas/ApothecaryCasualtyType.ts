import { z } from "zod";
import type { ApothecaryCasualtyType } from "../../types/decisions";

export const apothecaryCasualtyTypeSchema: z.ZodType<ApothecaryCasualtyType> =
  z.union([
    z.literal("badly-hurt"),
    z.literal("seriously-hurt"),
    z.literal("dead"),
  ]);
