import { z } from "zod";
import type { PlayedGameKind } from "../../game/progression/matchHistory";

export const playedGameKindSchema: z.ZodType<PlayedGameKind> = z.union([
  z.literal("online"),
  z.literal("computer"),
  z.literal("local"),
]);
