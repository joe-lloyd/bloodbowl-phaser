import { z } from "zod";
import type { GridPosition, MoveStep } from "../../headless/protocol";

export const gridPositionSchema: z.ZodType<GridPosition> = z.looseObject({
  x: z.number(),
  y: z.number(),
});

export const moveStepSchema: z.ZodType<MoveStep> = z.looseObject({
  x: z.number(),
  y: z.number(),
  reckless: z.literal(true).exactOptional(),
});
