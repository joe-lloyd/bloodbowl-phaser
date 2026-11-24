import { z } from "zod";
import { lobbyDocSchema } from "./schemas/LobbyDoc";
import { lobbyStatusSchema } from "./schemas/LobbyStatus";

export function readLobby(value: unknown) {
  return lobbyDocSchema.parse(value);
}

const seatsSchema = z.object({
  status: lobbyStatusSchema,
  hostUid: z.string(),
  guestUid: z.string().nullable(),
});

export function readLobbySeats(value: unknown) {
  return seatsSchema.safeParse(value).data;
}

const appliedCountSchema = z
  .object({
    resume: z
      .object({
        applied: z.number(),
        replay: z.array(z.unknown()).exactOptional(),
      })
      .nullable()
      .exactOptional(),
  })
  .optional();

export function readAppliedCommandCount(value: unknown): number | undefined {
  const resume = appliedCountSchema.parse(value)?.resume;
  return resume ? resume.applied + (resume.replay?.length ?? 0) : undefined;
}
