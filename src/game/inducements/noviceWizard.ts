import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "../operations/ArmourOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { Inducement } from "@/types/Inducements";
import { type Player, PlayerStatus } from "@/types/Player";
import { GameEventNames } from "@/types/events";
import { type GameState } from "@/types/GameState";
import { inducementUsesLeft, spendInducement } from "./inventory";
import { turnIntoFrog } from "./matchInducements";
import { chooseForInducement } from "./driveInducements";
import { pickRandom } from "./drinkPotion";

const FIREBOLT = "Firebolt";
const TRANSMUTATION = "Transmutation";
const SPELLS = [FIREBOLT, TRANSMUTATION];
const SUCCESS = 3;

export function holdsNoviceWizard(state: GameState, teamId: string): boolean {
  return inducementUsesLeft(state, teamId, Inducement.NOVICE_WIZARD) > 0;
}

const onPitch = (player: Player) => !!player.gridPosition;

function distance(a: Player, b: Player): number {
  const from = a.gridPosition;
  const to = b.gridPosition;
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
}

function nearestTo(context: FlowContext, target: Player): Player | undefined {
  const others = context.gameService
    .getTeams()
    .flatMap((team) => team.players)
    .filter((player) => onPitch(player) && player.id !== target.id);
  const closest = Math.min(...others.map((player) => distance(player, target)));
  return pickRandom(
    context.gameService.getDiceController(),
    others.filter((player) => distance(player, target) === closest),
    { label: "Firebolt strays", teamId: target.teamId }
  );
}

function ballUnder(
  state: GameState,
  player: Player
): { x: number; y: number } | null {
  const ball = groundBall(state);
  const square = player.gridPosition;
  return ball?.x === square?.x && ball?.y === square?.y && ball
    ? { x: ball.x, y: ball.y }
    : null;
}

function knockDown(context: FlowContext, victim: Player): void {
  const { gameService, eventBus, flowManager } = context;
  const dropped = ballUnder(gameService.getState(), victim);
  if (victim.status === PlayerStatus.ACTIVE) {
    victim.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: victim.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, victim);
  }
  if (dropped) flowManager.add(new BounceOperation(dropped), true);
  flowManager.add(
    new ArmourOperation(victim.id, undefined, undefined, "special"),
    true
  );
}

function firebolt(context: FlowContext, target: Player, roll: number): void {
  const victim = roll >= SUCCESS ? target : nearestTo(context, target);
  context.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Novice Wizard: Firebolt (${String(roll)}) hits ${victim?.playerName ?? "nobody"}`
  );
  if (victim) knockDown(context, victim);
}

function transmute(context: FlowContext, target: Player, roll: number): void {
  const { gameService, eventBus, flowManager } = context;
  if (roll < SUCCESS) {
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Novice Wizard: Transmutation (${String(roll)}) fizzles`
    );
    return;
  }
  const state = gameService.getState();
  const dropped = ballUnder(state, target);
  turnIntoFrog(state, target, { drives: 2 });
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `Novice Wizard: ${target.playerName} is a Frog until the end of the next drive`
  );
  eventBus.emit(GameEventNames.PlayerStatusChanged, target);
  if (dropped) flowManager.add(new BounceOperation(dropped), true);
}

export class CastNoviceWizardOperation extends GameOperation {
  public readonly name = "CastNoviceWizard";

  private teamId: string;
  constructor(teamId: string) {
    super();
    this.teamId = teamId;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService } = context;
    const state = gameService.getState();
    if (!holdsNoviceWizard(state, this.teamId)) return;
    const targets = gameService.getOpponents(this.teamId).filter(onPitch);
    if (targets.length === 0) return;
    const answer = await chooseForInducement(context, {
      kind: "novice-wizard",
      chooserTeamId: this.teamId,
      playerIds: targets.map((player) => player.id),
      skills: SPELLS,
      optional: true,
    });
    const target = targets.find((player) => player.id === answer.playerId);
    if (!target || !SPELLS.includes(answer.skill ?? "")) return;
    if (!spendInducement(state, this.teamId, Inducement.NOVICE_WIZARD)) return;
    const roll = gameService
      .getDiceController()
      .rollD6(`Novice Wizard: ${answer.skill ?? ""}`, this.teamId);
    if (answer.skill === FIREBOLT) firebolt(context, target, roll);
    else transmute(context, target, roll);
  }
}
