import { z } from "zod";
import { playerStatsSchema } from "./PlayerStats";
import { skillSchema } from "./Skill";
import type { FrogRecord } from "../../game/inducements/matchInducements";

export const frogRecordSchema: z.ZodType<FrogRecord> = z.looseObject({
  playerId: z.string(),
  stats: playerStatsSchema,
  skills: skillSchema.array(),
  drivesLeft: z.number().exactOptional(),
});
