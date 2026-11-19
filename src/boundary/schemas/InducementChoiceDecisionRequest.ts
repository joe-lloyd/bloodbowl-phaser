import { z } from "zod";
import { inducementChoiceKindSchema } from "./InducementChoiceKind";
import { dopeStatSchema } from "./DopeStat";
import { wizardSpellSchema } from "./WizardSpell";
import type { InducementChoiceDecisionRequest } from "../../types/decisions";

export const inducementChoiceDecisionRequestSchema: z.ZodType<InducementChoiceDecisionRequest> =
  z.looseObject({
    type: z.literal("inducement-choice"),
    kind: inducementChoiceKindSchema,
    chooserTeamId: z.string(),
    playerIds: z.string().array(),
    skills: z.string().array().exactOptional(),
    stats: dopeStatSchema.array().exactOptional(),
    spells: wizardSpellSchema.array().exactOptional(),
    optional: z.boolean(),
  });
