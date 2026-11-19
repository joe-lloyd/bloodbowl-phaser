import { z } from "zod";
import { inducementRuleProfileSchema } from "./InducementRuleProfile";
import { inducementCatalogEntrySchema } from "./InducementCatalogEntry";
import { inducementSelectionLineSchema } from "./InducementSelectionLine";
import type { InducementOffer } from "../../types/Inducements";

export const inducementOfferSchema: z.ZodType<InducementOffer> = z.looseObject({
  profile: inducementRuleProfileSchema,
  budgets: z.record(z.string(), z.number()),
  catalogs: z.record(z.string(), inducementCatalogEntrySchema.array()),
  selections: z.record(z.string(), inducementSelectionLineSchema.array()),
  confirmed: z.record(z.string(), z.boolean()),
});
