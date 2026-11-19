import { z } from "zod";
import { parseJson } from "./json";

const documentSchema = z.record(z.string(), z.json());

export function firebaseDocument(
  value: unknown
): z.infer<typeof documentSchema> {
  return parseJson(z.string().parse(JSON.stringify(value)), documentSchema);
}

const profileSchema = z.object({
  activeMatchCode: z.string().nullable().exactOptional(),
  coachName: z.string().exactOptional(),
});

export function firebaseProfile(value: unknown) {
  return profileSchema.parse(value);
}

const houseBotSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{4,8}$/),
  updatedAt: z.number(),
});

export function houseBotAnnouncement(value: unknown) {
  return houseBotSchema.safeParse(value);
}
