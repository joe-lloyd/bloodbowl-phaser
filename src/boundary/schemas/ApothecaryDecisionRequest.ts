import { z } from "zod";
import { apothecaryResultKindSchema } from "./ApothecaryResultKind";
import type { ApothecaryDecisionRequest } from "../../types/decisions";

export const apothecaryDecisionRequestSchema: z.ZodType<ApothecaryDecisionRequest> =
  z.looseObject({
    type: z.literal("apothecary"),
    id: z.string(),
    chooserTeamId: z.string(),
    playerId: z.string(),
    resultKind: apothecaryResultKindSchema,
    location: z.union([z.literal("pitch"), z.literal("crowd")]).exactOptional(),
    position: z
      .looseObject({
        x: z.number(),
        y: z.number(),
      })
      .exactOptional(),
    casualtyType: z
      .union([
        z.literal("badly-hurt"),
        z.literal("seriously-hurt"),
        z.literal("dead"),
      ])
      .exactOptional(),
    killerId: z.string().exactOptional(),
    armsPlagueRidden: z
      .union([z.literal(false), z.literal(true)])
      .exactOptional(),
  });
