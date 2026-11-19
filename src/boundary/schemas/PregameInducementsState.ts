import { z } from "zod";
import { inducementOfferSchema } from "./InducementOffer";
import type { PregameInducementsState } from "../../types/Inducements";

export const pregameInducementsStateSchema: z.ZodType<PregameInducementsState> =
  z.looseObject({
    ready: z.record(z.string(), z.boolean()),
    offer: inducementOfferSchema.exactOptional(),
    buyOrder: z.tuple([z.string(), z.string()]).exactOptional(),
    complete: z.union([z.literal(false), z.literal(true)]).exactOptional(),
    resolving: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  });
