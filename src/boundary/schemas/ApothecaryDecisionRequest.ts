import { z } from "zod";
import { apothecaryResultKindSchema } from "./ApothecaryResultKind";
import { apothecaryLocationSchema } from "./ApothecaryLocation";
import { apothecaryCasualtyTypeSchema } from "./ApothecaryCasualtyType";
import type { ApothecaryDecisionRequest } from "../../types/decisions";

const casualtyGradeSchema = z.union([
  z.literal("Badly Hurt"),
  z.literal("Seriously Hurt"),
  z.literal("Serious Injury"),
  z.literal("Lasting Injury"),
  z.literal("Dead"),
]);

const lastingInjurySchema = z.union([
  z.literal("MA"),
  z.literal("ST"),
  z.literal("AG"),
  z.literal("PA"),
  z.literal("AV"),
]);

const casualtyRollSchema = z.looseObject({
  grade: casualtyGradeSchema,
  lasting: lastingInjurySchema.exactOptional(),
});

export const apothecaryRequestFields = {
  type: z.literal("apothecary"),
  id: z.string(),
  chooserTeamId: z.string(),
  playerId: z.string(),
  resultKind: apothecaryResultKindSchema,
  location: apothecaryLocationSchema.exactOptional(),
};

export const apothecaryDecisionRequestSchema: z.ZodType<ApothecaryDecisionRequest> =
  z.looseObject({
    ...apothecaryRequestFields,
    position: z
      .looseObject({
        x: z.number(),
        y: z.number(),
      })
      .exactOptional(),
    casualtyType: apothecaryCasualtyTypeSchema.exactOptional(),
    casualtyRoll: casualtyRollSchema.exactOptional(),
    killerId: z.string().exactOptional(),
    armsPlagueRidden: z
      .union([z.literal(false), z.literal(true)])
      .exactOptional(),
  });
