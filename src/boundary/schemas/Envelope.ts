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

const emptyPayloadSchema = z.record(z.string(), z.never());

const helloEnvelopeSchema = z.looseObject({
  kind: z.literal("hello"),
  payload: helloPayloadSchema,
});
const commandEnvelopeSchema = z.looseObject({
  kind: z.literal("command"),
  payload: commandPayloadSchema,
});
const settledEnvelopeSchema = z.looseObject({
  kind: z.literal("settled"),
  payload: settledPayloadSchema,
});
const chatEnvelopeSchema = z.looseObject({
  kind: z.literal("chat"),
  payload: chatPayloadSchema,
});
const heartbeatEnvelopeSchema = z.looseObject({
  kind: z.literal("heartbeat"),
  payload: emptyPayloadSchema,
});
const resyncEnvelopeSchema = z.looseObject({
  kind: z.literal("resync"),
  payload: lockstepStateSchema,
});
const catchUpEnvelopeSchema = z.looseObject({
  kind: z.literal("catch-up"),
  payload: catchUpPayloadSchema,
});
const resyncRequestEnvelopeSchema = z.looseObject({
  kind: z.literal("resync-request"),
  payload: emptyPayloadSchema,
});
const selectionEnvelopeSchema = z.looseObject({
  kind: z.literal("selection"),
  payload: selectionPayloadSchema,
});
const promptEnvelopeSchema = z.looseObject({
  kind: z.literal("prompt"),
  payload: promptPayloadSchema,
});

export const envelopeSchema: z.ZodType<Envelope> = z.intersection(
  z.looseObject({
    seq: z.number(),
    from: z.string(),
    ts: z.number(),
  }),
  z.union([
    helloEnvelopeSchema,
    commandEnvelopeSchema,
    settledEnvelopeSchema,
    chatEnvelopeSchema,
    heartbeatEnvelopeSchema,
    resyncEnvelopeSchema,
    catchUpEnvelopeSchema,
    resyncRequestEnvelopeSchema,
    selectionEnvelopeSchema,
    promptEnvelopeSchema,
  ])
);
