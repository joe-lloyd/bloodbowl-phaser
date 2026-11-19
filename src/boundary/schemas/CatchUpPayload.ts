import { z } from "zod";
import { headlessCommandSchema } from "./HeadlessCommand";
import type { CatchUpPayload } from "../../network/envelope";

export const catchUpPayloadSchema: z.ZodType<CatchUpPayload> = z.looseObject({
  from: z.number(),
  commands: headlessCommandSchema.array(),
});
