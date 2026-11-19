import { z } from "zod";
import type { WizardSpell } from "../../types/decisions";

export const wizardSpellSchema: z.ZodType<WizardSpell> = z.union([
  z.literal("fireball"),
  z.literal("zap"),
]);
