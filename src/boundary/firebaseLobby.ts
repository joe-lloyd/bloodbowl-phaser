import { z } from "zod";
import { lobbyDocSchema } from "./schemas/LobbyDoc";

export function readLobby(value: unknown) {
  return lobbyDocSchema.parse(value);
}

const appliedCountSchema = z
  .object({
    resume: z.object({ applied: z.number() }).nullable().exactOptional(),
  })
  .optional();

export function readAppliedCommandCount(value: unknown): number | undefined {
  return appliedCountSchema.parse(value)?.resume?.applied;
}
