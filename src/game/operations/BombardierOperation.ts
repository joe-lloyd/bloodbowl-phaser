import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type IGameService } from "../../services/interfaces/IGameService";
import { PlayerStatus, type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type FlowContext } from "../core/GameFlowManager";
import { clampToPitch } from "../rules/pitchBounds";
import { ArmourOperation } from "./ArmourOperation";
import { FinishActivationOperation } from "./FinishActivationOperation";
import { bounceIfBallUnder, knockDownPlayer } from "./knockDown";
import { chooseInterceptor } from "./interceptionChoice";
import { catchRoll } from "./CatchOperation";
import { weatherEffects } from "../rules/weather";

export class BombardierOperation extends GameOperation {
  public readonly name = "BombardierOperation";

  private static readonly MAX_RETHROWS = 5;

  private throwerId: string;
  private targetX: number;
  private targetY: number;
  constructor(throwerId: string, targetX: number, targetY: number) {
    super();
    this.throwerId = throwerId;
    this.targetX = targetX;
    this.targetY = targetY;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;

    const thrower = gameService.getPlayerById(this.throwerId);
    if (!thrower?.gridPosition) return;
    if (thrower.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        "The Bomber must be Standing!"
      );
      return;
    }
    if (!hasSkill(thrower.skills, SkillType.BOMBARDIER)) return;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `${thrower.playerName} lobs a bomb!`
    );
    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: thrower.id,
      skill: SkillType.BOMBARDIER,
      effect: "Throw Bomb Special Action",
    });

    await this.resolveThrow(
      context,
      this.throwerId,
      { x: this.targetX, y: this.targetY },
      0
    );

    context.flowManager.add(new FinishActivationOperation("FinishBomb", this.throwerId));
  }

  private async resolveThrow(
    context: FlowContext,
    throwerId: string,
    target: { x: number; y: number },
    depth: number
  ): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();

    const thrower = gameService.getPlayerById(throwerId);
    if (!thrower?.gridPosition) return;

    await context.delay(600);

    const opponents = gameService.getOpponents(thrower.teamId);
    const marking = catchController.countMarkingOpponents(
      thrower.gridPosition,
      opponents
    );
    const range = passController.measureRange(thrower.gridPosition, target);
    const test = passController.testAccuracy(
      { player: thrower,passRange: range,markingOpponents: marking,extraModifier: weatherEffects(gameService.getState().weather).passingAbility }    );

    if (test.fumbled) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Fumble! The bomb goes off in ${thrower.playerName}'s square!`
      );
      explodeBomb(context, { ...thrower.gridPosition });
      gameService.triggerTurnover("Fumbled Bomb");
      return;
    }

    const interceptorId = await this.resolveInterception(
      context,
      thrower,
      target,
      test.accurate
    );
    if (interceptorId) {
      const caughtAt = gameService.getPlayerById(interceptorId)?.gridPosition;
      if (caughtAt) {
        eventBus.emit(GameEventNames.BombThrown, {
          playerId: thrower.id,
          from: { ...thrower.gridPosition },
          to: { ...caughtAt },
        });
        await context.delay(600);
      }
      await this.rethrow(context, interceptorId, depth);
      return;
    }

    let landing = test.accurate
      ? { ...target }
      : this.scatterFrom(gameService, target);
    landing = clampToPitch(landing);
    eventBus.emit(
      GameEventNames.UI_Notification,
      test.accurate ? "The bomb is on target!" : "The bomb scatters!"
    );

    eventBus.emit(GameEventNames.BombThrown, {
      playerId: thrower.id,
      from: { ...thrower.gridPosition },
      to: { ...landing },
    });

    await context.delay(600);

    const occupant = gameService.getPlayerAt(landing.x, landing.y);
    if (occupant) {
      const caught = await catchRoll(context, occupant, {
        origin: "pass",
        isPassTarget: test.accurate,
      });
      if (caught) {
        eventBus.emit(
          GameEventNames.UI_Notification,
          `${occupant.playerName} catches the bomb — and must throw it again!`
        );
        await this.rethrow(context, occupant.id, depth);
        return;
      }

      eventBus.emit(
        GameEventNames.UI_Notification,
        `${occupant.playerName} drops the bomb — it explodes!`
      );
      explodeBomb(context, landing);
      return;
    }

    explodeBomb(context, landing);
  }

  private async rethrow(
    context: FlowContext,
    newThrowerId: string,
    depth: number
  ): Promise<void> {
    const gameService = context.gameService;
    const newThrower = gameService.getPlayerById(newThrowerId);
    if (!newThrower?.gridPosition) return;

    if (depth + 1 >= BombardierOperation.MAX_RETHROWS) {
      context.eventBus.emit(
        GameEventNames.UI_Notification,
        "The bomb is dropped and explodes!"
      );
      explodeBomb(context, { ...newThrower.gridPosition });
      return;
    }

    await this.resolveThrow(
      context,
      newThrowerId,
      this.autoRethrowTarget(gameService, newThrower),
      depth + 1
    );
  }

  private autoRethrowTarget(
    gameService: IGameService,
    thrower: Player
  ): { x: number; y: number } {
    const here = thrower.gridPosition!;
    const enemies = gameService
      .getOpponents(thrower.teamId)
      .filter((e) => !!e.gridPosition);
    let best: { x: number; y: number } | undefined;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = Math.max(
        Math.abs(e.gridPosition!.x - here.x),
        Math.abs(e.gridPosition!.y - here.y)
      );
      if (d < bestDist) {
        bestDist = d;
        best = { ...e.gridPosition! };
      }
    }
    return best ?? { ...here };
  }

  private scatterFrom(
    gameService: IGameService,
    target: { x: number; y: number }
  ): { x: number; y: number } {
    const path = gameService.getBallMovementController().scatter(target);
    return path[path.length - 1] ?? { ...target };
  }

  private async resolveInterception(
    context: FlowContext,
    thrower: Player,
    target: { x: number; y: number },
    accurate: boolean
  ): Promise<string | undefined> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    if (!thrower.gridPosition) return undefined;

    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();
    const opponents = gameService.getOpponents(thrower.teamId);

    const eligible = passController.checkInterceptions(
      { from: thrower.gridPosition,target,opponents,isAccurate: accurate }    );
    if (eligible.length === 0) return undefined;

    const passingTeam = [thrower, ...gameService.getTeammates(thrower.id)];
    const candidates = eligible.map((e) => {
      const interceptor = gameService.getPlayerById(e.playerId)!;
      const marking = catchController.countMarkingOpponents(
        interceptor.gridPosition!,
        passingTeam
      );
      return {
        playerId: e.playerId,
        playerName: interceptor.playerName,
        base: e.modifier,
        marking,
        modifier: e.modifier - marking,
      };
    });

    const chosen = await chooseInterceptor(gameService, thrower.id, candidates);
    if (!chosen) return undefined;

    const interceptor = gameService.getPlayerById(chosen.playerId)!;
    const outcome = passController.attemptInterception(
      interceptor,
      chosen.base,
      chosen.marking
    );
    if (!outcome.success) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${interceptor.playerName} fails to catch the bomb!`
      );
      return undefined;
    }
    eventBus.emit(
      GameEventNames.UI_Notification,
      `${interceptor.playerName} intercepts the bomb!`
    );
    return interceptor.id;
  }
}

function explodeBomb(
  context: FlowContext,
  square: { x: number; y: number }
): void {
  const gameService = context.gameService;
  const eventBus = context.eventBus;
  const dice = gameService.getDiceController();

  eventBus.emit(GameEventNames.UI_Notification, "BOOM! The bomb explodes!");

  eventBus.emit(GameEventNames.BombExploded, { x: square.x, y: square.y });

  const hits: Player[] = [];
  const direct = gameService.getPlayerAt(square.x, square.y);
  if (direct) hits.push(direct);

  const candidates = adjacentPlayers(gameService, square, direct?.id);
  for (const p of candidates) {
    const roll = dice.rollD6("Bomb Blast", p.teamId);
    if (roll >= 4) hits.push(p);
  }

  for (const player of hits) {
    if (player.status === PlayerStatus.ACTIVE) {
      knockDownPlayer(eventBus, player);
      bounceIfBallUnder(context, player);
    }

    context.flowManager.add(
      new ArmourOperation(player.id, undefined, undefined, "special"),
      true
    );
  }
}

function adjacentPlayers(
  gameService: IGameService,
  square: { x: number; y: number },
  excludeId?: string
): Player[] {
  const found: Player[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const p = gameService.getPlayerAt(square.x + dx, square.y + dy);
      if (p && p.id !== excludeId) found.push(p);
    }
  }
  return found;
}

export class BombBlastOperation extends GameOperation {
  public readonly name = "BombBlastOperation";

  private square: { x: number; y: number };
  constructor(square: { x: number; y: number }) {
    super();
    this.square = square;
  }

  execute(context: FlowContext): Promise<void> {
    explodeBomb(context, this.square);
    return Promise.resolve();
  }
}
