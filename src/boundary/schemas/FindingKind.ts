import { z } from "zod";
import type { FindingKind } from "../../simulation/runMatch";

export const findingKindSchema: z.ZodType<FindingKind> = z.union([
  z.literal("invariant"),
  z.literal("engine-error"),
  z.literal("rejected-candidate"),
  z.literal("no-candidates"),
  z.literal("budget-exhausted"),
]);
