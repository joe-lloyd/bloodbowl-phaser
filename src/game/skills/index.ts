/**
 * Skill rules entry point. Importing this module registers the built-in
 * rules with the SkillRegistry and exposes the fold helpers that roll paths
 * call. Add a rule by creating one file under rules/ and registering it here.
 */

import { SkillType } from "../../types/Skills";
import { Player, hasTackleZone } from "../../types/Player";
import { SkillRegistry } from "./SkillRegistry";
import {
  ActionDeclaredContext,
  BlockResultContext,
  CountAssistContext,
  TurnEndingContext,
} from "./SkillRule";
import { BlockRule } from "./rules/BlockRule";
import { DodgeRule } from "./rules/DodgeRule";
import { TackleRule } from "./rules/TackleRule";
import { SureHandsRule } from "./rules/SureHandsRule";
import { CatchRule } from "./rules/CatchRule";
import { PassRule } from "./rules/PassRule";
import { WrestleRule } from "./rules/WrestleRule";
import { StandFirmRule } from "./rules/StandFirmRule";
import { SureFeetRule } from "./rules/SureFeetRule";
import { SprintRule } from "./rules/SprintRule";
import { JumpUpRule } from "./rules/JumpUpRule";
import { TwoHeadsRule } from "./rules/TwoHeadsRule";
import { BreakTackleRule } from "./rules/BreakTackleRule";
import { BigHandRule } from "./rules/BigHandRule";
import { ExtraArmsRule } from "./rules/ExtraArmsRule";
import { NoBallRule } from "./rules/NoBallRule";
import { AccurateRule } from "./rules/AccurateRule";
import { CannoneerRule } from "./rules/CannoneerRule";
import { NervesOfSteelRule } from "./rules/NervesOfSteelRule";
import { SafePassRule } from "./rules/SafePassRule";
import { MightyBlowRule } from "./rules/MightyBlowRule";
import { ClawsRule } from "./rules/ClawsRule";
import { IronHardSkinRule } from "./rules/IronHardSkinRule";
import { ThickSkullRule } from "./rules/ThickSkullRule";
import { DecayRule } from "./rules/DecayRule";
import { RegenerationRule } from "./rules/RegenerationRule";
import { GuardRule } from "./rules/GuardRule";
import { DefensiveRule } from "./rules/DefensiveRule";
import { HornsRule } from "./rules/HornsRule";
import { DauntlessRule } from "./rules/DauntlessRule";
import { FoulAppearanceRule } from "./rules/FoulAppearanceRule";
import { BrawlerRule } from "./rules/BrawlerRule";
import { FendRule } from "./rules/FendRule";
import { StripBallRule } from "./rules/StripBallRule";
import { GrabRule } from "./rules/GrabRule";
import { JuggernautRule } from "./rules/JuggernautRule";
import { PrehensileTailRule } from "./rules/PrehensileTailRule";
import { ArmBarRule } from "./rules/ArmBarRule";
import { DisturbingPresenceRule } from "./rules/DisturbingPresenceRule";
import { TitchyRule } from "./rules/TitchyRule";
import { StuntyRule } from "./rules/StuntyRule";
import { SidestepRule } from "./rules/SidestepRule";
import { TauntRule } from "./rules/TauntRule";
import { DivingTackleRule } from "./rules/DivingTackleRule";
import { ShadowingRule } from "./rules/ShadowingRule";
import { TentaclesRule } from "./rules/TentaclesRule";
import { UnsteadyRule } from "./rules/UnsteadyRule";
import { StabRule } from "./rules/StabRule";
import { BoneHeadRule } from "./rules/BoneHeadRule";
import { ReallyStupidRule } from "./rules/ReallyStupidRule";
import { UnchannelledFuryRule } from "./rules/UnchannelledFuryRule";
import { TakeRootRule } from "./rules/TakeRootRule";
import { TimmberRule } from "./rules/TimmberRule";
import { DrunkardRule } from "./rules/DrunkardRule";
import { LonerRule } from "./rules/LonerRule";
import { ProRule } from "./rules/ProRule";
import { AnimalSavageryRule } from "./rules/AnimalSavageryRule";
import { BloodlustRule } from "./rules/BloodlustRule";
import { AnimosityRule } from "./rules/AnimosityRule";
import { HatredRule } from "./rules/HatredRule";
import { PickMeUpRule } from "./rules/PickMeUpRule";
import { TricksterRule } from "./rules/TricksterRule";
import { AlwaysHungryRule } from "./rules/AlwaysHungryRule";
import { PlagueRiddenRule } from "./rules/PlagueRiddenRule";
import { FrenzyRule } from "./rules/FrenzyRule";
import { SteadyFootingRule } from "./rules/SteadyFootingRule";
import { MyBallRule } from "./rules/MyBallRule";
import { MonstrousMouthRule } from "./rules/MonstrousMouthRule";
import { HypnoticGazeRule } from "./rules/HypnoticGazeRule";
import { BreatheFireRule } from "./rules/BreatheFireRule";
import { ProjectileVomitRule } from "./rules/ProjectileVomitRule";
import { KickRule } from "./rules/KickRule";
import { ThrowTeamMateRule } from "./rules/ThrowTeamMateRule";
import { KickTeamMateRule } from "./rules/KickTeamMateRule";
import { RightStuffRule } from "./rules/RightStuffRule";
import { SwoopRule } from "./rules/SwoopRule";
import { StrongArmRule } from "./rules/StrongArmRule";
import { CloudBursterRule } from "./rules/CloudBursterRule";
import { HailMaryPassRule } from "./rules/HailMaryPassRule";
import { PutTheBootInRule } from "./rules/PutTheBootInRule";
import { DirtyPlayerRule } from "./rules/DirtyPlayerRule";
import { LoneFoulerRule } from "./rules/LoneFoulerRule";
import { SneakyGitRule } from "./rules/SneakyGitRule";
import { EyeGougeRule } from "./rules/EyeGougeRule";
import { LeapRule } from "./rules/LeapRule";
import { PogoRule } from "./rules/PogoRule";
import { VeryLongLegsRule } from "./rules/VeryLongLegsRule";
import { SafePairOfHandsRule } from "./rules/SafePairOfHandsRule";
import { HitAndRunRule } from "./rules/HitAndRunRule";
import { ChainsawRule } from "./rules/ChainsawRule";
import { BombardierRule } from "./rules/BombardierRule";
import { BallAndChainRule } from "./rules/BallAndChainRule";
import { BullseyeRule } from "./rules/BullseyeRule";
import { QuickFoulRule } from "./rules/QuickFoulRule";
import { GiveAndGoRule } from "./rules/GiveAndGoRule";
import { FumblerooskiRule } from "./rules/FumblerooskiRule";
import { SecretWeaponRule } from "./rules/SecretWeaponRule";
import { DivingCatchRule } from "./rules/DivingCatchRule";
import { ViolentInnovatorRule } from "./rules/ViolentInnovatorRule";
import { PileDriverRule } from "./rules/PileDriverRule";
import { SaboteurRule } from "./rules/SaboteurRule";
import { MultipleBlockRule } from "./rules/MultipleBlockRule";
import { DumpOffRule } from "./rules/DumpOffRule";
import { LeaderRule } from "./rules/LeaderRule";
import { OnTheBallRule } from "./rules/OnTheBallRule";
import { PuntRule } from "./rules/PuntRule";
import { LethalFlightRule } from "./rules/LethalFlightRule";

