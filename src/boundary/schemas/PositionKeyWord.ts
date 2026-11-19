import { z } from "zod";
import type { PositionKeyWord } from "../../types/Player";

export const positionKeyWordSchema: z.ZodType<PositionKeyWord> = z.union([
  z.literal("Lineman"),
  z.literal("Blitzer"),
  z.literal("Catcher"),
  z.literal("Thrower"),
  z.literal("Blocker"),
  z.literal("Runner"),
  z.literal("Special"),
]);
