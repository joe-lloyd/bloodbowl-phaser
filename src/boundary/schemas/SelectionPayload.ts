import { z } from "zod";
import type { SelectionPayload } from "../../network/envelope";

export const selectionPayloadSchema: z.ZodType<SelectionPayload> =
  z.looseObject({
    playerId: z.union([z.null(), z.string()]),
  });
