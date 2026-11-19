import { z } from "zod";
import { stepPromptSchema } from "./StepPrompt";
import type { PromptPayload } from "../../network/envelope";

export const promptPayloadSchema: z.ZodType<PromptPayload> = z.looseObject({
  prompt: z.union([z.null(), stepPromptSchema]),
});
