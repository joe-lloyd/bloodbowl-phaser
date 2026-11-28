import process from "node:process";
import { z } from "zod";

const environmentSchema = z.object({
  TRAINING_GROUND_DATA: z.string().min(1, "Set TRAINING_GROUND_DATA"),
  TRAINING_GROUND_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(3960),
  TRAINING_GROUND_HOST: z.string().min(1).default("127.0.0.1"),
});

export const trainingEnvironment = () => environmentSchema.parse(process.env);
