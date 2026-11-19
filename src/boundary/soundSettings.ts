import { z } from "zod";
import { parseJson } from "./json";

const soundSettingsSchema = z.object({
  muted: z.boolean().catch(false),
  volume: z.number().transform((volume) => Math.min(1, Math.max(0, volume))).catch(0.7),
});

export type SoundSettings = z.infer<typeof soundSettingsSchema>;

export function parseSoundSettings(text: string): SoundSettings {
  return parseJson(text, soundSettingsSchema);
}
