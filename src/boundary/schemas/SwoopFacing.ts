import { z } from "zod";
import type { SwoopFacing } from "../../game/rules/throwTeammate";

export const swoopFacingSchema: z.ZodType<SwoopFacing> = z.union([
  z.literal("north"),
  z.literal("east"),
  z.literal("south"),
  z.literal("west"),
]);
