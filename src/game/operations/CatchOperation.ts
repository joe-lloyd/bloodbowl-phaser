import { souvenirModifier } from "../inducements/souvenirModifiers";
import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { type FlowContext } from "../core/GameFlowManager";
import { type Player, hasTackleZone } from "../../types/Player";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";
import { weatherEffects } from "../rules/weather";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  playersWithin,
  type CatchContext,
} from "../skills";

type CatchOrigin = "pass" | "handoff" | "throw-in" | "kick-off" | "bounce";

export async function catchRoll(
  context: FlowContext,
  player: Player,
  options: {
    origin?: CatchOrigin;
    isPassTarget?: boolean;
    divingCatch?: boolean;

    setPiece?: boolean;
  }
): Promise<boolean> {
  const { gameService, eventBus, flowManager } = context;
  if (!player.gridPosition || !hasTackleZone(player)) return false;

  const catchController = gameService.getCatchController();
  const opponents = gameService.getOpponents(player.teamId);
  const marking = catchController.countMarkingOpponents(
    player.gridPosition,
    opponents
  );

  const modifiers =
    catchController.calculateModifiers(
      { position: player.gridPosition,opponents,isBounce: options.origin==="bounce",isThrowIn: options.origin==="throw-in" }    ) + weatherEffects(gameService.getState().weather).ballHandling +
    souvenirModifier(gameService.getState(), player.id, "catch");

  const catchCtx: CatchContext = {
    player,
    marking,
    modifiers,
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.isPassTarget === undefined ? {} : { isPassTarget: options.isPassTarget }),
    ...(options.divingCatch === undefined ? {} : { divingCatch: options.divingCatch }),
    decisions: gameService.getDecisionService(),
    flow: flowManager,
    arbiter: gameService.getRerollArbiter(),
    triggers: [],
  };
  await foldTrigger(
    "onCatch",
    gatherParticipants(player, undefined, [
      ...adjacentStanding(player.gridPosition, opponents),

      ...playersWithin(player.gridPosition, opponents, 3),
    ]),
    catchCtx
  );
  catchCtx.triggers.forEach((t) => {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  });
  if (catchCtx.autoFail) return false;

  const agilityTest = new AgilityTestOperation(
    player.id,
    "Catch",
    options.setPiece ? 2 : player.stats.AG,
    options.setPiece ? 0 : catchCtx.modifiers,
    undefined,
    "catch"
  );
  await agilityTest.execute(context);
  return agilityTest.success;
}

export class CatchOperation extends GameOperation {
  public readonly name = "CatchOperation";

  private playerId: string;
  private options: {
    origin?: CatchOrigin;
    isPassTarget?: boolean;
    divingCatch?: boolean;
    landingPosition?: { x: number; y: number };

    kickoff?: boolean;
  };
  private pass: ({
    passerId: string;
    passerTeamId: string;
    accurate: boolean;

    setPiece?: boolean;
  }) | undefined;
  constructor(
    playerId: string,
    options: {
      origin?: CatchOrigin;
      isPassTarget?: boolean;
      divingCatch?: boolean;
      landingPosition?: { x: number; y: number };

      kickoff?: boolean;
    } = {},
    pass?: {
      passerId: string;
      passerTeamId: string;
      accurate: boolean;

      setPiece?: boolean;
    }
  ) {
    super();
    this.playerId = playerId;
    this.options = options;
    this.pass = pass;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const player = gameService.getPlayerById(this.playerId);
    if (!player?.gridPosition) return;

    if (!hasTackleZone(player)) {
      console.log(
        `[CatchOperation] Player ${player.playerName} has no Tackle Zone and cannot catch. Bouncing.`
      );
      flowManager.add(
        new BounceOperation(player.gridPosition, !!this.options.kickoff),
        true
      );
      return;
    }

    console.log(
      `[CatchOperation] Player ${player.playerName} attempting catch...`
    );
    const setPiece =
      !!this.pass?.setPiece && player.teamId === this.pass.passerTeamId;
    const success = await catchRoll(context, player, {
      ...this.options,
      setPiece,
    });

    if (success) {
      if (this.options.divingCatch && player.gridPosition) {
        gameService.setBallPosition(
          player.gridPosition.x,
          player.gridPosition.y
        );
      }

      eventBus.emit(GameEventNames.UI_Notification, "Catch Successful!");
      eventBus.emit(GameEventNames.CatchSucceeded, {
        playerId: player.id,
        position: { ...player.gridPosition },
      });
      if (
        this.pass?.accurate &&
        player.teamId === this.pass.passerTeamId &&
        player.id !== this.pass.passerId
      ) {
        eventBus.emit(GameEventNames.PassCompleted, {
          playerId: this.pass.passerId,
          catcherId: player.id,
          position: { ...player.gridPosition },
        });
      }

      gameService.checkForTouchdown(this.playerId);
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Catch Failed!");

      flowManager.add(
        new BounceOperation(
          this.options.landingPosition ?? player.gridPosition,
          !!this.options.kickoff
        ),
        true
      );
    }
  }
}
