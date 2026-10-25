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

    if (
      target.status !== PlayerStatus.PRONE &&
      target.status !== PlayerStatus.STUNNED
    ) {
      console.warn(
        `[FoulOperation] target ${target.playerName} is not Prone/Stunned (Status: ${target.status})`
      );
      eventBus.emit(
        GameEventNames.UI_Notification,
        "Target must be Prone or Stunned!"
      );
      return;
    }

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} is fouling ${target.playerName}!`
    );

    // Grudge Match (L24): this fouler cannot be Sent-off for this Foul.
    const grudgeMatch = await useGrudgeMatch(context, fouler);

    // 1. Analyze Foul (Assists)
    const opponents = gameService.getOpponents(fouler.teamId);
    const team = gameService.getTeam(fouler.teamId);
    const allPlayers = [...(team?.players || []), ...opponents];

    const analysis = foulController.analyzeFoul(fouler, target, allPlayers);

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Assists: +${analysis.offensiveAssists.length} Offensive, -${analysis.defensiveAssists.length} Defensive. Mod: ${analysis.modifier >= 0 ? "+" : ""}${analysis.modifier}`
    );

    await context.delay(1000);

    // Devious foul skills are the FOULER's own — read inline (like Steady
    // Footing / Frenzy), not via a participant fold.
    const foulerHasNoAssists =
      analysis.offensiveAssists.length === 0 &&
      analysis.defensiveAssists.length === 0;
    // The dice log shows the assists folded into the AV target; whether the
    // roll breaks is decided after the armour fold below.
    const avTarget = effectiveAV(target, gameService.getState()) - analysis.modifier;
    const announce = (skill: SkillType, effect: string) =>
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: fouler.id,
        skill,
        effect,
      });

    // 2. Armour Roll. The assists are an opposition modifier, so the
    // target's own armour rules (Iron Hard Skin) may cancel them. They do
    // not read the natural roll, so a Lone Fouler re-roll reuses the fold.
    let armour = diceController.rollArmorCheck(
      avTarget,
      target.playerName,
      fouler.teamId
    );
    let rolls = armour.rolls;
    const armourCtx = await foldArmourRoll(context, [target], {
      player: target,
      knockedDown: false,
      roll: rolls[0] + rolls[1],
      armourModifier: analysis.modifier,
    });
    const breaks = (bonus: number) =>
      armourBroken(armourCtx, rolls[0] + rolls[1] + bonus, gameService);
    let broken = breaks(0);

    // Lone Fouler: with no assists, re-roll a failed Armour Roll.
    if (
      !broken &&
      foulerHasNoAssists &&
      hasSkill(fouler.skills, SkillType.LONE_FOULER)
    ) {
      announce(
        SkillType.LONE_FOULER,
        "Lone Fouler: re-roll the failed Armour Roll"
      );
      armour = diceController.rollArmorCheck(
        avTarget,
        target.playerName,
        fouler.teamId
      );
      rolls = armour.rolls;
      broken = breaks(0);
    }

    // Dirty Player: +1 after the roll, to Armour OR Injury. Prefer Armour
    // when the +1 breaks it and the target allows armour modifiers,
    // otherwise hold it for the Injury Roll.
    const dirtyPlayer = hasSkill(fouler.skills, SkillType.DIRTY_PLAYER);
    let dirtyUsedOnArmour = false;
    if (dirtyPlayer && !broken && !armourCtx.modifiersLocked && breaks(1)) {
      broken = true;
      dirtyUsedOnArmour = true;
      announce(SkillType.DIRTY_PLAYER, "Dirty Player: +1 to the Armour Roll");
    }

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
        fouler.teamId
      );
      if (injury.rolls[0] === injury.rolls[1]) {
        spotted = true;
      }

      const dirtyOnInjury = dirtyPlayer && !dirtyUsedOnArmour;
      if (dirtyOnInjury) {
        announce(SkillType.DIRTY_PLAYER, "Dirty Player: +1 to the Injury Roll");
      }

      await new InjuryOperation(target.id, {
        roll: injury.total,
        modifier: dirtyOnInjury ? 1 : 0,
        causedById: fouler.id,
        cause: "special",
      }).execute(context);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    await context.delay(1000);

    // Sneaky Git: a natural double on the Armour Roll does not Send-off the
    // fouler unless the target's armour was broken.
    if (
      spotted &&
      !broken &&
      isNaturalDouble &&
      hasSkill(fouler.skills, SkillType.SNEAKY_GIT)
    ) {
      spotted = false;
      announce(
        SkillType.SNEAKY_GIT,
        "Sneaky Git: not Sent-off on an unbroken double"
      );
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
    gameService.commitAction(this.foulerId);

    // A Foul Action ends the activation — unless the fouler has Quick Foul,
    // which lets them continue their Move with any movement remaining.
    if (hasSkill(fouler.skills, SkillType.QUICK_FOUL)) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: fouler.id,
        skill: SkillType.QUICK_FOUL,
        effect: "Quick Foul: the activation continues after the Foul",
      });
    } else {
      context.flowManager.add(
        new FinishFoulActivationOperation(this.foulerId)
      );
    }
  }
}
