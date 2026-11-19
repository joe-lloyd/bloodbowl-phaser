import { z } from "zod";
import { competitionDocSchema } from "./schemas/CompetitionDoc";
import { parseJson } from "./json";
import { readEach } from "./readEach";

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
      readEach(Object.entries(store), ([key, value]) => [
        key,
        readCompetition(value),
      ])
    )
  );

export function readCompetition(value: unknown) {
  const raw = rawCompetitionSchema.parse(value);
  const entrants = raw.entrants.map((entrant) => {
    const result = { ...entrant, ownerUid: entrant.ownerUid ?? null };
    Reflect.deleteProperty(result, "team");
    return result;
  });
  const stored = competitionDocSchema.safeParse({ ...raw, entrants });
  if (stored.success) return stored.data;
  const status = raw.status === "draft" ? "draft" : "active";
  const derived = { ...raw, entrants, status, standings: [] };
  Reflect.deleteProperty(derived, "championEntrantId");
  return competitionDocSchema.parse(derived);
}

const rawStoreSchema = z.record(z.string(), z.unknown());

export function unreadableCompetitions(text: string): Record<string, unknown> {
  const store = parseJson(text, rawStoreSchema);
  return Object.fromEntries(
    Object.entries(store).filter(([, value]) => !readsCleanly(value))
  );
}

function readsCleanly(value: unknown): boolean {
  try {
    readCompetition(value);
    return true;
  } catch {
    return false;
  }
}

export function readCompetitionStore(text: string) {
  return parseJson(text, localStoreSchema);
}

export function readCompetitions(values: readonly unknown[]) {
  return readEach(values, readCompetition);
}
