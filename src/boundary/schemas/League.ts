import { z } from "zod";
import type { League } from "../../types/Team";

export const leagueSchema: z.ZodType<League> = z.union([
  z.literal("Badlands Brawl"),
  z.literal("Chaos Clash"),
  z.literal("Lustrian Superleague"),
  z.literal("Elven Kingdoms League"),
  z.literal("Old World Classic"),
  z.literal("Worlds Edge Superleague"),
  z.literal("Sylvanian Spotlight"),
  z.literal("Underworld Challenge"),
  z.literal("Halfling Thimble Cup"),
  z.literal("Woodland League"),
]);
