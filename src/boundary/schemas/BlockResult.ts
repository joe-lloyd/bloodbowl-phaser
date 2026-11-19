import { z } from "zod";
import { blockResultTypeSchema } from "./BlockResultType";
import type { BlockResult } from "../../services/BlockResolutionService";

export const blockResultSchema: z.ZodType<BlockResult> = z.looseObject({
  type: blockResultTypeSchema,
  icon: z.string(),
  label: z.string(),
});
