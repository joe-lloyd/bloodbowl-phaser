import { z } from "zod";

const environmentSchema = z.object({
  UPDATE_VISUAL_BASELINES: z.string().optional(),
});

export function shouldUpdateVisualBaselines(): boolean {
  return environmentSchema.parse(process.env).UPDATE_VISUAL_BASELINES === "1";
}