let registered = false;

/** Register every built-in skill rule (idempotent). */
export function registerBuiltinSkills(): void {
  if (registered) return;
  registered = true;
  SkillRegistry.register(SkillType.BLOCK, BlockRule);
  SkillRegistry.register(SkillType.DODGE, DodgeRule);
  SkillRegistry.register(SkillType.TACKLE, TackleRule);
  SkillRegistry.register(SkillType.SURE_HANDS, SureHandsRule);
  SkillRegistry.register(SkillType.CATCH, CatchRule);
  SkillRegistry.register(SkillType.PASS, PassRule);
  SkillRegistry.register(SkillType.WRESTLE, WrestleRule);
  SkillRegistry.register(SkillType.STAND_FIRM, StandFirmRule);
  SkillRegistry.register(SkillType.SURE_FEET, SureFeetRule);
  SkillRegistry.register(SkillType.SPRINT, SprintRule);
  SkillRegistry.register(SkillType.JUMP_UP, JumpUpRule);
  SkillRegistry.register(SkillType.TWO_HEADS, TwoHeadsRule);
  SkillRegistry.register(SkillType.BREAK_TACKLE, BreakTackleRule);
  SkillRegistry.register(SkillType.BIG_HAND, BigHandRule);
  SkillRegistry.register(SkillType.EXTRA_ARMS, ExtraArmsRule);
  SkillRegistry.register(SkillType.NO_BALL, NoBallRule);
  SkillRegistry.register(SkillType.ACCURATE, AccurateRule);
  SkillRegistry.register(SkillType.CANNONEER, CannoneerRule);
  SkillRegistry.register(SkillType.NERVES_OF_STEEL, NervesOfSteelRule);
  SkillRegistry.register(SkillType.SAFE_PASS, SafePassRule);
  SkillRegistry.register(SkillType.MIGHTY_BLOW, MightyBlowRule);
  SkillRegistry.register(SkillType.CLAWS, ClawsRule);
  SkillRegistry.register(SkillType.IRON_HARD_SKIN, IronHardSkinRule);
  SkillRegistry.register(SkillType.THICK_SKULL, ThickSkullRule);
  SkillRegistry.register(SkillType.DECAY, DecayRule);
  SkillRegistry.register(SkillType.REGENERATION, RegenerationRule);
  SkillRegistry.register(SkillType.GUARD, GuardRule);
  SkillRegistry.register(SkillType.DEFENSIVE, DefensiveRule);
  SkillRegistry.register(SkillType.HORNS, HornsRule);
  SkillRegistry.register(SkillType.DAUNTLESS, DauntlessRule);
  SkillRegistry.register(SkillType.FOUL_APPEARANCE, FoulAppearanceRule);
  SkillRegistry.register(SkillType.BRAWLER, BrawlerRule);
  SkillRegistry.register(SkillType.FEND, FendRule);
  SkillRegistry.register(SkillType.STRIP_BALL, StripBallRule);
  SkillRegistry.register(SkillType.GRAB, GrabRule);
  SkillRegistry.register(SkillType.JUGGERNAUT, JuggernautRule);
  SkillRegistry.register(SkillType.PREHENSILE_TAIL, PrehensileTailRule);
  SkillRegistry.register(SkillType.ARM_BAR, ArmBarRule);
  SkillRegistry.register(SkillType.DISTURBING_PRESENCE, DisturbingPresenceRule);
  SkillRegistry.register(SkillType.TITCHY, TitchyRule);
  SkillRegistry.register(SkillType.STUNTY, StuntyRule);
  SkillRegistry.register(SkillType.SIDESTEP, SidestepRule);
  SkillRegistry.register(SkillType.TAUNT, TauntRule);
  SkillRegistry.register(SkillType.DIVING_TACKLE, DivingTackleRule);
  SkillRegistry.register(SkillType.SHADOWING, ShadowingRule);
  SkillRegistry.register(SkillType.TENTACLES, TentaclesRule);
  SkillRegistry.register(SkillType.UNSTEADY, UnsteadyRule);
  SkillRegistry.register(SkillType.STAB, StabRule);
  SkillRegistry.register(SkillType.BONE_HEAD, BoneHeadRule);
  SkillRegistry.register(SkillType.REALLY_STUPID, ReallyStupidRule);
  SkillRegistry.register(SkillType.UNCHANNELLED_FURY, UnchannelledFuryRule);
  SkillRegistry.register(SkillType.TAKE_ROOT, TakeRootRule);
  SkillRegistry.register(SkillType.TIMMM_BER, TimmberRule);
  SkillRegistry.register(SkillType.DRUNKARD, DrunkardRule);
  SkillRegistry.register(SkillType.LONER, LonerRule);
  SkillRegistry.register(SkillType.PRO, ProRule);
  SkillRegistry.register(SkillType.ANIMAL_SAVAGERY, AnimalSavageryRule);
  SkillRegistry.register(SkillType.BLOODLUST, BloodlustRule);
  SkillRegistry.register(SkillType.ANIMOSITY, AnimosityRule);
  SkillRegistry.register(SkillType.HATRED, HatredRule);
  SkillRegistry.register(SkillType.PICK_ME_UP, PickMeUpRule);
  SkillRegistry.register(SkillType.TRICKSTER, TricksterRule);
  SkillRegistry.register(SkillType.ALWAYS_HUNGRY, AlwaysHungryRule);
  SkillRegistry.register(SkillType.PLAGUE_RIDDEN, PlagueRiddenRule);
  SkillRegistry.register(SkillType.FRENZY, FrenzyRule);
  SkillRegistry.register(SkillType.STEADY_FOOTING, SteadyFootingRule);
  SkillRegistry.register(SkillType.MY_BALL, MyBallRule);
  SkillRegistry.register(SkillType.MONSTROUS_MOUTH, MonstrousMouthRule);
  SkillRegistry.register(SkillType.HYPNOTIC_GAZE, HypnoticGazeRule);
  SkillRegistry.register(SkillType.BREATHE_FIRE, BreatheFireRule);
  SkillRegistry.register(SkillType.PROJECTILE_VOMIT, ProjectileVomitRule);
  SkillRegistry.register(SkillType.KICK, KickRule);
  SkillRegistry.register(SkillType.THROW_TEAM_MATE, ThrowTeamMateRule);
  SkillRegistry.register(SkillType.KICK_TEAM_MATE, KickTeamMateRule);
  SkillRegistry.register(SkillType.RIGHT_STUFF, RightStuffRule);
  SkillRegistry.register(SkillType.SWOOP, SwoopRule);
  SkillRegistry.register(SkillType.STRONG_ARM, StrongArmRule);
  SkillRegistry.register(SkillType.CLOUD_BURSTER, CloudBursterRule);
  SkillRegistry.register(SkillType.HAIL_MARY_PASS, HailMaryPassRule);
  SkillRegistry.register(SkillType.PUT_THE_BOOT_IN, PutTheBootInRule);
  SkillRegistry.register(SkillType.DIRTY_PLAYER, DirtyPlayerRule);
  SkillRegistry.register(SkillType.LONE_FOULER, LoneFoulerRule);
  SkillRegistry.register(SkillType.SNEAKY_GIT, SneakyGitRule);
  SkillRegistry.register(SkillType.EYE_GOUGE, EyeGougeRule);
  SkillRegistry.register(SkillType.LEAP, LeapRule);
  SkillRegistry.register(SkillType.POGO, PogoRule);
  SkillRegistry.register(SkillType.VERY_LONG_LEGS, VeryLongLegsRule);
  SkillRegistry.register(SkillType.SAFE_PAIR_OF_HANDS, SafePairOfHandsRule);
  SkillRegistry.register(SkillType.HIT_AND_RUN, HitAndRunRule);
  SkillRegistry.register(SkillType.CHAINSAW, ChainsawRule);
  SkillRegistry.register(SkillType.BOMBARDIER, BombardierRule);
  SkillRegistry.register(SkillType.BALL_AND_CHAIN, BallAndChainRule);
  SkillRegistry.register(SkillType.BULLSEYE, BullseyeRule);
  SkillRegistry.register(SkillType.QUICK_FOUL, QuickFoulRule);
  SkillRegistry.register(SkillType.GIVE_AND_GO, GiveAndGoRule);
  SkillRegistry.register(SkillType.FUMBLEROOSKI, FumblerooskiRule);
  SkillRegistry.register(SkillType.SECRET_WEAPON, SecretWeaponRule);
  SkillRegistry.register(SkillType.DIVING_CATCH, DivingCatchRule);
  SkillRegistry.register(SkillType.VIOLENT_INNOVATOR, ViolentInnovatorRule);
  SkillRegistry.register(SkillType.PILE_DRIVER, PileDriverRule);
  SkillRegistry.register(SkillType.SABOTEUR, SaboteurRule);
  SkillRegistry.register(SkillType.MULTIPLE_BLOCK, MultipleBlockRule);
  SkillRegistry.register(SkillType.DUMP_OFF, DumpOffRule);
  SkillRegistry.register(SkillType.LEADER, LeaderRule);
  SkillRegistry.register(SkillType.ON_THE_BALL, OnTheBallRule);
  SkillRegistry.register(SkillType.PUNT, PuntRule);
  SkillRegistry.register(SkillType.LETHAL_FLIGHT, LethalFlightRule);
}

