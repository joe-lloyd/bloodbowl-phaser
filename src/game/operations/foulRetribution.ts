import { GameEventNames } from "../../types/events";
import { type Player } from "../../types/Player";
import { type FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { activeRules } from "../variants/activeMatch";
import {
  ArmourOperation,
  announceArmour,
  armourBroken,
  foldArmourRoll,
} from "./ArmourOperation";
import {
  bounceIfBallUnder,
  knockDownPlayer,
  settleSpecialArmour,
} from "./knockDown";

const RETRIBUTION_HITS_ON = 4;
const ROCK_ARMOUR_BONUS = 1;

export function sandStopsFoul(
  context: FlowContext,
  fouler: Player,
  target: Player
): boolean {
  if (activeRules().foulRetribution !== "sand") return false;
  const { gameService, eventBus, flowManager } = context;
  const roll = gameService
    .getDiceController()
    .rollD6(`Sand in the Face (${target.playerName})`, target.teamId);
  if (roll < RETRIBUTION_HITS_ON) {
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `${target.playerName} misses with the sand: the Foul goes ahead`
    );
    return false;
  }
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `${target.playerName} throws sand in ${fouler.playerName}'s face: Knocked Down`
  );
  knockDownPlayer(eventBus, fouler);
  bounceIfBallUnder(context, fouler);
  flowManager.add(
    new ArmourOperation(fouler.id, undefined, undefined, "special"),
    true
  );
  gameService.commitAction(fouler.id);
  gameService.triggerTurnover("Sand in the Face");
  return true;
}

export async function rockFromTheCrowd(
  context: FlowContext,
  fouler: Player,
  target: Player
): Promise<void> {
  if (activeRules().foulRetribution !== "rock" || !fouler.gridPosition) return;
  const { gameService, eventBus } = context;
  const dice = gameService.getDiceController();
  const roll = dice.rollD6(
    `Rock from the Crowd (${target.playerName})`,
    target.teamId
  );
  if (roll < RETRIBUTION_HITS_ON) return;
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `The crowd hits ${fouler.playerName} with a rock`
  );
  const rollType = `Armour Roll (${fouler.playerName})`;
  const armour = dice.roll2D6(rollType, fouler.teamId);
  const ctx = await foldArmourRoll(context, [], {
    player: fouler,
    knockedDown: false,
    roll: armour,
    armourModifier: ROCK_ARMOUR_BONUS,
  });
  const broken = armourBroken(ctx, armour, gameService);
  announceArmour(eventBus, {
    playerId: fouler.id,
    roll: armour + ctx.armourModifier,
    armor: effectiveAV(fouler, gameService.getState()),
    broken,
    rollType,
    diceTeamId: fouler.teamId,
  });
  const hurt = settleSpecialArmour(context, {
    victim: fouler,
    causedBy: undefined,
    broken,
    injuryModifier: ctx.injuryModifier,
    announceBreak: true,
  });
  if (hurt) gameService.triggerTurnover("Hit by a Rock");
}
