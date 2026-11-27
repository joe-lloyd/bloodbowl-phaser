import { souvenirModifier } from "../inducements/souvenirModifiers";
import { GameOperation } from "../core/GameOperation";
import { GameConfig } from "../../config/GameConfig";
import type { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import { type IGameService } from "../../services/interfaces/IGameService";
import { chooseInterceptor } from "./interceptionChoice";
import { type Player, PlayerStatus, hasTackleZone } from "../../types/Player";
import { GamePhase } from "../../types/GameState";
import { BounceOperation } from "./BounceOperation";
import { CatchOperation } from "./CatchOperation";
import { lostBallHandling, passModifier } from "../kickoff/ballConditions";
import { interceptModifiers } from "../rules/rollPreview";
import { ArmourOperation } from "./ArmourOperation";
import { isOnPitch } from "../controllers/BallMovementController";
import { settleOffObstacle } from "../rules/ballFlight";
import { isWallSquare } from "../rules/pitchSquares";
import { ricochetDrop, ricochetPath } from "../rules/ricochetPass";
import { holdsMeasure, offerMeasure } from "../inducements/matchInducements";
import { DesperateMeasure } from "../inducements/desperateMeasures";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  playersWithin,
  type PassDeclaredContext,
  type PassResultContext,
  withRerollOffer,
} from "../skills";

export class FinishPassActivationOperation extends GameOperation {
  public readonly name = "FinishPassActivation";

  private passerId: string;
  private giveAndGoExempt: boolean;
  constructor(passerId: string, giveAndGoExempt: boolean) {
    super();
    this.passerId = passerId;
    this.giveAndGoExempt = giveAndGoExempt;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;
    const passer = gameService.getPlayerById(this.passerId);
    const ball = gameService.getState().ballPosition;
    const holder = ball ? gameService.getPlayerAt(ball.x, ball.y) : undefined;
    if (
      passer &&
      gameService.getState().phase === GamePhase.PLAY &&
      (holder?.teamId !== passer.teamId ||
        holder.status !== PlayerStatus.ACTIVE)
    ) {
      gameService.triggerTurnover("Pass not caught");
    }
    if (gameService.isTurnoverInProgress()) {
      gameService.finishActivation(this.passerId);
      return;
    }
    if (gameService.getState().activePlayer?.id !== this.passerId) return;
    if (this.giveAndGoExempt) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: this.passerId,
        skill: SkillType.GIVE_AND_GO,
        effect: `Give and Go: ${passer?.playerName ?? "the player"} may continue moving`,
      });
      return;
    }
    gameService.finishActivation(this.passerId);
  }
}

interface Square {
  x: number;
  y: number;
}

const isAt = (player: Player, square: Square): boolean =>
  player.gridPosition?.x === square.x && player.gridPosition?.y === square.y;

const distance = (a: Square, b: Square): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function setPieceOffered(
  gameService: IGameService,
  passer: Player,
  hailMary: boolean
): boolean {
  return (
    !hailMary &&
    holdsMeasure(
      gameService.getState(),
      passer.teamId,
      DesperateMeasure.SET_PIECE
    )
  );
}

function scatterOf(
  passController: ReturnType<IGameService["getPassController"]>,
  target: Square,
  accurate: boolean
): { scatterPath: Square[] | undefined; landingPos: Square } {
  const scatterPath = accurate ? undefined : passController.scatterPass(target);
  return {
    scatterPath,
    landingPos: passController.settleLanding(
      scatterPath?.at(-1) ?? target
    ),
  };
}

const giveAndGoExempt = (passer: Player, passType: string): boolean =>
  hasSkill(passer.skills, SkillType.GIVE_AND_GO) && passType === "Quick Pass";

function safePass(context: FlowContext, passer: Player): void {
  const { gameService, eventBus } = context;
  eventBus.emit(GameEventNames.UI_Notification, "Safe Pass! Ball held.");
  if (passer.gridPosition) {
    gameService.setBallPosition(passer.gridPosition.x, passer.gridPosition.y);
  }
  gameService.finishActivation(passer.id);
}

function fumble(context: FlowContext, passer: Player): void {
  const { gameService, eventBus } = context;
  eventBus.emit(GameEventNames.UI_Notification, "FUMBLE!");

  if (passer.gridPosition) {
    gameService.setBallPosition(passer.gridPosition.x, passer.gridPosition.y);
    context.flowManager.add(new BounceOperation(passer.gridPosition), true);
  }
  gameService.triggerTurnover("Fumbled Pass");
}

