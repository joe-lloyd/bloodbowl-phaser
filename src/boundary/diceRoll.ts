import { z } from "zod";

export const diceRollSchema = z.object({
  rollType: z.string(),
  diceType: z.string(),
  teamId: z.string().exactOptional(),
  value: z.union([
    z.number(),
    z.number().array(),
    z.string(),
    z.string().array(),
  ]),
  total: z.number(),
  description: z.string(),
  resultState: z.enum(["none", "success", "failure", "fumble"]).exactOptional(),
  seed: z.number().exactOptional(),
  context: z.record(z.string(), z.unknown()).exactOptional(),
});

export type DiceRollData = z.infer<typeof diceRollSchema>;
