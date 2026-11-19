import { z } from "zod";
import { gameSnapshotSchema } from "./GameSnapshot";
import { teamSchema } from "./Team";
import { kickoffEventSchema } from "./KickoffEvent";
import { gridPositionSchema } from "./GridPosition";
import { chargeBudgetSchema } from "./ChargeBudget";
import { blockResultSchema } from "./BlockResult";
import { rerollSourceSchema } from "./RerollSource";
import { inducementChoiceDecisionRequestSchema } from "./InducementChoiceDecisionRequest";
import { foulAssistsDecisionRequestSchema } from "./FoulAssistsDecisionRequest";
import { rNGStateSchema } from "./RNGState";
import { matchStatsSnapshotSchema } from "./MatchStatsSnapshot";
import { headlessCommandSchema } from "./HeadlessCommand";
import type { LockstepState } from "../../network/envelope";

export const lockstepStateSchema: z.ZodType<LockstepState> = z.looseObject({
  snapshot: gameSnapshotSchema,
  teams: z.tuple([teamSchema, teamSchema]),
  pending: z.union([
    z.null(),
    z.looseObject({
      type: z.literal("kickoff-event"),
      chooserTeamId: z.string(),
      event: kickoffEventSchema,
      selectionLimit: z.number(),
      selectedPlayerIds: z.string().array(),
      movedPlayerIds: z.string().array(),
      awaitingPlacement: z.string().array(),
      landingSquare: gridPositionSchema.exactOptional(),
      charge: z
        .looseObject({
          queue: z.string().array(),
          budget: chargeBudgetSchema,
          activePlayerId: z.union([z.null(), z.string()]),
          aborted: z.boolean(),
        })
        .exactOptional(),
    }),
    z.looseObject({
      type: z.literal("block-dice"),
      attackerId: z.string(),
      defenderId: z.string(),
      chooserTeamId: z.string(),
      options: blockResultSchema.array(),
      choiceStage: z
        .union([z.literal("attacker-reroll"), z.literal("pick")])
        .exactOptional(),
      teamRerollAvailable: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
      proAvailable: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
      brawlerAvailable: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
      veteranRerollAvailable: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
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
    }),
    z.looseObject({
      type: z.literal("bite-target"),
      playerId: z.string(),
      chooserTeamId: z.string(),
      targetIds: z.string().array(),
    }),
    z.looseObject({
      type: z.literal("interception"),
      chooserTeamId: z.string(),
      passerId: z.string(),
      candidates: z
        .looseObject({
          playerId: z.string(),
          modifier: z.number(),
        })
        .array(),
    }),
    z.looseObject({
      type: z.literal("apothecary"),
      id: z.string(),
      chooserTeamId: z.string(),
      playerId: z.string(),
      resultKind: z.union([z.literal("ko"), z.literal("casualty")]),
      location: z
        .union([z.literal("pitch"), z.literal("crowd")])
        .exactOptional(),
      position: gridPositionSchema.exactOptional(),
      casualtyType: z
        .union([
          z.literal("badly-hurt"),
          z.literal("seriously-hurt"),
          z.literal("dead"),
        ])
        .exactOptional(),
    }),
    inducementChoiceDecisionRequestSchema,
    foulAssistsDecisionRequestSchema,
  ]),
  rng: rNGStateSchema,
  matchStats: matchStatsSnapshotSchema,
  applied: z.number(),
  replay: headlessCommandSchema.array(),
  checksum: z.string(),
});
