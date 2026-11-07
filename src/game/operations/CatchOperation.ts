import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { FlowContext } from "../core/GameFlowManager";
import { Player, hasTackleZone } from "../../types/Player";
import { BounceOperation } from "./BounceOperation";
import { AgilityTestOperation } from "./AgilityTestOperation";
import { weatherEffects } from "../rules/weather";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  playersWithin,
  CatchContext,
} from "../skills";

type CatchOrigin = "pass" | "handoff" | "throw-in" | "kick-off" | "bounce";

/**
 * A player's attempt to Catch, a ball or a bomb (p.76). A Prone, Stunned or
 * Distracted player fails without a roll. Anyone else makes an Agility Test
 * with the marking, Bounce, Throw-in and weather modifiers, the skills that
 * act on a catch, and any re-roll. True when caught.
 */
export async function catchRoll(
  context: FlowContext,
  player: Player,
  options: {
    origin?: CatchOrigin;
    isPassTarget?: boolean;
    divingCatch?: boolean;
    /** Set Piece (L25): the receiver catches on any 2+. */
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
  // -1 for a ball that Bounced or was Thrown-in (p.76)
  const modifiers =
    catchController.calculateModifiers(
      player.gridPosition,
      opponents,
      options.origin === "bounce",
      options.origin === "throw-in"
    ) + weatherEffects(gameService.getState().weather).ballHandling;

  // Trigger point: rules may adjust the catch (Extra Arms, Nerves of
  // Steel) or auto-fail it (No Ball)
  const catchCtx: CatchContext = {
    player,
    marking,
    modifiers,
    origin: options.origin,
    isPassTarget: options.isPassTarget,
    divingCatch: options.divingCatch,
    decisions: gameService.getDecisionService(),
    flow: flowManager,
    arbiter: gameService.getRerollArbiter(),
    triggers: [],
  };
  await foldTrigger(
    "onCatch",
    gatherParticipants(player, undefined, [
      ...adjacentStanding(player.gridPosition, opponents),
      // Aura skills (Disturbing Presence) reach 3 squares, any status
      ...playersWithin(player.gridPosition, opponents, 3),
    ]),
    catchCtx
  );
  catchCtx.triggers.forEach((t) =>
    eventBus.emit(GameEventNames.SkillTriggered, t)
  );
  if (catchCtx.autoFail) return false;

  const agilityTest = new AgilityTestOperation(
    player.id,
    "Catch",
    options.setPiece ? 2 : player.stats.AG,
    options.setPiece ? 0 : catchCtx.modifiers,
    undefined,
    "catch" // failed catches may offer a reroll (Catch skill / team)
  );
  await agilityTest.execute(context);
  return agilityTest.success;
}

export class CatchOperation extends GameOperation {
  public readonly name = "CatchOperation";

  constructor(
    private playerId: string,
    private options: {
      origin?: CatchOrigin;
      isPassTarget?: boolean;
      divingCatch?: boolean;
      landingPosition?: { x: number; y: number };
      /** The ball is still the kick-off, so a bounce out of the receiving half is a Touchback. */
      kickoff?: boolean;
    } = {},
    private pass?: {
      passerId: string;
      passerTeamId: string;
      accurate: boolean;
      /** Set Piece (L25): the receiver catches on any 2+. */
      setPiece?: boolean;
    }
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus, flowManager } = context;

    const player = gameService.getPlayerById(this.playerId);
    if (!player || !player.gridPosition) return;

    // A Prone, Stunned or Distracted player "will automatically fail the
    // Agility Test and the ball will Bounce" (p.76).
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
      // CATCH SUCCESS (possession is positional: ball is on their square)
      eventBus.emit(GameEventNames.UI_Notification, "Catch Successful!");
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

      // Catching in the scoring end zone is an immediate touchdown
      gameService.checkForTouchdown(this.playerId);
    } else {
      // CATCH FAIL -> BOUNCE
      eventBus.emit(GameEventNames.UI_Notification, "Catch Failed!");

      // Bounce from this square
      flowManager.add(
        new BounceOperation(
          this.options.landingPosition ?? player.gridPosition,
          !!this.options.kickoff
        ),
        true
      );
      // A dropped pass or hand-off is judged once the ball is at rest, by
      // FinishPassActivationOperation: a team-mate may still catch it.
    }
  }
}