function divingCatcherAt(
  players: Player[],
  landingPos: Square
): Player | undefined {
  return players
    .filter(
      (candidate) =>
        candidate.gridPosition &&
        hasTackleZone(candidate) &&
        hasSkill(candidate.skills, SkillType.DIVING_CATCH) &&
        distance(candidate.gridPosition, landingPos) === 1
    )
    .sort(
      (a, b) =>
        a.gridPosition!.y - b.gridPosition!.y ||
        a.gridPosition!.x - b.gridPosition!.x
    )[0];
}

function onTheBallReactors(
  gameService: IGameService,
  passer: Player
): Player[] {
  return gameService
    .getOpponents(passer.teamId)
    .filter(
      (player) =>
        !!player.gridPosition &&
        player.status === PlayerStatus.ACTIVE &&
        hasSkill(player.skills, SkillType.ON_THE_BALL)
    )
    .sort(
      (a, b) =>
        a.gridPosition!.y - b.gridPosition!.y ||
        a.gridPosition!.x - b.gridPosition!.x
    );
}

function occupiedSquares(
  gameService: IGameService,
  players: Player[],
  mover: Player
): Set<string> {
  const occupied = new Set<string>();
  for (const { teamId } of players) {
    const teamPlayers = gameService.getTeam(teamId)?.players ?? [];
    for (const player of teamPlayers) {
      if (player.id !== mover.id && player.gridPosition) {
        occupied.add(
          `${String(player.gridPosition.x)},${String(player.gridPosition.y)}`
        );
      }
    }
  }
  return occupied;
}

const isFreeOnPitch = (square: Square, occupied: Set<string>): boolean =>
  square.x >= 0 &&
  square.x < GameConfig.PITCH_WIDTH &&
  square.y >= 0 &&
  square.y < GameConfig.PITCH_HEIGHT &&
  !occupied.has(`${String(square.x)},${String(square.y)}`);

function onTheBallStep(
  gameService: IGameService,
  passer: Player,
  reactor: Player,
  from: Square,
  target: Square
): Square | undefined {
  const occupied = occupiedSquares(gameService, [passer, reactor], reactor);
  const candidates: Square[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const square = { x: from.x + dx, y: from.y + dy };
      if ((dx !== 0 || dy !== 0) && isFreeOnPitch(square, occupied)) {
        candidates.push(square);
      }
    }
  }
  candidates.sort(
    (a, b) =>
      distance(a, target) - distance(b, target) || a.y - b.y || a.x - b.x
  );
  return candidates[0];
}

function dodgeMarkers(
  gameService: IGameService,
  reactor: Player,
  from: Square,
  to: Square
): number | null {
  const opposition = gameService
    .getOpponents(reactor.teamId)
    .filter((player) => !!player.gridPosition && hasTackleZone(player));
  const leavesTackleZone = opposition.some(
    (marker) => distance(marker.gridPosition!, from) === 1
  );
  if (!leavesTackleZone) return null;
  return opposition.filter((marker) => distance(marker.gridPosition!, to) === 1)
    .length;
}

function onTheBallDodge(
  context: FlowContext,
  reactor: Player,
  destinationMarkers: number
): ReturnType<typeof withRerollOffer> {
  const { gameService, eventBus } = context;
  return withRerollOffer({ gameService, eventBus }, reactor, "dodge", () =>
    gameService
      .getDiceController()
      .rollSkillCheck(
        { reason: "Dodge",target: reactor.stats.AG,modifier: -destinationMarkers,playerName: reactor.playerName }      )
  );
}

function fallOnTheBall(
  context: FlowContext,
  reactor: Player,
  from: Square,
  to: Square
): void {
  const { eventBus } = context;
  reactor.gridPosition = { ...to };
  reactor.status = PlayerStatus.PRONE;
  eventBus.emit(GameEventNames.PlayerMoved, {
    playerId: reactor.id,
    from,
    to: { ...to },
    path: [from, { ...to }],
    ballJoinStep: 0,
  });
  eventBus.emit(GameEventNames.PlayerKnockedDown, {
    playerId: reactor.id,
  });
  eventBus.emit(GameEventNames.PlayerStatusChanged, reactor);
  context.flowManager.add(new ArmourOperation(reactor.id), true);
}

export class PassOperation extends GameOperation {
  public readonly name = "PassOperation";

