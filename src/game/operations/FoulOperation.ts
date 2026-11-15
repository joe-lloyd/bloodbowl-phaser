import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { SendOffOperation } from "./SendOffOperation";
import { InjuryOperation } from "./InjuryOperation";
import { armourBroken, foldArmourRoll } from "./ArmourOperation";
import { effectiveAV } from "../kickoff/driveEffects";
import {
  holdsMeasure,
  offerMeasure,
  spendMeasure,
  underScrutiny,
} from "../inducements/matchInducements";
import { DesperateMeasure } from "../inducements/desperateMeasures";
import { FoulAssistsDecisionAnswer } from "../../types/decisions";

/**
 * Grudge Match (L24), used when the player Fouls: a second Foul this turn
 * was declared on it and spends it; otherwise the coach may choose to.
 */
async function useGrudgeMatch(
  context: FlowContext,
  fouler: Player
): Promise<boolean> {
  const state = context.gameService.getState();
  const active = state.activePlayer;
  if (active?.id !== fouler.id || active.action !== "foul") return false;
  if (active.grudgeMatch) {
    return spendMeasure(state, fouler.teamId, DesperateMeasure.GRUDGE_MATCH);
  }
  if (!holdsMeasure(state, fouler.teamId, DesperateMeasure.GRUDGE_MATCH)) {
    return false;
  }
  return offerMeasure(
    context,
    fouler.teamId,
    fouler.id,
    DesperateMeasure.GRUDGE_MATCH,
    `Use Grudge Match? ${fouler.playerName} cannot be Sent-off for this Foul.`
  );
}

/**
 * Ends the fouler's activation once the Foul (and any send-off it queued) has
 * settled — a Foul Action ends the activation. Quick Foul skips this so the
 * player may continue their Move with any movement they have left. Guarded on
 * the fouler still being the active player (a send-off may already have ended
 * it).
 */
class FinishFoulActivationOperation extends GameOperation {
  public readonly name = "FinishFoulActivation";

  constructor(private foulerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    if (gameService.getState().activePlayer?.id === this.foulerId) {
      gameService.finishActivation(this.foulerId);
    }
  }
}

/** Both teams' players, the fouler's first, for counting assists. */
function foulPlayers(context: FlowContext, fouler: Player): Player[] {
  const { gameService } = context;
  const opponents = gameService.getOpponents(fouler.teamId);
  const team = gameService.getTeam(fouler.teamId);
  return [...(team?.players || []), ...opponents];
}

