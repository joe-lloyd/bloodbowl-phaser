import { z } from "zod";
import { setupTeamStatusSchema } from "./SetupTeamStatus";
import type { SetupState } from "../../types/SetupTypes";

export const setupStateSchema: z.ZodType<SetupState> = z.looseObject({
  kickingTeamId: z.union([z.null(), z.string()]),
  receivingTeamId: z.union([z.null(), z.string()]),
  currentTeamId: z.union([z.null(), z.string()]),
  confirmedTeamIds: z.string().array(),
  teams: z.record(z.string(), setupTeamStatusSchema),
  swarming: z
    .looseObject({
      pendingTeamIds: z.string().array(),
      teams: z.record(
        z.string(),
        z.looseObject({
          roll: z.number(),
          basePlayerIds: z.string().array(),
        })
      ),
    })
    .exactOptional(),
});
