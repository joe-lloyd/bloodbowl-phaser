import { z } from "zod";
import { playerSchema } from "./Player";
import type { DraftRecord } from "../../types/Team";

export const draftRecordSchema: z.ZodType<DraftRecord> = z.looseObject({
  id: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  roll: z.number(),
  addedSkillCount: z.number(),
  matchId: z.string().exactOptional(),
  removedAt: z.number(),
  player: playerSchema,
});
