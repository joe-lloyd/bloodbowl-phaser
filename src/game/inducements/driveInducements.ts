import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { type GameState } from "@/types/GameState";
import { Inducement } from "@/types/Inducements";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { type Team } from "@/types/Team";
import {
  type DecisionAnswer,
  type InducementChoiceDecisionAnswer,
  type InducementChoiceDecisionRequest,
  type InducementChoiceKind,
} from "@/types/decisions";
import {
  type PotionInducement,
  inducementCount,
  inducementUsesLeft,
  spendInducement,
} from "./inventory";
import { drinkPotion } from "./drinkPotion";
import { isFrog } from "./matchInducements";
import { logPotion } from "./potionShared";
import {
  assignSouvenir,
  rollSouvenirs,
  unassignedSouvenirs,
} from "./souvenirs";
import { getVariantInducements } from "./variantState";

const POTIONS: readonly PotionInducement[] = [
  Inducement.MAGIC_POTION,
  Inducement.LESSER_MAGIC_POTION,
  Inducement.SUPERIOR_MAGIC_POTION,
];

const POTION_CHOICE: Record<PotionInducement, InducementChoiceKind> = {
  [Inducement.MAGIC_POTION]: "magic-potion",
  [Inducement.LESSER_MAGIC_POTION]: "lesser-magic-potion",
  [Inducement.SUPERIOR_MAGIC_POTION]: "superior-magic-potion",
};

const STREET_PATIENTS: readonly PlayerStatus[] = [
  PlayerStatus.INJURED,
  PlayerStatus.KO,
  PlayerStatus.RESERVE,
];

const GUTTER_PATIENTS: ReadonlySet<PlayerStatus> = new Set([
  PlayerStatus.KO,
  PlayerStatus.RESERVE,
]);

function mayDrink(
  state: GameState,
  player: Player,
  kind: PotionInducement
): boolean {
  if (player.playerKind === "star" || isFrog(state, player.id)) return false;
  if (kind === Inducement.MAGIC_POTION)
    return (
      STREET_PATIENTS.includes(player.status) &&
      !hasSkill(player.skills, SkillType.REGENERATION)
    );
  return (
    GUTTER_PATIENTS.has(player.status) &&
    !getVariantInducements(state).dosedPlayerIds.includes(player.id)
  );
}

function potionPatients(
  state: GameState,
  team: Team,
  kind: PotionInducement
): Player[] {
  const order = (player: Player) => STREET_PATIENTS.indexOf(player.status);
  return team.players
    .filter((player) => mayDrink(state, player, kind))
    .toSorted((a, b) => order(a) - order(b));
}

function choiceAnswer(answer: DecisionAnswer): InducementChoiceDecisionAnswer {
  return {
    ...("playerId" in answer && typeof answer.playerId === "string" && { playerId: answer.playerId }),
    ...("skill" in answer && typeof answer.skill === "string" && { skill: answer.skill }),
  };
}

export async function chooseForInducement(
  context: FlowContext,
  request: Omit<InducementChoiceDecisionRequest, "type">
): Promise<InducementChoiceDecisionAnswer> {
  return choiceAnswer(
    await context.gameService
      .getDecisionService()
      .request({ type: "inducement-choice", ...request })
  );
}

async function offerPotions(
  context: FlowContext,
  team: Team,
  kind: PotionInducement
): Promise<void> {
  const state = context.gameService.getState();
  const drank = new Set<string>();
  while (inducementUsesLeft(state, team.id, kind) > 0) {
    const options = potionPatients(state, team, kind).filter(
      (player) => !drank.has(player.id)
    );
    if (options.length === 0) return;
    const answer = await chooseForInducement(context, {
      kind: POTION_CHOICE[kind],
      chooserTeamId: team.id,
      playerIds: options.map((player) => player.id),
      optional: true,
    });
    const player = options.find((option) => option.id === answer.playerId);
    if (!player) {
      logPotion(context.eventBus, `${team.name} keeps its ${kind} for later`);
      return;
    }
    if (!spendInducement(state, team.id, kind)) return;
    drank.add(player.id);
    if (kind !== Inducement.MAGIC_POTION)
      getVariantInducements(state).dosedPlayerIds.push(player.id);
    await drinkPotion(context, player, kind);
  }
}

const readyToPlay = (player: Player) =>
  player.status === PlayerStatus.RESERVE && player.playerKind !== "star";

async function offerSouvenirs(context: FlowContext, team: Team): Promise<void> {
  const state = context.gameService.getState();
  for (const held of unassignedSouvenirs(state, team.id)) {
    const options = team.players.filter((element) => readyToPlay(element));
    if (options.length === 0) return;
    const answer = await chooseForInducement(context, {
      kind: "souvenir",
      chooserTeamId: team.id,
      playerIds: options.map((player) => player.id),
      item: held.souvenir,
      optional: true,
    });
    const player = options.find((option) => option.id === answer.playerId);
    if (!player) return;
    assignSouvenir(state, held, player);
    logPotion(
      context.eventBus,
      `Souvenir: ${player.playerName} carries the ${held.souvenir}`
    );
  }
}

export function holdsDriveInducements(
  state: GameState,
  teams: readonly Team[]
): boolean {
  return teams.some(
    (team) =>
      POTIONS.some((kind) => inducementUsesLeft(state, team.id, kind) > 0) ||
      inducementCount(state, team.id, Inducement.SOUVENIR) > 0
  );
}

export class PreDriveInducementsOperation extends GameOperation {
  public readonly name = "PreDriveInducements";

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;
    const state = gameService.getState();
    const teams = gameService.getTeams();
    for (const held of rollSouvenirs(
      state,
      gameService.getDiceController(),
      teams
    )) {
      logPotion(
        eventBus,
        `Souvenir Shop: ${gameService.getTeam(held.teamId)?.name ?? held.teamId} buys ${held.souvenir}`
      );
    }
    for (const team of teams) {
      for (const kind of POTIONS) await offerPotions(context, team, kind);
      await offerSouvenirs(context, team);
    }
  }
}
