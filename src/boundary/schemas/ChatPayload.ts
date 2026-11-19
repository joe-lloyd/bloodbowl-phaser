import { z } from "zod";
import type { ChatPayload } from "../../network/envelope";

export const chatPayloadSchema: z.ZodType<ChatPayload> = z.looseObject({
  text: z.string(),
  senderName: z.string(),
});
