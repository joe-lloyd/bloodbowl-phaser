import { z } from "zod";
import { renamedValue } from "../renamedValue";
import type { KickoffEvent } from "../../game/kickoff/kickoffEvents";

export const kickoffEventSchema: z.ZodType<KickoffEvent> = z.preprocess(
  (value) => renamedValue(value, { "Solid Defence": "Alert Defence" }),
  z.union([
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
  ])
);
