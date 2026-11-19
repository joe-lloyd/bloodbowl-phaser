import { z } from "zod";
import type { PrayerToNuffle } from "../../types/Inducements";

export const prayerToNuffleSchema: z.ZodType<PrayerToNuffle> = z.union([
  z.literal("Treacherous Trapdoor"),
  z.literal("Stiletto"),
  z.literal("Iron Man"),
  z.literal("Knuckle Dusters"),
  z.literal("Blessing of Nuffle"),
  z.literal("Moles Under the Pitch"),
  z.literal("Under Scrutiny"),
  z.literal("Intensive Training"),
]);
