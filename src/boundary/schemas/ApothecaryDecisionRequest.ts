import { z } from "zod";
import { apothecaryResultKindSchema } from "./ApothecaryResultKind";
import { apothecaryLocationSchema } from "./ApothecaryLocation";
import { apothecaryCasualtyTypeSchema } from "./ApothecaryCasualtyType";
import type { ApothecaryDecisionRequest } from "../../types/decisions";

export const apothecaryDecisionRequestSchema: z.ZodType<ApothecaryDecisionRequest> =
  z.looseObject({
    type: z.literal("apothecary"),
    id: z.string(),
    chooserTeamId: z.string(),
    playerId: z.string(),
    resultKind: apothecaryResultKindSchema,
    location: apothecaryLocationSchema.exactOptional(),
    position: z
      .looseObject({
        x: z.number(),
        y: z.number(),
      })
      .exactOptional(),
    casualtyType: apothecaryCasualtyTypeSchema.exactOptional(),
    killerId: z.string().exactOptional(),
    armsPlagueRidden: z
      .union([z.literal(false), z.literal(true)])
      .exactOptional(),
  });
