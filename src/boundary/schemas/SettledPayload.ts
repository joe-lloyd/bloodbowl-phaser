import { z } from "zod";
import type { SettledPayload } from "../../network/envelope";

export const settledPayloadSchema: z.ZodType<SettledPayload> = z.looseObject({
  applied: z.number(),
  checksum: z.string(),
});
