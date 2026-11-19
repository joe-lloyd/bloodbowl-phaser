import { z } from "zod";
import { prayerToNuffleSchema } from "./PrayerToNuffle";
import type { PrayerRerollRecord } from "../../types/Inducements";

export const prayerRerollRecordSchema: z.ZodType<PrayerRerollRecord> =
  z.looseObject({
    teamId: z.string(),
    rejectedRolls: z.number().array(),
    result: z.number(),
    prayer: prayerToNuffleSchema,
  });
