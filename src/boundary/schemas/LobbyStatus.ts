import { z } from "zod";
import type { LobbyStatus } from "../../firebase/lobby";

export const lobbyStatusSchema: z.ZodType<LobbyStatus> = z.union([
  z.literal("active"),
  z.literal("lobby"),
  z.literal("finished"),
  z.literal("abandoned"),
]);
