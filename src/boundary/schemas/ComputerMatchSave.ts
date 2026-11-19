import { z } from "zod";
import type { ComputerMatchSave } from "../../headless/serialization";

export const computerMatchSaveSchema: z.ZodType<ComputerMatchSave> =
  z.looseObject({
    computerTeamId: z.string(),
    difficulty: z.string(),
  });
