import { z } from "zod";
import type { TeamPlayStats } from "../../simulation/runMatch";

export const actionCountsSchema = z.looseObject({
  move: z.number().exactOptional(),
  block: z.number().exactOptional(),
  multipleBlock: z.number().exactOptional(),
  blitz: z.number().exactOptional(),
  pass: z.number().exactOptional(),
  punt: z.number().exactOptional(),
  handoff: z.number().exactOptional(),
  foul: z.number().exactOptional(),
  throwTeamMate: z.number().exactOptional(),
  secureBall: z.number().exactOptional(),
  special: z.number().exactOptional(),
  stab: z.number().exactOptional(),
  breatheFire: z.number().exactOptional(),
  vomit: z.number().exactOptional(),
  gaze: z.number().exactOptional(),
  chomp: z.number().exactOptional(),
  chainsaw: z.number().exactOptional(),
  throwBomb: z.number().exactOptional(),
  ballAndChain: z.number().exactOptional(),
  forgoe: z.number().exactOptional(),
});

export const teamPlayStatsSchema: z.ZodType<TeamPlayStats> = z.looseObject({
  turns: z.number(),
  turnovers: z.number(),
  dodges: z.number(),
  failedDodges: z.number(),
  rushes: z.number(),
  failedRushes: z.number(),
  casualties: z.number(),
  completions: z.number(),
  blocks: z.number(),
  actions: actionCountsSchema,
});