// Register on first import so any consumer of the fold helpers is covered.
registerBuiltinSkills();

/** Trigger points a rule can hook (see SkillRule). */
export type TriggerHook =
  | "onDodgeDeclared"
  | "onDodgeResolved"
  | "onBlockDeclared"
  | "onBlockDiceRolled"
  | "onPush"
  | "onBlockResult"
  | "onFollowUp"
  | "onArmourBreak"
  | "onPickup"
  | "onCatch"
  | "onPassDeclared"
  | "onPassResult"
  | "onHandoffDeclared"
  | "onInjuryRoll"
  | "onCasualty"
  | "onCasualtyRoll"
  | "onActivationDeclared"
  | "onRushDeclared"
  | "onJumpDeclared"
  | "onStandUpRoll";

/**
 * Deterministic all-participant gather: actor first, then target, then the
 * remaining relevant players (typically adjacents) ordered by board position
 * (top-to-bottom, left-to-right). Duplicates collapse to first appearance,
 * so multi-skill interactions replay identically.
 */
export function gatherParticipants(
  actor: Player,
  target?: Player,
  others: Player[] = []
): Player[] {
  const byPosition = [...others]
    .filter((p) => p.gridPosition)
    .sort(
      (a, b) =>
        a.gridPosition!.y - b.gridPosition!.y ||
        a.gridPosition!.x - b.gridPosition!.x
    );
  const seen = new Set<string>();
  const participants: Player[] = [];
  for (const p of [actor, ...(target ? [target] : []), ...byPosition]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      participants.push(p);
    }
  }
  return participants;
}

