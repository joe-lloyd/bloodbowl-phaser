import { z } from "zod";
import type { ClubState } from "../../types/Team";

export const clubStateSchema: z.ZodType<ClubState> = z.object({
  gutterUnlocked: z.literal(true).exactOptional(),
  gutterSpecialistId: z.string().exactOptional(),
  gutterSitsOutId: z.string().exactOptional(),
});
