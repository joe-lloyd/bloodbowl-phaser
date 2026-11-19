import { z } from "zod";
import { playerSnapshotSchema } from "./PlayerSnapshot";
import type { TeamSnapshot } from "../../headless/serialization";

export const teamSnapshotSchema: z.ZodType<TeamSnapshot> = z.looseObject({
  id: z.string(),
  name: z.string(),
  rerolls: z.number(),
  players: playerSnapshotSchema.array(),
});