/**
 * On-pitch players within `range` squares (Chebyshev) of a square, any
 * status — aura skills like Disturbing Presence work even while down.
 */
export function playersWithin(
  square: { x: number; y: number },
  players: Player[],
  range: number
): Player[] {
  return players.filter((p) => {
    if (!p.gridPosition) return false;
    const dx = Math.abs(p.gridPosition.x - square.x);
    const dy = Math.abs(p.gridPosition.y - square.y);
    return dx <= range && dy <= range && dx + dy > 0;
  });
}

/**
 * Players with a Tackle Zone adjacent to a square — the usual "others" for
 * a gather (Distracted players have no Tackle Zone and never mark).
 */
export function adjacentStanding(
  square: { x: number; y: number },
  players: Player[]
): Player[] {
  return players.filter((p) => {
    if (!p.gridPosition || !hasTackleZone(p)) return false;
    const dx = Math.abs(p.gridPosition.x - square.x);
    const dy = Math.abs(p.gridPosition.y - square.y);
    return dx <= 1 && dy <= 1 && dx + dy > 0;
  });
}

/**
 * Fold every participant's registered rules over a trigger context, in
 * gather order. Async because a reaction hook may pause on a decision.
 * A rule without the hook is skipped; unregistered skills are inert.
 */
export async function foldTrigger(
  hook: TriggerHook,
  participants: Player[],
  ctx: unknown
): Promise<void> {
  for (const self of participants) {
    for (const skill of self.skills) {
      const rule = SkillRegistry.get(skill.type) as
        | Record<
            string,
            ((c: unknown, s: Player) => void | Promise<void>) | undefined
          >
        | undefined;
      await rule?.[hook]?.(ctx, self);
    }
  }
}