  private passerId: string;
  private targetX: number;
  private targetY: number;
  private hailMary: boolean;
  constructor(
    passerId: string,
    targetX: number,
    targetY: number,
    hailMary = false
  ) {
    super();
    this.passerId = passerId;
    this.targetX = targetX;
    this.targetY = targetY;
    this.hailMary = hailMary;
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService;
    const eventBus = context.eventBus;

    const passer = gameService.getPlayerById(this.passerId);
    if (!passer?.gridPosition) return;

    gameService.commitAction(this.passerId);

    console.log(
      `[PassOperation] Executing pass from ${passer.id} to ${String(this.targetX)},${String(this.targetY)}`
    );

    const passController = gameService.getPassController();
    const catchController = gameService.getCatchController();

    const opponents = gameService.getOpponents(passer.teamId);

    const markingOpponents = catchController.countMarkingOpponents(
      passer.gridPosition,
      opponents
    );

    const passRange = passController.measureRange(
      passer.gridPosition,
      { x: this.targetX, y: this.targetY },
      this.hailMary
    );
    const targetPlayer = gameService
      .getTeammates(this.passerId)
      .find((p) => isAt(p, { x: this.targetX, y: this.targetY }));

    await this.resolveOnTheBall(gameService, eventBus, context, passer, {
      x: this.targetX,
      y: this.targetY,
    });

    const passCtx: PassDeclaredContext = {
      player: passer,
      passType: passRange.type,
      hailMary: this.hailMary,
      ...(targetPlayer !== undefined && { targetPlayer: targetPlayer }),
      marking: markingOpponents,
      modifiers:
        passModifier(gameService.getState(), passRange.type) +
        souvenirModifier(gameService.getState(), passer.id, "pass"),
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    await foldTrigger(
      "onPassDeclared",
      gatherParticipants(passer, undefined, [
        ...adjacentStanding(passer.gridPosition, opponents),

        ...playersWithin(passer.gridPosition, opponents, 3),
      ]),
      passCtx
    );
    for (const t of passCtx.triggers) {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    }

    if (passCtx.refused) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `${passer.playerName} refuses to throw to that team-mate!`
      );
      gameService.finishActivation(this.passerId);
      return;
    }

    const isSetPiece =
      setPieceOffered(gameService, passer, this.hailMary) &&
      (await offerMeasure(
        context,
        passer.teamId,
        passer.id,
        DesperateMeasure.SET_PIECE,
        `Use Set Piece? ${passer.playerName}'s Pass is Accurate on a 2+ and caught on a 2+.`
      ));

    const result = await passController.attemptPass(
      { player: passer,from: passer.gridPosition,to: { x: this.targetX,y: this.targetY },markingOpponents,rerollDeps: { gameService,eventBus },extraModifier: passCtx.modifiers,hailMary: this.hailMary,setPiece: isSetPiece }    );

    const resultCtx: PassResultContext = {
      player: passer,
      roll: result.roll,
      fumbled: result.fumbled,
      accurate: result.accurate,
      decisions: gameService.getDecisionService(),
      flow: context.flowManager,
      arbiter: gameService.getRerollArbiter(),
      triggers: [],
    };
    await foldTrigger("onPassResult", [passer], resultCtx);
    for (const t of resultCtx.triggers) {
      eventBus.emit(GameEventNames.SkillTriggered, t);
    }

    const from = { ...passer.gridPosition };
    const target = { x: this.targetX, y: this.targetY };

    const fly = async (
      finalPosition: { x: number; y: number },
      scatterPath?: { x: number; y: number }[]
    ) => {
      eventBus.emit(GameEventNames.PassAttempted, {
        playerId: this.passerId,
        from,
        to: target,
        passType: result.passType,
        accurate: result.accurate,
        finalPosition,
        ...(scatterPath && { scatterPath }),
      });
      await context.delay(1500);
    };

    if (result.fumbled) await fly(from);
    if (result.fumbled && resultCtx.keepBall) {
      safePass(context, passer);
      return;
    }
    if (result.fumbled) {
      fumble(context, passer);
    } else {
      const interceptor = passCtx.suppressInterception
        ? undefined
        : await this.resolveInterception(
            gameService,
            eventBus,
            passer,
            target,
            result.accurate,
            passCtx.cloudBurster ?? false
          );
      if (interceptor?.gridPosition) {
        const at = { ...interceptor.gridPosition };
        await fly(at);
        gameService.setBallPosition(at.x, at.y);
        eventBus.emit(GameEventNames.PassIntercepted, {
          passerId: passer.id,
          interceptorId: interceptor.id,
          position: at,
        });
        eventBus.emit(
          GameEventNames.UI_Notification,
          `${interceptor.playerName} intercepts the pass!`
        );
        gameService.triggerTurnover("Intercepted");
        return;
      }

      if (isWallSquare(target)) {
        await this.ricochet(context, passer, {
          wall: target,
          accurate: result.accurate,
          fly,
        });
      } else {
        const { scatterPath, landingPos } = scatterOf(
          passController,
          target,
          result.accurate
        );
        await fly(landingPos, scatterPath);

        this.land(context, passer, landingPos, {
          scatterPath,
          accurate: result.accurate,
          setPiece: isSetPiece,
          opponents,
        });
      }
    }

