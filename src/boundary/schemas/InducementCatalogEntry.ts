import { z } from "zod";
import { inducementSchema } from "./Inducement";
import type { InducementCatalogEntry } from "../../types/Inducements";

export const inducementCatalogEntrySchema: z.ZodType<InducementCatalogEntry> =
  z.looseObject({
    inducement: inducementSchema,
    price: z.number(),
    maxCount: z.number(),
  });