/**
 * Fold rules over a block result. Participants: attacker, defender, then
 * players adjacent to either (deterministic order via gatherParticipants).
 */
export async function foldBlockResult(
  ctx: BlockResultContext,
  allPlayers: Player[] = []
): Promise<void> {
  const adjacents = [
    ...(ctx.attacker.gridPosition
      ? adjacentStanding(ctx.attacker.gridPosition, allPlayers)
      : []),
    ...(ctx.defender.gridPosition
      ? adjacentStanding(ctx.defender.gridPosition, allPlayers)
      : []),
  ];
  await foldTrigger(
    "onBlockResult",
    gatherParticipants(ctx.attacker, ctx.defender, adjacents),
    ctx
  );
}

/**
 * Fold assist-eligibility rules over the participants (assister first, then
 * markers). Synchronous — assist counting is passive and runs during preview,
 * so it never awaits a decision.
 */
export function foldCountAssists(
  ctx: CountAssistContext,
  participants: Player[]
): void {
  for (const self of participants) {
    for (const skill of self.skills) {
      SkillRegistry.get(skill.type)?.onCountAssists?.(ctx, self);
    }
  }
}

/**
 * Fold end-of-opposition-turn rules over the reacting team's players
 * (Pick-Me-Up). Synchronous — runs inside endTurn before the next turn
 * starts, so stood players are up when it begins.
 */
