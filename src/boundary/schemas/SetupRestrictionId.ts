import { z } from "zod";
import type { SetupRestrictionId } from "../../types/SetupTypes";

export const setupRestrictionIdSchema: z.ZodType<SetupRestrictionId> = z.union([
  z.literal("setup-area"),
  z.literal("neutral-zone"),
  z.literal("duplicate-square"),
  z.literal("wide-zone-limit"),
  z.literal("line-of-scrimmage"),
  z.literal("short-handed-line"),
  z.literal("max-seven"),
  z.literal("required-player-count"),
  z.literal("concession-decision"),
  z.literal("team-captain"),
]);
