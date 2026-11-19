import { z } from "zod";
import { gamePhaseSchema } from "./GamePhase";
import { turnSnapshotSchema } from "./TurnSnapshot";
import { weatherSchema } from "./Weather";
import { actionTypeSchema } from "./ActionType";
import { setupStateSchema } from "./SetupState";
import { matchResultSchema } from "./MatchResult";
import { teamSnapshotSchema } from "./TeamSnapshot";
import { driveEffectsSchema } from "./DriveEffects";
import { turnUsageSchema } from "./TurnUsage";
import { inducementsMatchStateSchema } from "./InducementsMatchState";
import { pregameInducementsStateSchema } from "./PregameInducementsState";
import { matchInducementsStateSchema } from "./MatchInducementsState";
import { kickoffEventSchema } from "./KickoffEvent";
import { kickoffEventOutcomeSchema } from "./KickoffEventOutcome";
import { turnManagerStateSchema } from "./TurnManagerState";
import type { GameSnapshot } from "../../headless/serialization";

export const gameSnapshotSchema: z.ZodType<GameSnapshot> = z.looseObject({
  phase: gamePhaseSchema,
  subPhase: z.union([
    z.null(),
    z.literal("INTRO"),
    z.literal("WEATHER"),
    z.literal("COIN_FLIP"),
    z.literal("SETUP_KICKING"),
    z.literal("SETUP_RECEIVING"),
    z.literal("SETUP_KICKOFF"),
    z.literal("ROLL_KICKOFF"),
    z.literal("RESOLVE_KICKOFF"),
    z.literal("PLACE_BALL"),
    z.literal("TURN_RECEIVING"),
    z.literal("TURN_KICKING"),
    z.literal("SCORING"),
    z.literal("RECOVER_KO"),
    z.literal("SECRET_WEAPONS"),
  ]),
  activeTeamId: z.union([z.null(), z.string()]),
  turn: turnSnapshotSchema,
  score: z.record(z.string(), z.number()),
  knockout: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  paysWinnings: z.union([z.literal(false), z.literal(true)]).exactOptional(),
  weather: weatherSchema,
  ballPosition: z.union([
    z.null(),
    z.looseObject({
      x: z.number(),
      y: z.number(),
    }),
  ]),
  activePlayer: z.union([
    z.null(),
    z.looseObject({
      id: z.string(),
      action: z.union([
        z.null(),
        z.literal("move"),
        z.literal("block"),
        z.literal("multipleBlock"),
        z.literal("blitz"),
        z.literal("pass"),
        z.literal("punt"),
        z.literal("handoff"),
        z.literal("foul"),
        z.literal("standUp"),
        z.literal("throwTeamMate"),
        z.literal("secureBall"),
        z.literal("special"),
        z.literal("stab"),
        z.literal("breatheFire"),
        z.literal("vomit"),
        z.literal("gaze"),
        z.literal("chomp"),
        z.literal("chainsaw"),
        z.literal("throwBomb"),
        z.literal("ballAndChain"),
        z.literal("forgoe"),
      ]),
      blockReplacement: z
        .union([
          z.literal("stab"),
          z.literal("breatheFire"),
          z.literal("vomit"),
          z.literal("chomp"),
          z.literal("chainsaw"),
        ])
        .exactOptional(),
      blockReplacementUsed: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
      committed: z.union([z.literal(false), z.literal(true)]).exactOptional(),
      bloodlustUnsated: z
        .union([z.literal(false), z.literal(true)])
        .exactOptional(),
      grudgeMatch: z.union([z.literal(false), z.literal(true)]).exactOptional(),
      razzleDazzle: z
        .looseObject({
          actions: actionTypeSchema.array(),
          awaitingSecond: z
            .union([z.literal(false), z.literal(true)])
            .exactOptional(),
          movementBefore: z.number().exactOptional(),
        })
        .exactOptional(),
      stalling: z.union([z.literal(false), z.literal(true)]).exactOptional(),
    }),
  ]),
  setup: z.union([z.null(), setupStateSchema]).exactOptional(),
  result: matchResultSchema.exactOptional(),
  teams: teamSnapshotSchema.array(),
  driveEffects: driveEffectsSchema.exactOptional(),
  bribes: z.record(z.string(), z.number()).exactOptional(),
  weatherReady: z.string().array().exactOptional(),
  teamRerollsUsed: z.record(z.string(), z.number()).exactOptional(),
  leaderRerolls: z
    .looseObject({
      half: z.union([z.literal("h1"), z.literal("h2")]),
      teamIds: z.string().array(),
    })
    .exactOptional(),
  veteranRerollsUsed: z.string().array().exactOptional(),
  briberyRerollsUsed: z.string().array().exactOptional(),
  stallingPlayerIds: z.string().array().exactOptional(),
  turnUsage: turnUsageSchema.exactOptional(),
  chargeTeamId: z.string().exactOptional(),
  raisedDead: z.record(z.string(), z.string()).exactOptional(),
  fanFactors: z.record(z.string(), z.number()).exactOptional(),
  inducements: inducementsMatchStateSchema.exactOptional(),
  pregameInducements: pregameInducementsStateSchema.exactOptional(),
  matchInducements: matchInducementsStateSchema.exactOptional(),
  kickoffResolution: z
    .looseObject({
      roll: z.number(),
      event: kickoffEventSchema,
      meaning: z.string(),
      outcome: kickoffEventOutcomeSchema,
    })
    .exactOptional(),
  kickoffKickResolved: z
    .looseObject({
      isTeam1Kicking: z.boolean(),
    })
    .exactOptional(),
  turnManager: turnManagerStateSchema.exactOptional(),
});