export function foldTurnEnding(
  ctx: TurnEndingContext,
  participants: Player[]
): void {
  for (const self of participants) {
    for (const skill of self.skills) {
      SkillRegistry.get(skill.type)?.onTurnEnding?.(ctx, self);
    }
  }
}

/**
 * Fold declaration-gating rules for the declaring player. Synchronous -
 * declaration gating is passive and never awaits a decision (see
 * onActionDeclared).
 */
export function foldActionDeclared(ctx: ActionDeclaredContext): void {
  for (const skill of ctx.player.skills) {
    SkillRegistry.get(skill.type)?.onActionDeclared?.(ctx, ctx.player);
  }
}

export { SkillRegistry } from "./SkillRegistry";
export { RerollArbiter } from "./RerollArbiter";
export { DecisionService } from "./DecisionService";
export { withRerollOffer } from "./rerolls";
export type { RollLike, RerollDeps } from "./rerolls";
export type {
  SkillRule,
  SkillTriggerRecord,
  FlowLike,
  BlockResultContext,
  DodgeDeclaredContext,
  DodgeResolvedContext,
  BlockDeclaredContext,
  BlockDiceRolledContext,
  PushContext,
  FollowUpContext,
  ArmourBreakContext,
  PickupContext,
  CatchContext,
  PassDeclaredContext,
  PassResultContext,
  HandoffDeclaredContext,
  InjuryRollContext,
  CasualtyContext,
  CasualtyRollContext,
  CountAssistContext,
  ActionDeclaredContext,
  ActivationDeclaredContext,
  ActivationGate,
  ActivationGateFailure,
  RushDeclaredContext,
  StandUpRollContext,
  TurnEndingContext,
  TeamRerollGateContext,
} from "./SkillRule";
export { rushAllowance, moveAllowance, standUpCost } from "./movement";
