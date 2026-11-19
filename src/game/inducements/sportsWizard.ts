import { groundBall } from "@/game/rules/ballInTheAir";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { ArmourOperation } from "../operations/ArmourOperation";
import { BounceOperation } from "../operations/BounceOperation";
import { type Player, PlayerStatus } from "@/types/Player";
import { type Team } from "@/types/Team";
import { GameEventNames } from "@/types/events";
import {
  type InducementChoiceDecisionAnswer,
  type WizardSpell,
} from "@/types/decisions";
import {
  holdsSportsWizard,
  spendSportsWizard,
  turnIntoFrog,
} from "./matchInducements";

const SPELLS: WizardSpell[] = ["fireball", "zap"];

export class CastSportsWizardOperation extends GameOperation {
  public readonly name = "CastSportsWizard";

  private teamId: string;
  constructor(teamId: string) {
    super();
    this.teamId = teamId;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService } = context;
    const state = gameService.getState();
    const team = gameService.getTeam(this.teamId);
    if (!team || !holdsSportsWizard(state, team.id)) return;
    const onPitch = gameService
      .getTeams()
      .flatMap((t) => t.players)
      .filter((p) => p.gridPosition);
    const answer = (await gameService.getDecisionService().request({
      type: "inducement-choice",
      kind: "sports-wizard",
      chooserTeamId: team.id,
      playerIds: onPitch.map((p) => p.id),
      spells: SPELLS,
      optional: true,
    })) as InducementChoiceDecisionAnswer;
    if (answer.spell === "fireball" && answer.square) {
      spendSportsWizard(state, team.id);
      fireball(context, team, answer.square, onPitch);
    } else if (answer.spell === "zap") {
      const target = onPitch.find((p) => p.id === answer.playerId);
      if (!target) return;
      spendSportsWizard(state, team.id);
      zap(context, team, target);
    }
  }
}

function fireball(
  context: FlowContext,
  team: Team,
  square: { x: number; y: number },
  onPitch: Player[]
): void {
  const { gameService, eventBus, flowManager } = context;
  const dice = gameService.getDiceController();
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `Sports-Wizard (${team.name}): Fireball at (${String(square.x)},${String(square.y)})`
  );
  eventBus.emit(GameEventNames.BombExploded, square);
  const inBlast = onPitch.filter(
    (p) =>
      Math.max(
        Math.abs(p.gridPosition!.x - square.x),
        Math.abs(p.gridPosition!.y - square.y)
      ) <= 1
  );
  const hits = inBlast.filter(
    (p) => dice.rollD6(`Fireball (${p.playerName})`, team.id) >= 4
  );
  const ball = groundBall(gameService.getState());
  const operations: GameOperation[] = [];
  let dropped = false;
  for (const player of hits) {
    if (player.status === PlayerStatus.ACTIVE) {
      player.status = PlayerStatus.PRONE;
      eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: player.id });
      eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      dropped ||=
        ball?.x === player.gridPosition!.x && ball.y === player.gridPosition!.y;
    }
    operations.push(
      new ArmourOperation(player.id, undefined, undefined, "special", 1)
    );
  }

  if (dropped) operations.push(new BounceOperation({ ...ball! }));

  for (const operation of operations.reverse()) {
    flowManager.add(operation, true);
  }
}

function zap(context: FlowContext, team: Team, target: Player): void {
  const { gameService, eventBus, flowManager } = context;
  const state = gameService.getState();
  const roll = gameService
    .getDiceController()
    .rollD6(`Zap! (${target.playerName})`, team.id);
  const turned = roll !== 1 && (roll === 6 || roll >= target.stats.ST);
  if (!turned) {
    eventBus.emit(
      GameEventNames.UI_GameLog,
      `Sports-Wizard (${team.name}): Zap! misses ${target.playerName}`
    );
    return;
  }
  turnIntoFrog(state, target);
  eventBus.emit(
    GameEventNames.UI_GameLog,
    `Sports-Wizard (${team.name}): ${target.playerName} is turned into a Frog`
  );
  eventBus.emit(GameEventNames.PlayerStatusChanged, target);
  const ball = groundBall(state);
  if (
    ball?.x === target.gridPosition?.x &&
    ball?.y === target.gridPosition?.y
  ) {
    flowManager.add(new BounceOperation({ ...ball! }), true);
  }
}
