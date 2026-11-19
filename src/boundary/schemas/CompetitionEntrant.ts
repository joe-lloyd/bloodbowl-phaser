import { z } from "zod";
import type { CompetitionEntrant } from "../../competition/types";

export const competitionEntrantSchema: z.ZodType<CompetitionEntrant> =
  z.looseObject({
    id: z.string(),
    teamId: z.string(),
    ownerUid: z.union([z.null(), z.string()]),
    name: z.string(),
    coachName: z.string().exactOptional(),
    coachUid: z.union([z.null(), z.string()]).exactOptional(),
    rosterName: z.string(),
    seed: z.number(),
    withdrawn: z.union([z.literal(false), z.literal(true)]).exactOptional(),
    computerCoached: z.literal(true).exactOptional(),
  });
