import { z } from "zod";
import { tournamentFormatSchema } from "./TournamentFormat";
import { competitionBaseSchema } from "./CompetitionBase";
import type { TournamentDoc } from "../../competition/types";

export const tournamentDocSchema: z.ZodType<TournamentDoc> = z.intersection(
  competitionBaseSchema,
  z.looseObject({
    type: z.literal("tournament"),
    format: tournamentFormatSchema,
    championEntrantId: z.string().exactOptional(),
    playOffs: z.literal(true).exactOptional(),
  })
);
