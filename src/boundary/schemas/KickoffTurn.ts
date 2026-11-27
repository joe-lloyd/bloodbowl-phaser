import { z } from "zod";
import { actionTypeSchema } from "./ActionType";
import { kickoffEventSchema } from "./KickoffEvent";
import type { KickoffTurn } from "../../game/kickoff/kickoffTurn";

const actionsPlaySchema = z.looseObject({
  kind: z.literal("actions"),
  actions: actionTypeSchema.array(),
});

const oneSquarePlaySchema = z.looseObject({ kind: z.literal("one-square") });

const resumeSchema = z.looseObject({
  activeTeamId: z.union([z.null(), z.string()]),
  teamId: z.string(),
  turnNumber: z.number(),
});

export const kickoffTurnSchema: z.ZodType<KickoffTurn> = z.looseObject({
  stage: z.literal("play"),
  event: kickoffEventSchema,
  playerIds: z.string().array(),
  selectionLimit: z.number(),
  play: z.union([actionsPlaySchema, oneSquarePlaySchema]),
  resume: resumeSchema,
});
