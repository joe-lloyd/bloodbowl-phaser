import { z } from "zod";
import { kickoffEventSchema } from "./KickoffEvent";
import type { KickoffEventOutcome } from "../../game/kickoff/kickoffEvents";

export const kickoffEventOutcomeSchema: z.ZodType<KickoffEventOutcome> =
  z.looseObject({
    event: kickoffEventSchema,
    meaning: z.string(),
    perTeam: z.record(z.string(), z.string().array()),
  });
