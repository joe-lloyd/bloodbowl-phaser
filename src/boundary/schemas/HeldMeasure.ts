import { z } from "zod";
import { desperateMeasureSchema } from "./DesperateMeasure";
import type { HeldMeasure } from "../../game/inducements/matchInducements";

export const heldMeasureSchema: z.ZodType<HeldMeasure> = z.looseObject({
  measure: desperateMeasureSchema,
  used: z.boolean(),
});
