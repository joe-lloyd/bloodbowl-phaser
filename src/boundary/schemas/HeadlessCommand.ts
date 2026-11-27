import { z } from "zod";
import { formationPositionSchema } from "./FormationPosition";
import { actionTypeSchema } from "./ActionType";
import { blockReplacementSchema } from "./BlockReplacement";
import { moveStepSchema } from "./GridPosition";
import { swoopFacingSchema } from "./SwoopFacing";
import { rerollSourceSchema } from "./RerollSource";
import { dopeStatSchema } from "./DopeStat";
import { wizardSpellSchema } from "./WizardSpell";
import type { HeadlessCommand } from "../../headless/protocol";

const flagSchema = z.union([z.literal(false), z.literal(true)]);

const throwModeSchema = z.union([z.literal("throw"), z.literal("kick")]);

const specialActionSchema = z.union([
  z.literal("breatheFire"),
  z.literal("vomit"),
  z.literal("gaze"),
  z.literal("chomp"),
  z.literal("chainsaw"),
]);

export const headlessCommandSchema: z.ZodType<HeadlessCommand> = z.union([
  z.looseObject({
    type: z.literal("coin-flip"),
  }),
  z.looseObject({
    type: z.literal("ready-weather"),
    teamId: z.string(),
  }),
  z.looseObject({
    type: z.literal("start-setup"),
    kickingTeamId: z.string(),
  }),
  z.looseObject({
    type: z.literal("place-player"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("remove-player"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("swap-players"),
    player1Id: z.string(),
    player2Id: z.string(),
  }),
  z.looseObject({
    type: z.literal("apply-formation"),
    teamId: z.string(),
    formation: formationPositionSchema.array(),
  }),
  z.looseObject({
    type: z.literal("setup-concession"),
    teamId: z.string(),
    concede: z.boolean(),
  }),
  z.looseObject({
    type: z.literal("confirm-setup"),
    teamId: z.string(),
  }),
  z.looseObject({
    type: z.literal("select-kicker"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("kick-ball"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("kickoff-select-player"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("kickoff-move-player"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("kickoff-place-player"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("kickoff-confirm"),
  }),
  z.looseObject({
    type: z.literal("kickoff-skip"),
  }),
  z.looseObject({
    type: z.literal("kickoff-reselect"),
  }),
  z.looseObject({
    type: z.literal("declare-action"),
    playerId: z.string(),
    action: actionTypeSchema,
    blockReplacement: blockReplacementSchema.exactOptional(),
    razzleDazzle: flagSchema.exactOptional(),
    against: z.string().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("cancel-action"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("move"),
    playerId: z.string(),
    path: moveStepSchema.array(),
  }),
  z.looseObject({
    type: z.literal("fumblerooski"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("jump"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("stand-up"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("block"),
    attackerId: z.string(),
    defenderId: z.string(),
  }),
  z.looseObject({
    type: z.literal("multiple-block"),
    attackerId: z.string(),
    defender1Id: z.string(),
    defender2Id: z.string(),
  }),
  z.looseObject({
    type: z.literal("pass"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
    hailMary: flagSchema.exactOptional(),
  }),
  z.looseObject({
    type: z.literal("punt"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("handoff"),
    playerId: z.string(),
    targetId: z.string(),
  }),
  z.looseObject({
    type: z.literal("foul"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("stab"),
    attackerId: z.string(),
    defenderId: z.string(),
  }),
  z.looseObject({
    type: z.literal("throw-teammate"),
    throwerId: z.string(),
    teammateId: z.string(),
    x: z.number(),
    y: z.number(),
    mode: throwModeSchema.exactOptional(),
    swoopFacing: swoopFacingSchema.exactOptional(),
  }),
  z.looseObject({
    type: z.literal("throw-bomb"),
    throwerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("ball-and-chain"),
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("keep-block-dice"),
    attackerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("team-reroll-block"),
    attackerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("pro-reroll-block"),
    attackerId: z.string(),
    dieIndex: z.number(),
  }),
  z.looseObject({
    type: z.literal("brawler-reroll-block"),
    attackerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("veteran-reroll-block"),
    attackerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("special-action"),
    action: specialActionSchema,
    attackerId: z.string(),
    defenderId: z.string(),
  }),
  z.looseObject({
    type: z.literal("end-activation"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("end-turn"),
  }),
  z.looseObject({
    type: z.literal("award-mvp"),
    teamId: z.string(),
    nominatedPlayerIds: z.string().array(),
  }),
  z.looseObject({
    type: z.literal("assign-awarded-touchdown"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("choose-block-result"),
    index: z.number(),
  }),
  z.looseObject({
    type: z.literal("choose-push-direction"),
    x: z.number(),
    y: z.number(),
  }),
  z.looseObject({
    type: z.literal("choose-follow-up"),
    followUp: z.boolean(),
  }),
  z.looseObject({
    type: z.literal("use-reroll"),
    accept: z.boolean(),
    source: rerollSourceSchema.exactOptional(),
  }),
  z.looseObject({
    type: z.literal("use-reaction"),
    accept: z.boolean(),
  }),
  z.looseObject({
    type: z.literal("choose-bite-target"),
    playerId: z.string().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("choose-interception"),
    playerId: z.string().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("touchback"),
    playerId: z.string(),
  }),
  z.looseObject({
    type: z.literal("use-apothecary"),
    accept: z.boolean(),
  }),
  z.looseObject({
    type: z.literal("choose-inducement"),
    playerId: z.string().exactOptional(),
    skill: z.string().exactOptional(),
    stat: dopeStatSchema.exactOptional(),
    spell: wizardSpellSchema.exactOptional(),
    x: z.number().exactOptional(),
    y: z.number().exactOptional(),
  }),
  z.looseObject({
    type: z.literal("choose-foul-assists"),
    count: z.number(),
  }),
  z.looseObject({
    type: z.literal("offer-inducements"),
  }),
  z.looseObject({
    type: z.literal("select-inducement"),
    teamId: z.string(),
    inducement: z.string(),
    quantity: z.number(),
  }),
  z.looseObject({
    type: z.literal("remove-inducement"),
    teamId: z.string(),
    inducement: z.string(),
  }),
  z.looseObject({
    type: z.literal("confirm-inducements"),
    teamId: z.string(),
  }),
  z.looseObject({
    type: z.literal("state"),
  }),
  z.looseObject({
    type: z.literal("legal-actions"),
    playerId: z.string().exactOptional(),
  }),
]);
