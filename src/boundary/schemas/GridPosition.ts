import { z } from "zod";
import type { GridPosition } from "../../headless/protocol";

export const gridPositionSchema: z.ZodType<GridPosition> = z.looseObject({
  x: z.number(),
  y: z.number(),
});
