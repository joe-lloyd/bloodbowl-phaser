import { z } from "zod";
import { teamSchema } from "./schemas/Team";
import { difficultySchema } from "./schemas/Difficulty";

const entrySchema = z.object({
  teams: z.tuple([teamSchema, teamSchema, teamSchema, teamSchema]),
  humanTeamId: z.string(),
  difficulty: difficultySchema,
});

export type DeathbowlEntry = z.infer<typeof entrySchema>;

export function readDeathbowlEntry(state: unknown): DeathbowlEntry | null {
  const parsed = entrySchema.safeParse(state);
  return parsed.success ? parsed.data : null;
}
