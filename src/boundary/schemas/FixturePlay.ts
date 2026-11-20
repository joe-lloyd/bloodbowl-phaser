import { z } from "zod";
import type { FixturePlay } from "../../competition/types";

export const fixturePlaySchema: z.ZodType<FixturePlay> = z.union([
  z.literal("online"),
  z.literal("local"),
  z.literal("computer"),
  z.literal("simulated"),
  z.literal("reported"),
]);
