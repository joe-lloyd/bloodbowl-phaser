import { z } from "zod";
import type { ApothecaryResultKind } from "../../types/decisions";

export const apothecaryResultKindSchema: z.ZodType<ApothecaryResultKind> =
  z.union([z.literal("ko"), z.literal("casualty")]);
