import { z } from "zod";
import type { TimerState } from "../../firebase/lobby";

export const timerStateSchema: z.ZodType<TimerState> = z.looseObject({
  deadline: z.union([z.null(), z.number()]),
  turn: z.union([z.null(), z.string()]).exactOptional(),
  pausedBy: z.union([z.null(), z.string()]),
  pausedAt: z.union([z.null(), z.number()]),
  banks: z.record(z.string(), z.number()),
});
