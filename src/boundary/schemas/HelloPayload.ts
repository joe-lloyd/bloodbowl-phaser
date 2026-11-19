import { z } from "zod";
import type { HelloPayload } from "../../network/envelope";

export const helloPayloadSchema: z.ZodType<HelloPayload> = z.looseObject({
  protocolVersion: z.number(),
  applied: z.number(),
  checksum: z.string(),
});
