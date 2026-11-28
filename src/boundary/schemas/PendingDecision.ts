import { z } from "zod";
import { kickoffEventSchema } from "./KickoffEvent";
import { gridPositionSchema } from "./GridPosition";
import { blockResultSchema } from "./BlockResult";
import { rerollSourceSchema } from "./RerollSource";
import { inducementChoiceDecisionRequestSchema } from "./InducementChoiceDecisionRequest";
import { foulAssistsDecisionRequestSchema } from "./FoulAssistsDecisionRequest";
import { reserveMoveDecisionRequestSchema } from "./ReserveMoveDecisionRequest";
import { crossAssistDecisionRequestSchema } from "./CrossAssistDecisionRequest";
import { apothecaryRequestFields } from "./ApothecaryDecisionRequest";
import type { PendingDecision } from "../../headless/protocol";

const flagSchema = z.union([z.literal(false), z.literal(true)]);

const blockChoiceStageSchema = z.union([
  z.literal("attacker-reroll"),
  z.literal("pick"),
]);

const interceptionCandidateSchema = z.looseObject({
  playerId: z.string(),
  modifier: z.number(),
});

const casualtyTypeSchema = z.union([
  z.literal("badly-hurt"),
  z.literal("seriously-hurt"),
  z.literal("dead"),
]);

export const pendingDecisionSchema: z.ZodType<PendingDecision> = z.union([
  z.looseObject({
    type: z.literal("kickoff-event"),
    chooserTeamId: z.string(),
    event: kickoffEventSchema,
    selectionLimit: z.number(),
    selectedPlayerIds: z.string().array(),
    movedPlayerIds: z.string().array(),
    awaitingPlacement: z.string().array(),
    landingSquare: gridPositionSchema.exactOptional(),
  }),
  z.looseObject({
    type: z.literal("block-dice"),
    attackerId: z.string(),
    defenderId: z.string(),
    chooserTeamId: z.string(),
    options: blockResultSchema.array(),
    choiceStage: blockChoiceStageSchema.exactOptional(),
    teamRerollAvailable: flagSchema.exactOptional(),
    proAvailable: flagSchema.exactOptional(),
    brawlerAvailable: flagSchema.exactOptional(),
    veteranRerollAvailable: flagSchema.exactOptional(),
  }),
  z.looseObject({
    type: z.literal("push-direction"),
    attackerId: z.string(),
    defenderId: z.string(),
    resultType: z.string(),
    chooserTeamId: z.string().exactOptional(),
    options: gridPositionSchema.array(),
  }),
  z.looseObject({
    type: z.literal("follow-up"),
    attackerId: z.string(),
    targetSquare: gridPositionSchema,
  }),
  z.looseObject({
    type: z.literal("touchback"),
    teamId: z.string(),
  }),
  z.looseObject({
    type: z.literal("reroll"),
    playerId: z.string(),
    chooserTeamId: z.string(),
    rollKind: z.string(),
    rollName: z.string().exactOptional(),
    sources: rerollSourceSchema.array(),
    skill: z.string().exactOptional(),
    roll: z.number(),
    needed: z.number().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("reaction"),
    playerId: z.string(),
    chooserTeamId: z.string(),
    skill: z.string(),
    prompt: z.string(),
    opponentId: z.string().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("bite-target"),
    purpose: z.enum(["squig-knock-down", "squig-block"]).exactOptional(),
    playerId: z.string(),
    chooserTeamId: z.string(),
    targetIds: z.string().array(),
  }),
  z.looseObject({
    type: z.literal("interception"),
    chooserTeamId: z.string(),
    passerId: z.string(),
    candidates: interceptionCandidateSchema.array(),
  }),
  z.looseObject({
    ...apothecaryRequestFields,
    position: gridPositionSchema.exactOptional(),
    casualtyType: casualtyTypeSchema.exactOptional(),
  }),
  inducementChoiceDecisionRequestSchema,
  foulAssistsDecisionRequestSchema,
  reserveMoveDecisionRequestSchema,
  crossAssistDecisionRequestSchema,
]);
