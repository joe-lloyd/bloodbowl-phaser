import { z } from "zod";
import type { DesperateMeasure } from "../../game/inducements/desperateMeasures";

export const desperateMeasureSchema: z.ZodType<DesperateMeasure> = z.union([
  z.literal("You Dope!"),
  z.literal("Razzle-Dazzle"),
  z.literal("Hangover"),
  z.literal("Grudge Match"),
  z.literal("Set Piece"),
  z.literal("Sports Espionage"),
  z.literal("Discarded Banana Skin"),
  z.literal("Magic Scroll"),
]);
