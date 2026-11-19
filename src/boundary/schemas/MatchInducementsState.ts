import { z } from "zod";
import { prayerToNuffleSchema } from "./PrayerToNuffle";
import { heldMeasureSchema } from "./HeldMeasure";
import { matchGrantSchema } from "./MatchGrant";
import { frogRecordSchema } from "./FrogRecord";
import type { MatchInducementsState } from "../../game/inducements/matchInducements";

export const matchInducementsStateSchema: z.ZodType<MatchInducementsState> =
  z.looseObject({
    rolled: z.boolean(),
    prayers: z.record(z.string(), prayerToNuffleSchema.array()),
    measures: z.record(z.string(), heldMeasureSchema.array()),
    grants: matchGrantSchema.array(),
    dopedPlayerIds: z.string().array(),
    noRecoveryPlayerIds: z.string().array(),
    sportsWizards: z.string().array().exactOptional(),
    frogs: frogRecordSchema.array().exactOptional(),
  });
