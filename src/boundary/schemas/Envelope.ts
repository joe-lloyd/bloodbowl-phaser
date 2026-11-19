import { z } from "zod";
import { helloPayloadSchema } from "./HelloPayload";
import { commandPayloadSchema } from "./CommandPayload";
import { settledPayloadSchema } from "./SettledPayload";
import { chatPayloadSchema } from "./ChatPayload";
import { lockstepStateSchema } from "./LockstepState";
import { catchUpPayloadSchema } from "./CatchUpPayload";
import { selectionPayloadSchema } from "./SelectionPayload";
import { promptPayloadSchema } from "./PromptPayload";
import type { Envelope } from "../../network/envelope";

export const envelopeSchema: z.ZodType<Envelope> = z.intersection(
  z.looseObject({
    seq: z.number(),
    from: z.string(),
    ts: z.number(),
  }),
  z.union([
    z.looseObject({
      kind: z.literal("hello"),
      payload: helloPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("command"),
      payload: commandPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("settled"),
      payload: settledPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("chat"),
      payload: chatPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("heartbeat"),
      payload: z.record(z.string(), z.never()),
    }),
    z.looseObject({
      kind: z.literal("resync"),
      payload: lockstepStateSchema,
    }),
    z.looseObject({
      kind: z.literal("catch-up"),
      payload: catchUpPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("resync-request"),
      payload: z.record(z.string(), z.never()),
    }),
    z.looseObject({
      kind: z.literal("selection"),
      payload: selectionPayloadSchema,
    }),
    z.looseObject({
      kind: z.literal("prompt"),
      payload: promptPayloadSchema,
    }),
  ])
);
