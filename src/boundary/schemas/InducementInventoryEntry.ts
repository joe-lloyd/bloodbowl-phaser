import { z } from "zod";
import { inducementSchema } from "./Inducement";
import type { InducementInventoryEntry } from "../../types/Inducements";

export const inducementInventoryEntrySchema: z.ZodType<InducementInventoryEntry> =
  z.looseObject({
    inducement: inducementSchema,
    ownerTeamId: z.string(),
    quantity: z.number(),
    remainingUses: z.number(),
    price: z.number(),
    provenance: z.union([z.literal("purchased"), z.literal("free")]),
  });
