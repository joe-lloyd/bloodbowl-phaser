import { GameEventNames } from "../../types/events";
import { InjuryType, type Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { movePlayerToBox } from "../rules/playerLocation";
import { activeRules } from "../variants/activeMatch";
import { CasualtyOperation } from "./CasualtyOperation";
import { rollCasualty } from "./injuryVerdict";
import { resolveSendOff } from "./refereeCall";

const OFF_THE_PITCH: readonly PlayerStatus[] = [
  PlayerStatus.RESERVE,
  PlayerStatus.REMOVED,
];

const GONE: readonly PlayerStatus[] = [
  ...OFF_THE_PITCH,
  PlayerStatus.INJURED,
  PlayerStatus.DEAD,
];

const STAYS_ON = 4;
const LONER_STAYS_ON = 6;
const CROWD_CASUALTY_ON = 1;

function playedTheDrive(player: Player, gone: readonly PlayerStatus[]): boolean {
  return (
    hasSkill(player.skills, SkillType.SECRET_WEAPON) &&
    !gone.includes(player.status)
  );
}

function secretWeaponLog(
  context: FlowContext,
  player: Player,
  effect: string
): void {
  context.eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: player.id,
    skill: SkillType.SECRET_WEAPON,
    effect,
  });
}

function rollForCrowd(context: FlowContext, player: Player): number {
  return context.gameService
    .getDiceController()
    .rollD6(`Crowd v Secret Weapon (${player.playerName})`, player.teamId);
}

function streetCrowd(context: FlowContext, player: Player): void {
  const needs = hasSkill(player.skills, SkillType.LONER)
    ? LONER_STAYS_ON
    : STAYS_ON;
  if (rollForCrowd(context, player) >= needs) {
    secretWeaponLog(context, player, "Secret Weapon: fights free of the crowd");
    return;
  }
  secretWeaponLog(
    context,
    player,
    "Secret Weapon: the crowd drags them off, Badly Hurt"
  );
  movePlayerToBox(player, { box: "casualty" }, context.eventBus);
  player.injuries.push(InjuryType.BADLY_HURT);
  context.eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
    victimId: player.id,
    cause: "crowd",
    sppEligible: false,
  });
}

async function gutterCrowd(
  context: FlowContext,
  player: Player
): Promise<void> {
  if (rollForCrowd(context, player) >= STAYS_ON) {
    secretWeaponLog(context, player, "Secret Weapon: fights free of the crowd");
    return;
  }
  if (rollForCrowd(context, player) > CROWD_CASUALTY_ON) {
    secretWeaponLog(
      context,
      player,
      "Secret Weapon: the crowd runs them out of the game"
    );
    movePlayerToBox(player, { box: "sent-off" }, context.eventBus);
    return;
  }
  secretWeaponLog(
    context,
    player,
    "Secret Weapon: the crowd leaves them a Casualty"
  );
  const record = rollCasualty(context.gameService.getDiceController(), player);
  movePlayerToBox(player, { box: "casualty" }, context.eventBus);
  context.eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
    victimId: player.id,
    cause: "crowd",
    sppEligible: false,
  });
  await context.flowManager.runToRest(new CasualtyOperation(player.id, record));
}

function missesTheRestOfTheMatch(context: FlowContext, player: Player): void {
  secretWeaponLog(
    context,
    player,
    "Secret Weapon: sand in the works, out for the rest of the match"
  );
  movePlayerToBox(player, { box: "sent-off" }, context.eventBus);
}

export async function secretWeaponsAfterDrive(
  context: FlowContext,
  players: readonly Player[]
): Promise<void> {
  const rule = activeRules().secretWeaponsAfterDrive;
  const gone = rule === "referee" ? OFF_THE_PITCH : GONE;
  for (const player of players.filter((p) => playedTheDrive(p, gone))) {
    switch (rule) {
      case "referee":
        secretWeaponLog(
          context,
          player,
          "Secret Weapon: Sent-off at the end of the Drive"
        );
        await resolveSendOff(context, player, "secret-weapon");
        break;
      case "one-drive":
        missesTheRestOfTheMatch(context, player);
        break;
      case "street-crowd":
        streetCrowd(context, player);
        break;
      case "gutter-crowd":
        await gutterCrowd(context, player);
        break;
    }
  }
}