    context.flowManager.add(
      new FinishPassActivationOperation(
        this.passerId,
        giveAndGoExempt(passer, result.passType)
      )
    );
  }

  private async ricochet(
    context: FlowContext,
    passer: Player,
    shot: {
      wall: Square;
      accurate: boolean;
      fly: (to: Square, path?: Square[]) => Promise<void>;
    }
  ): Promise<void> {
    const { gameService } = context;
    const dice = gameService.getDiceController();
    const from = passer.gridPosition ?? shot.wall;
    const flight = ricochetPath(dice, { ...shot, from });
    const { wall, path, last } = flight;
    await shot.fly(last, [wall, ...path]);
    if (await this.catchOnTheWay(context, passer, path)) return;
    const scattered = ricochetDrop(dice, flight);
    if (!isOnPitch(scattered)) {
      gameService.throwInBall(last, scattered);
      return;
    }
    this.land(context, passer, settleOffObstacle(dice, scattered), {
      scatterPath: undefined,
      accurate: false,
      setPiece: false,
      opponents: gameService.getOpponents(passer.teamId),
    });
  }

  private async catchOnTheWay(
    context: FlowContext,
    passer: Player,
    path: readonly Square[]
  ): Promise<boolean> {
    const { gameService } = context;
    const catcher = path
      .map((square) => gameService.getPlayerAt(square.x, square.y))
      .find((player) => !!player && hasTackleZone(player));
    if (!catcher?.gridPosition) return false;
    const { x, y } = catcher.gridPosition;
    gameService.setBallPosition(x, y);
    await context.flowManager.runToRest(
      new CatchOperation(
        catcher.id,
        { origin: "pass" },
        { passerId: passer.id, passerTeamId: passer.teamId, accurate: false }
      )
    );
    return true;
  }

  private land(
    context: FlowContext,
    passer: Player,
    landingPos: { x: number; y: number },
    flight: {
      scatterPath: { x: number; y: number }[] | undefined;
      accurate: boolean;
      setPiece: boolean;
      opponents: Player[];
    }
  ): void {
    const { gameService, eventBus } = context;
    const { scatterPath, accurate, setPiece, opponents } = flight;
    if (accurate) {
      eventBus.emit(GameEventNames.UI_Notification, "Accurate Pass!");
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Inaccurate Pass!");
    }

    if (isOnPitch(landingPos)) {
      gameService.setBallPosition(landingPos.x, landingPos.y);

      const playerAtLanding = gameService.getPlayerAt(
        landingPos.x,
        landingPos.y
      );

      if (playerAtLanding) {
        context.flowManager.add(
          new CatchOperation(
            playerAtLanding.id,
            {
              origin: "pass",
              isPassTarget:
                landingPos.x === this.targetX && landingPos.y === this.targetY,
            },
            {
              passerId: passer.id,
              passerTeamId: passer.teamId,
              accurate,
              setPiece,
            }
          ),
          true
        );
      } else {
        const divingCatcher = divingCatcherAt(
          [
            ...(gameService.getTeam(passer.teamId)?.players ?? []),
            ...opponents,
          ],
          landingPos
        );

        if (divingCatcher) {
          context.flowManager.add(
            new CatchOperation(divingCatcher.id, {
              origin: "pass",
              divingCatch: true,
              landingPosition: landingPos,
            }),
            true
          );
        } else {
          eventBus.emit(
            GameEventNames.UI_Notification,
            "Ball Lands in Empty Square"
          );
          context.flowManager.add(new BounceOperation(landingPos), true);
        }
      }
    } else {
      const path = scatterPath ?? [];
      const lastInBounds = path.at(-2);
      eventBus.emit(GameEventNames.UI_Notification, "Ball Out of Bounds!");
      if (!lastInBounds) throw new Error("Pass left the pitch without a path");
      gameService.throwInBall(lastInBounds, landingPos);
    }
  }

  private async resolveOnTheBall(
    gameService: IGameService,
    eventBus: import("../../services/EventBus").IEventBus,
    context: FlowContext,
    passer: import("../../types/Player").Player,
    target: { x: number; y: number }
  ): Promise<void> {
    for (const reactor of onTheBallReactors(gameService, passer)) {
      const answer = (await gameService.getDecisionService().request({
        type: "reaction",
        playerId: reactor.id,
        chooserTeamId: reactor.teamId,
        skill: SkillType.ON_THE_BALL,
        prompt: `${reactor.playerName} may move up to 3 squares before the pass — use On the Ball?`,
      })) as import("../../types/decisions").ReactionDecisionAnswer;
      if (!answer.accept || !reactor.gridPosition) continue;

      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: reactor.id,
        skill: SkillType.ON_THE_BALL,
        effect: "On the Ball: reacting move before the Passing Ability Test",
      });

      for (let stepNumber = 0; stepNumber < 3; stepNumber++) {
        const from = { ...reactor.gridPosition };
        const to = onTheBallStep(gameService, passer, reactor, from, target);
        if (!to) break;

        const markers = dodgeMarkers(gameService, reactor, from, to);
        if (await dodgeFails(context, reactor, markers)) {
          fallOnTheBall(context, reactor, from, to);
          return;
        }

        reactor.gridPosition = { ...to };
        eventBus.emit(GameEventNames.PlayerMoved, {
          playerId: reactor.id,
          from,
          to: { ...to },
          path: [from, { ...to }],
          ballJoinStep: 0,
        });
      }
    }
  }

  private async resolveInterception(
    gameService: IGameService,
    eventBus: import("../../services/EventBus").IEventBus,
    passer: import("@/types/Player").Player,
    target: { x: number; y: number },
    accurate: boolean,
    cloudBurster: boolean
  ): Promise<import("@/types/Player").Player | undefined> {
    if (!passer.gridPosition) return undefined;

    const passController = gameService.getPassController();
    const opponents = gameService.getOpponents(passer.teamId);

    let eligible = passController.checkInterceptions(
      { from: passer.gridPosition,target,opponents,isAccurate: accurate }    );

    if (cloudBurster) {
      eligible = eligible.filter((e) => {
        const p = gameService.getPlayerById(e.playerId);
        return !!p && hasSkill(p.skills, SkillType.VERY_LONG_LEGS);
      });
    }
    if (eligible.length === 0) return undefined;

    const passingTeam = [passer, ...gameService.getTeammates(passer.id)];
    const weather = gameService.getState().weather;
    const candidates = eligible.map((e) => {
      const interceptor = gameService.getPlayerById(e.playerId)!;

      const { base, marking, total } = interceptModifiers(
        interceptor,
        e.modifier,
        passingTeam,
        weather
      );
      if (hasSkill(interceptor.skills, SkillType.VERY_LONG_LEGS)) {
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: e.playerId,
          skill: SkillType.VERY_LONG_LEGS,
          effect:
            "Very Long Legs: +2 to the interception (ignores Cloud Burster)",
        });
      }
      const lostBall = lostBallHandling(gameService.getState());
      const souvenir = souvenirModifier(
        gameService.getState(),
        e.playerId,
        "intercept"
      );
      return {
        playerId: e.playerId,
        playerName: interceptor.playerName,
        base: base + lostBall,
        marking,
        modifier: total + lostBall + souvenir,
      };
    });

    const chosen = await chooseInterceptor(gameService, passer.id, candidates);
    if (!chosen) return undefined;

    const interceptor = gameService.getPlayerById(chosen.playerId)!;
    eventBus.emit(GameEventNames.InterceptionAttempted, {
      passerId: passer.id,
      interceptorId: interceptor.id,
      modifier: chosen.modifier,
    });

    const outcome = passController.attemptInterception(
      interceptor,
      chosen.base +
        souvenirModifier(gameService.getState(), interceptor.id, "intercept"),
      chosen.marking
    );

    if (!outcome.success) {
      eventBus.emit(GameEventNames.InterceptionFailed, {
        passerId: passer.id,
        interceptorId: interceptor.id,
        roll: outcome.roll,
      });
      return undefined;
    }
    return interceptor;
  }
}

async function dodgeFails(
  context: Parameters<typeof onTheBallDodge>[0],
  reactor: Parameters<typeof onTheBallDodge>[1],
  markers: Parameters<typeof onTheBallDodge>[2] | null
): Promise<boolean> {
  if (markers === null) return false;
  const dodge = await onTheBallDodge(context, reactor, markers);
  return !dodge.success;
}
