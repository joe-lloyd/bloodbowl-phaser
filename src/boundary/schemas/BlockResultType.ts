import { z } from "zod";
import type { BlockResultType } from "../../services/BlockResolutionService";

export const blockResultTypeSchema: z.ZodType<BlockResultType> = z.union([
  z.literal("both-down"),
  z.literal("skull"),
  z.literal("push"),
  z.literal("pow"),
  z.literal("pow-dodge"),
]);
