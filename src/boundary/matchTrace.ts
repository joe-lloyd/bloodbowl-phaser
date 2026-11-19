import { z } from "zod";
import { matchSaveSchema } from "./schemas/MatchSave";
import { matchRecordingSchema } from "./schemas/MatchRecording";
import { parseJson } from "./json";

const matchTraceSchema = z.looseObject({
  initial: matchSaveSchema,
  recording: matchRecordingSchema,
});

export function parseMatchTrace(text: string) {
  return parseJson(text, matchTraceSchema);
}
