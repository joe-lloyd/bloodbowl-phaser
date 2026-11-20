import { z } from "zod";
import { lobbyDocSchema } from "./schemas/LobbyDoc";
import { lobbyStatusSchema } from "./schemas/LobbyStatus";

export function readLobby(value: unknown) {
  return lobbyDocSchema.parse(value);
}

const statusOnlySchema = z.object({ status: lobbyStatusSchema });

export function readLobbyStatus(value: unknown) {
  return statusOnlySchema.safeParse(value).data?.status;
}

const appliedCountSchema = z
  .object({
    resume: z.object({ applied: z.number() }).nullable().exactOptional(),
  })
  .optional();

export function readAppliedCommandCount(value: unknown): number | undefined {
  return appliedCountSchema.parse(value)?.resume?.applied;
}
