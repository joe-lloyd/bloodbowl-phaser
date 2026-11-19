import { z } from "zod";
import { headlessCommandSchema } from "./HeadlessCommand";
import type { RecordedStep } from "../../simulation/runMatch";

export const recordedStepSchema: z.ZodType<RecordedStep> = z.looseObject({
  command: headlessCommandSchema,
  ok: z.boolean(),
  reason: z.string().exactOptional(),
  team: z.union([z.literal(0), z.literal(1)]),
  label: z.string(),
  note: z.string().exactOptional(),
});