const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n}`;

/**
 * After the armour fold: Lone Fouler re-rolls a failed Armour Roll when
 * there are no assists, then Dirty Player adds +1 to the Armour Roll when
 * that breaks it, otherwise holding it for the Injury Roll.
 */
function rerollAndDirtyPlayer(
  context: FlowContext,
  fouler: Player,
  armourCtx: Awaited<ReturnType<typeof foldArmourRoll>>,
  armour: {
    rolls: number[];
    foulerHasNoAssists: boolean;
    reroll: () => number[];
  }
): {
  rolls: number[];
  broken: boolean;
  dirtyPlayer: boolean;
  dirtyUsedOnArmour: boolean;
} {
  const announce = (skill: SkillType, effect: string) =>
    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: fouler.id,
      skill,
      effect,
    });
  let { rolls } = armour;
  const breaks = (bonus: number) =>
    armourBroken(armourCtx, rolls[0] + rolls[1] + bonus, context.gameService);
  let broken = breaks(0);

  // Lone Fouler: with no assists, re-roll a failed Armour Roll.
  if (
    !broken &&
    armour.foulerHasNoAssists &&
    hasSkill(fouler.skills, SkillType.LONE_FOULER)
  ) {
    announce(
      SkillType.LONE_FOULER,
      "Lone Fouler: re-roll the failed Armour Roll"
    );
    rolls = armour.reroll();
    broken = breaks(0);
  }

  // Dirty Player: +1 after the roll, to Armour OR Injury. Prefer Armour
  // when the +1 breaks it and the target allows armour modifiers,
  // otherwise hold it for the Injury Roll.
  const dirtyPlayer = hasSkill(fouler.skills, SkillType.DIRTY_PLAYER);
  const dirtyUsedOnArmour =
    dirtyPlayer && !broken && !armourCtx.modifiersLocked && breaks(1);
  if (dirtyUsedOnArmour) {
    broken = true;
    announce(SkillType.DIRTY_PLAYER, "Dirty Player: +1 to the Armour Roll");
  }
  return { rolls, broken, dirtyPlayer, dirtyUsedOnArmour };
}

/**
 * The Foul's target must be Prone or Stunned; otherwise the coach is told
 * and the Foul does nothing.
 */
function isFoulable(context: FlowContext, target: Player): boolean {
  if (
    target.status === PlayerStatus.PRONE ||
    target.status === PlayerStatus.STUNNED
  ) {
    return true;
  }
  console.warn(
    `[FoulOperation] target ${target.playerName} is not Prone/Stunned (Status: ${target.status})`
  );
  context.eventBus.emit(
    GameEventNames.UI_Notification,
    "Target must be Prone or Stunned!"
  );
  return false;
}

/**
 * Whether the referee Sends-off the fouler, after Sneaky Git, Under
 * Scrutiny and Grudge Match have had their say, in that order.
 */
function refereeSpots(
  context: FlowContext,
  fouler: Player,
  roll: {
    spotted: boolean;
    broken: boolean;
    isNaturalDouble: boolean;
    grudgeMatch: boolean;
  }
): boolean {
  const { eventBus, gameService } = context;
  const { broken, isNaturalDouble, grudgeMatch } = roll;
  let { spotted } = roll;
  // Sneaky Git: a natural double on the Armour Roll does not Send-off the
  // fouler unless the target's armour was broken.
  if (
    spotted &&
    !broken &&
    isNaturalDouble &&
    hasSkill(fouler.skills, SkillType.SNEAKY_GIT)
  ) {
    spotted = false;
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: fouler.id,
      skill: SkillType.SNEAKY_GIT,
      effect: "Sneaky Git: not Sent-off on an unbroken double",
    });
  }

  // Under Scrutiny (L18): a Foul that breaks the armour of a player whose
  // team prayed for it is always spotted, double or not.
  if (broken && underScrutiny(gameService.getState(), fouler.teamId)) {
    spotted = true;
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Under Scrutiny: the referee saw ${fouler.playerName} break the armour`
    );
  }
  if (spotted && grudgeMatch) {
    spotted = false;
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Grudge Match: ${fouler.playerName} cannot be Sent-off for this Foul`
    );
  }
  return spotted;
}

/**
 * Queue any Send-off, commit the declaration and end the activation, or
 * let a Quick Foul fouler carry on moving.
 */
function finishFoul(
  context: FlowContext,
  fouler: Player,
  spotted: boolean
): void {
  const { gameService } = context;
  // 4. Handle spotted / send-off
  if (spotted) {
    const sendOffOp = new SendOffOperation(
      fouler.id,
      "Player Sent Off for Fouling"
    );
    // Add to front of queue so it processes next
    context.flowManager.add(sendOffOp, true);
  }

  // The Armour Roll (and any Injury Roll) already happened — commit the
  // declaration so it cannot be released or replaced after the fact.
  gameService.commitAction(fouler.id);

  // A Foul Action ends the activation — unless the fouler has Quick Foul,
  // which lets them continue their Move with any movement remaining.
  if (hasSkill(fouler.skills, SkillType.QUICK_FOUL)) {
    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: fouler.id,
      skill: SkillType.QUICK_FOUL,
      effect: "Quick Foul: the activation continues after the Foul",
    });
  } else {
    context.flowManager.add(new FinishFoulActivationOperation(fouler.id));
  }
}

/**
 * FoulOperation
 *
 * Responsibility:
 * - Orchestrate the Foul sequence:
 *   1. Calculate assists (using FoulValidator via FoulController)
 *   2. Roll Armour (via DiceController, resolving via FoulController)
 *   3. Roll Injury if broken (via DiceController)
 *   4. Handle Send-off (spawning SendOffOperation)
 */
export class FoulOperation extends GameOperation {
  public readonly name = "FoulOperation";

  constructor(
    private foulerId: string,
    private targetX: number,
    private targetY: number
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();

    const fouler = gameService.getPlayerById(this.foulerId);
    const target = gameService.getPlayerAt(this.targetX, this.targetY);

    if (!fouler || !target) {
      console.error(
        `[FoulOperation] Target acquisition failed. Fouler: ${!!fouler}, Target: ${!!target} at ${this.targetX},${this.targetY}`
      );
      eventBus.emit(GameEventNames.UI_Notification, "Foul target missing!");
      return;
    }
    if (!isFoulable(context, target)) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} is fouling ${target.playerName}!`
    );

    // Grudge Match (L24): this fouler cannot be Sent-off for this Foul.
    const grudgeMatch = await useGrudgeMatch(context, fouler);

    // 1. Analyze Foul (Assists)
    const analysis = foulController.analyzeFoul(
      fouler,
      target,
      foulPlayers(context, fouler)
    );

    // Offensive Assists "may apply" (FAQ, May 2026): the coach declares how
    // many add +1 before the roll. Defensive Assists always apply.
    let offensive = analysis.offensiveAssists.length;
    const defensive = analysis.defensiveAssists.length;
    if (offensive > 0) {
      const answer = (await gameService.getDecisionService().request({
        type: "foul-assists",
        playerId: fouler.id,
        targetId: target.id,
        chooserTeamId: fouler.teamId,
        available: offensive,
        defensive,
      })) as FoulAssistsDecisionAnswer;
      offensive = answer.count;
    }
    const modifier = offensive - defensive;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Assists: +${offensive} Offensive, -${defensive} Defensive. Mod: ${signed(modifier)}`
    );

    await context.delay(1000);

    // Devious foul skills are the FOULER's own — read inline (like Steady
    // Footing / Frenzy), not via a participant fold.
    const foulerHasNoAssists =
      analysis.offensiveAssists.length === 0 &&
      analysis.defensiveAssists.length === 0;
    // The dice log shows the assists as a modifier against the AV on the
    // player's card; whether the roll breaks is decided after the armour
    // fold below.
    const av = effectiveAV(target, gameService.getState());
    const announce = (skill: SkillType, effect: string) =>
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: fouler.id,
        skill,
        effect,
      });

    // 2. Armour Roll, named as the foul's, like "Injury Roll (name)" beside
    // it. The assists are an opposition modifier, so the
    // target's own armour rules (Iron Hard Skin) may cancel them. They do
    // not read the natural roll, so a Lone Fouler re-roll reuses the fold.
    const foulArmourRoll = `Foul Armour Roll (${target.playerName})`;
    const armour = diceController.rollArmorCheck(
      av,
      target.playerName,
      target.teamId,
      modifier,
      foulArmourRoll
    );
    let rolls = armour.rolls;
    const armourCtx = await foldArmourRoll(context, [target], {
      player: target,
      knockedDown: false,
      roll: rolls[0] + rolls[1],
      armourModifier: modifier,
    });
    const armourResult = rerollAndDirtyPlayer(context, fouler, armourCtx, {
      rolls,
      foulerHasNoAssists,
      reroll: () =>
        diceController.rollArmorCheck(
          av,
          target.playerName,
          target.teamId,
          modifier,
          foulArmourRoll
        ).rolls,
    });
    rolls = armourResult.rolls;
    // Dirty Player is decided here, before the waits below, and held.
    const { broken, dirtyPlayer, dirtyUsedOnArmour } = armourResult;

    const isNaturalDouble = rolls[0] === rolls[1];
    let spotted = isNaturalDouble;

    if (broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      await context.delay(800);

      // 3. Injury Roll. The Foul reads the dice for doubles, then hands the
      // roll to the shared injury resolution (Thick Skull, Stunty, the
      // Apothecary, the Sevens casualty results).
      const injury = diceController.rollInjury(
        target.playerName,
        target.teamId,
        `Injury Roll (${target.playerName})`
      );
      if (injury.rolls[0] === injury.rolls[1]) {
        spotted = true;
      }

      const dirtyOnInjury = dirtyPlayer && !dirtyUsedOnArmour;
      if (dirtyOnInjury) {
        announce(SkillType.DIRTY_PLAYER, "Dirty Player: +1 to the Injury Roll");
      }

      // The Casualty Roll the injury queues belongs to it: run it now, so
      // the victim has left the pitch before any Send-off below.
      await context.flowManager.runToRest(
        new InjuryOperation(target.id, {
          roll: injury.total,
          modifier: dirtyOnInjury ? 1 : 0,
          causedById: fouler.id,
          cause: "special",
        })
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    await context.delay(1000);

    spotted = refereeSpots(context, fouler, {
      spotted,
      broken,
      isNaturalDouble,
      grudgeMatch,
    });
    finishFoul(context, fouler, spotted);
  }
}
