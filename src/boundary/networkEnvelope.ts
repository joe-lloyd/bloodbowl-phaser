import { Timestamp } from "firebase/firestore";
import { z } from "zod";
import { envelopeSchema } from "./schemas/Envelope";
import { parseJson } from "./json";
import type { Envelope } from "../network/envelope";

export function parseEnvelope(value: unknown): Envelope {
  return envelopeSchema.parse(value);
}

export function serializableEnvelope(envelope: Envelope): Envelope {
  return parseJson(JSON.stringify(envelope), envelopeSchema);
}

const timestampSchema = z.instanceof(Timestamp).nullable().catch(null);

export function parseMessageTimestamp(value: unknown): Timestamp | null {
  return timestampSchema.parse(value);
}
