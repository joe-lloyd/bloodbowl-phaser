import { z } from "zod";
import type { InducementChoiceKind } from "../../types/decisions";

export const inducementChoiceKindSchema: z.ZodType<InducementChoiceKind> =
  z.union([
    z.literal("team-captain"),
    z.literal("iron-man"),
    z.literal("knuckle-dusters"),
    z.literal("intensive-training"),
    z.literal("hangover"),
    z.literal("you-dope"),
    z.literal("sports-wizard"),
  ]);
