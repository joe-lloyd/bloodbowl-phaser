import { z } from "zod";
import { findingKindSchema } from "./FindingKind";
import type { Finding } from "../../simulation/runMatch";

export const findingSchema: z.ZodType<Finding> = z.looseObject({
  kind: findingKindSchema,
  key: z.string(),
  message: z.string(),
  step: z.number(),
  phase: z.string(),
  turn: z.string(),
});
