import { z } from "zod";
import { TALLIES, type TeamTelemetry, type Usage } from "../../simulation/telemetry";
import { actionCountsSchema } from "./TeamPlayStats";

const countsSchema = z.record(z.string(), z.number());

const usageShape = {
  tallies: z.record(z.enum(TALLIES), z.number()),
  offered: countsSchema,
  chosen: countsSchema,
  skills: countsSchema,
  rerolls: countsSchema,
};

export const usageSchema: z.ZodType<Usage> = z.object(usageShape);

export const teamTelemetrySchema: z.ZodType<TeamTelemetry> = z.object({
  ...usageShape,
  held: z.string().array(),
  actions: actionCountsSchema,
});
