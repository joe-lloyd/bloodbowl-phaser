import { lendAssists } from "./lendAssists";
import { lentCount } from "../validators/crossAssists";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { SendOffOperation } from "./SendOffOperation";
import { InjuryOperation } from "./InjuryOperation";
import {
  announceArmour,
  armourBroken,
  foldArmourRoll,
} from "./ArmourOperation";
import { effectiveAV } from "../kickoff/driveEffects";
import {
  holdsMeasure,
  offerMeasure,
  spendMeasure,
  underScrutiny,
} from "../inducements/matchInducements";
import { DesperateMeasure } from "../inducements/desperateMeasures";
import { type FoulAssistsDecisionAnswer } from "../../types/decisions";
import { activeRules } from "../variants/activeMatch";
import { rockFromTheCrowd, sandStopsFoul } from "./foulRetribution";

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

class FinishFoulActivationOperation extends GameOperation {
  public readonly name = "FinishFoulActivation";

  private foulerId: string;
  constructor(foulerId: string) {
    super();
    this.foulerId = foulerId;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    if (gameService.getState().activePlayer?.id === this.foulerId) {
      gameService.finishActivation(this.foulerId);
    }
  }
}

function foulPlayers(context: FlowContext, fouler: Player): Player[] {
  const { gameService } = context;
  const opponents = gameService.getOpponents(fouler.teamId);
  const team = gameService.getTeam(fouler.teamId);
  return [...(team?.players || []), ...opponents];
}

const diceTotal = (rolls: readonly number[]): number =>
  rolls.reduce((sum, roll) => sum + roll, 0);

const signed = (n: number): string => `${n >= 0 ? "+" : ""}${String(n)}`;

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
  const announce = (skill: SkillType, effect: string) => {
    context.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: fouler.id,
      skill,
      effect,
    });
  };
  let { rolls } = armour;
  const breaks = (bonus: number) =>
    armourBroken(armourCtx, diceTotal(rolls) + bonus, context.gameService);
  let broken = breaks(0);

  if (
    !broken &&
    armour.foulerHasNoAssists &&
    hasSkill(fouler.skills, SkillType.LONE_FOULER)
  ) {
    announce(
      SkillType.LONE_FOULER,
      "Lone Fouler: re-roll the failed Armour Roll"
    );
    const before = rolls;
    rolls = armour.reroll();
    broken = breaks(0);
    context.eventBus.emit(GameEventNames.RerollUsed, {
      playerId: fouler.id,
      source: "skill",
      skill: SkillType.LONE_FOULER,
      rollKind: "armour",
      before,
      after: rolls,
    });
  }

  const dirtyPlayer = hasSkill(fouler.skills, SkillType.DIRTY_PLAYER);
  const dirtyUsedOnArmour =
    dirtyPlayer && !broken && !armourCtx.modifiersLocked && breaks(1);
  if (dirtyUsedOnArmour) {
    broken = true;
    announce(SkillType.DIRTY_PLAYER, "Dirty Player: +1 to the Armour Roll");
  }
  return { rolls, broken, dirtyPlayer, dirtyUsedOnArmour };
}

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

function finishFoul(
  context: FlowContext,
  fouler: Player,
  spotted: boolean
): void {
  const { gameService } = context;

  if (spotted) {
    const sendOffOp = new SendOffOperation(
      fouler.id,
      "Player Sent Off for Fouling"
    );

    context.flowManager.add(sendOffOp, true);
  }

  gameService.commitAction(fouler.id);

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

export class FoulOperation extends GameOperation {
  public readonly name = "FoulOperation";

  private foulerId: string;
  private targetX: number;
  private targetY: number;
  constructor(foulerId: string, targetX: number, targetY: number) {
    super();
    this.foulerId = foulerId;
    this.targetX = targetX;
    this.targetY = targetY;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const foulController = gameService.getFoulController();
    const diceController = gameService.getDiceController();

    const fouler = gameService.getPlayerById(this.foulerId);
    const target = gameService.getPlayerAt(this.targetX, this.targetY);

    if (!fouler || !target) {
      console.error(
        `[FoulOperation] Target acquisition failed. Fouler: ${String(!!fouler)}, Target: ${String(!!target)} at ${String(this.targetX)},${String(this.targetY)}`
      );
      eventBus.emit(GameEventNames.UI_Notification, "Foul target missing!");
      return;
    }
    if (!isFoulable(context, target)) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${fouler.playerName} is fouling ${target.playerName}!`
    );

    const grudgeMatch = await useGrudgeMatch(context, fouler);

    const analysis = foulController.analyzeFoul(
      fouler,
      target,
      foulPlayers(context, fouler)
    );

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
    const lent = await lendAssists(gameService, {
      attacker: fouler,
      defender: target,
      action: "foul",
      activeTeamId: gameService.getState().activeTeamId,
    });
    offensive += lent.attacker.length;
    const defended = defensive + lent.defender.length;
    const modifier = offensive - defended;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Assists: +${String(offensive)} Offensive, -${String(defended)} Defensive. Mod: ${signed(modifier)}`
    );

    await context.delay(1000);

    if (sandStopsFoul(context, fouler, target)) return;

    const foulerHasNoAssists =
      analysis.offensiveAssists.length === 0 &&
      analysis.defensiveAssists.length === 0 &&
      lentCount(lent) === 0;

    const av = effectiveAV(target, gameService.getState());
    const announce = (skill: SkillType, effect: string) => {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: fouler.id,
        skill,
        effect,
      });
    };

    const foulArmourRoll = `Foul Armour Roll (${target.playerName})`;
    const armour = diceController.rollArmorCheck(
      { av,playerName: target.playerName,teamId: target.teamId,modifier,rollType: foulArmourRoll }    );
    let rolls = armour.rolls;
    const armourCtx = await foldArmourRoll(context, [target], {
      player: target,
      knockedDown: false,
      roll: diceTotal(rolls),
      armourModifier: modifier,
      surfaceModifier: activeRules().armour.foul,
    });
    const armourResult = rerollAndDirtyPlayer(context, fouler, armourCtx, {
      rolls,
      foulerHasNoAssists,
      reroll: () =>
        diceController.rollArmorCheck(
          { av,playerName: target.playerName,teamId: target.teamId,modifier,rollType: foulArmourRoll }        ).rolls,
    });
    rolls = armourResult.rolls;

    const { broken, dirtyPlayer, dirtyUsedOnArmour } = armourResult;
    announceArmour(eventBus, {
      playerId: target.id,
      rollType: foulArmourRoll,
      diceTeamId: target.teamId,
      roll:
        diceTotal(rolls) +
        armourCtx.armourModifier +
        (dirtyUsedOnArmour ? 1 : 0),
      armor: av,
      broken,
    });

    const isNaturalDouble = rolls[0] === rolls[1];
    let spotted = isNaturalDouble;

    if (broken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      await context.delay(800);

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

      await context.flowManager.runToRest(
        new InjuryOperation(target.id, {
          roll: injury.total,
          modifier: dirtyOnInjury ? 1 : 0,
          causedById: fouler.id,
          cause: "foul",
        })
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    await context.delay(1000);

    spotted =
      activeRules().referee &&
      refereeSpots(context, fouler, {
        spotted,
        broken,
        isNaturalDouble,
        grudgeMatch,
      });
    await rockFromTheCrowd(context, fouler, target);
    finishFoul(context, fouler, spotted);
  }
}
