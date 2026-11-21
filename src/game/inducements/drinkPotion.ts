import { type FlowContext } from "../core/GameFlowManager";
import { CasualtyOperation } from "../operations/CasualtyOperation";
import { SKILL_ROLL_TABLE } from "../progression/progression";
import { type DiceController } from "../controllers/DiceController";
import { Inducement } from "@/types/Inducements";
import { type Player } from "@/types/Player";
import { SkillCategory, type SkillType, hasSkill } from "@/types/Skills";
import { type PotionInducement } from "./inventory";
import {
  grantSkills,
  grantStats,
  killPlayer,
  logPotion,
  returnToPlay,
} from "./potionShared";
import { type PotionBoost, potionOutcome } from "./potionTables";
import { addPotionEffect } from "./variantState";
import { rollCasualty } from "../operations/injuryVerdict";
import { playerInjuryTable } from "../rules/injuryRules";

export function pickRandom<T>(
  dice: DiceController,
  items: readonly T[],
  roll: { label: string; teamId: string }
): T | undefined {
  if (items.length === 0) return undefined;
  const accepted = Math.floor(16 / items.length) * items.length;
  let d16: number;
  do {
    d16 = dice.rollD16(roll.label, roll.teamId);
  } while (d16 > accepted);
  return items[(d16 - 1) % items.length];
}

function randomMutation(
  dice: DiceController,
  player: Player
): SkillType | undefined {
  const options = SKILL_ROLL_TABLE[SkillCategory.MUTATION].filter(
    (skill) => !hasSkill(player.skills, skill)
  );
  return pickRandom(dice, options, {
    label: `Mutation (${player.playerName})`,
    teamId: player.teamId,
  });
}

function applyBoost(
  context: FlowContext,
  player: Player,
  outcome: PotionBoost
): void {
  const state = context.gameService.getState();
  if (outcome.recovers) returnToPlay(player, context.eventBus);
  const mutation = outcome.mutation
    ? randomMutation(context.gameService.getDiceController(), player)
    : undefined;
  grantSkills(
    state,
    player,
    mutation ? [...outcome.skills, mutation] : outcome.skills
  );
  grantStats(state, player, outcome.stats);
  if (outcome.effect) addPotionEffect(state, player.id, outcome.effect);
}

export async function drinkPotion(
  context: FlowContext,
  player: Player,
  kind: PotionInducement
): Promise<void> {
  const dice = context.gameService.getDiceController();
  const label = `${kind} (${player.playerName})`;
  let outcome = potionOutcome(kind, dice.rollD8(label, player.teamId));
  if (outcome.kind === "superior") {
    logPotion(context.eventBus, `${player.playerName} finds ${outcome.name}`);
    outcome = potionOutcome(
      Inducement.SUPERIOR_MAGIC_POTION,
      dice.rollD8(
        `${Inducement.SUPERIOR_MAGIC_POTION} (${player.playerName})`,
        player.teamId
      )
    );
  }
  logPotion(
    context.eventBus,
    `${kind}: ${player.playerName} drinks ${outcome.name}`
  );
  switch (outcome.kind) {
    case "dies":
      killPlayer(player, context.eventBus);
      return;
    case "casualty":
      await new CasualtyOperation(
        player.id,
        rollCasualty(
          dice,
          player,
          playerInjuryTable(context.gameService, player)
        )
      ).execute(context);
      return;
    case "nothing":
    case "superior":
      return;
    case "boost":
      applyBoost(context, player, outcome);
      return;
  }
}
