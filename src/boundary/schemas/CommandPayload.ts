import { z } from "zod";
import { headlessCommandSchema } from "./HeadlessCommand";
import type { CommandPayload } from "../../network/envelope";

export const commandPayloadSchema: z.ZodType<CommandPayload> = z.looseObject({
  command: headlessCommandSchema,
  before: z.string(),
});
