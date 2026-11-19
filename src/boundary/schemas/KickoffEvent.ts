import { z } from "zod";
import type { KickoffEvent } from "../../game/kickoff/kickoffEvents";

export const kickoffEventSchema: z.ZodType<KickoffEvent> = z.union([
  z.literal("Get the Ref"),
  z.literal("Time-Out"),
  z.literal("Alert Defence"),
  z.literal("High Kick"),
  z.literal("Cheering Fans"),
  z.literal("Brilliant Coaching"),
  z.literal("Changing Weather"),
  z.literal("Quick Snap"),
  z.literal("Charge!"),
  z.literal("Dodgy Snack"),
  z.literal("Pitch Invasion"),
]);
