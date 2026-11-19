import { z } from "zod";
import { promptRollTypeSchema } from "./PromptRollType";
import type { StepPrompt } from "../../types/gameEvents/network";

export const stepPromptSchema: z.ZodType<StepPrompt> = z.looseObject({
  playerId: z.string(),
  rolls: z
    .looseObject({
      type: promptRollTypeSchema,
      target: z.number(),
    })
    .array(),
});
