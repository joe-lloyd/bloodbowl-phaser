import { z } from "zod";
import { inducementSchema } from "./Inducement";
import type { InducementSelectionLine } from "../../types/Inducements";

export const inducementSelectionLineSchema: z.ZodType<InducementSelectionLine> =
  z.looseObject({
    inducement: inducementSchema,
    quantity: z.number(),
  });
