import { z } from "zod";
import type { LobbySettings } from "../../firebase/lobby";

export const lobbySettingsSchema: z.ZodType<LobbySettings> = z.looseObject({
  turnSeconds: z.number(),
  timeoutBankMs: z.number(),
  progressionEnabled: z.boolean(),
});
