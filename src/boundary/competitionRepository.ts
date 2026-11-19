import { z } from "zod";
import { competitionDocSchema } from "./schemas/CompetitionDoc";
import { parseJson } from "./json";

const legacyEntrantSchema = z.looseObject({
  ownerUid: z.string().nullable().exactOptional(),
  team: z.unknown().exactOptional(),
});
const rawCompetitionSchema = z.looseObject({
  entrants: legacyEntrantSchema.array(),
  status: z.unknown(),
});
const localStoreSchema = z
  .record(z.string(), z.unknown())
  .transform((store) =>
    Object.fromEntries(
      Object.entries(store).map(([key, value]) => [key, readCompetition(value)])
    )
  );

export function readCompetition(value: unknown) {
  const raw = rawCompetitionSchema.parse(value);
  const entrants = raw.entrants.map((entrant) => {
    const result = { ...entrant, ownerUid: entrant.ownerUid ?? null };
    Reflect.deleteProperty(result, "team");
    return result;
  });
  const status = raw.status === "draft" ? "draft" : "active";
  const derived = { ...raw, entrants, status, standings: [] };
  Reflect.deleteProperty(derived, "championEntrantId");
  return competitionDocSchema.parse(derived);
}

export function readCompetitionStore(text: string) {
  return parseJson(text, localStoreSchema);
}
