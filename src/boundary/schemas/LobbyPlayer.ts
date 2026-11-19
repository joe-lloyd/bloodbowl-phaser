import { z } from "zod";
import { teamSchema } from "./Team";
import type { LobbyPlayer } from "../../firebase/lobby";

export const lobbyPlayerSchema: z.ZodType<LobbyPlayer> = z.looseObject({
  uid: z.string(),
  displayName: z.string(),
  team: z.union([z.null(), teamSchema]),
  ready: z.boolean(),
  lastSeen: z.number().exactOptional(),
});
