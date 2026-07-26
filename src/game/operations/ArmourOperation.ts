import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryOperation } from "./InjuryOperation.js";
import { CasualtyCause } from "../rules/plagueRidden";
import { effectiveAV } from "../kickoff/driveEffects";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  ArmourBreakContext,
} from "../skills";

/**
 * ArmourOperation
 *
 * Responsibility:
 * - Execute Armour Roll (2D6)
 * - Fold skill rules (Mighty Blow, Claws, Iron Hard Skin) — causer first,
 *   then the downed player, so defensive rules can cancel
 * - If broken, trigger InjuryOperation (carrying any injury modifier)
 */
export class ArmourOperation extends GameOperation {
  public readonly name = "ArmourOperation";

  constructor(
    private playerId: string,
    /** The blocker who knocked this player down (block-path armour only) */
    private causedById?: string,
    /**
     * How the player went down and, for a failed Dodge/Leap/Jump, the square
     * they were leaving — so Arm Bar markers of that square can react.
     */
    private fall?: { cause: "dodge"; vacatedSquare: { x: number; y: number } },
    /**
     * What inflicted the knockdown — carried through to the Casualty Roll for
     * Plague Ridden. Blocks are the default; a non-block causer (Breathe Fire,
     * a lash-out) passes "special" so it does not arm the trait.
     */
    private cause: CasualtyCause = "block"
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const flowManager = context.flowManager;

    const player = gameService.getPlayerById(this.playerId);
    if (!player) return;
    const causedBy = this.causedById
      ? gameService.getPlayerById(this.causedById)
      : undefined;

    eventBus.emit(
      GameEventNames.UI_Notification,
      `Armour Roll for ${player.playerName} (AV ${player.stats.AV}+)`
    );

    // Suspense delay
    await context.delay(800);

    // 1. Roll 2D6 via DiceController
    const roll = gameService
      .getDiceController()
      .roll2D6(`Armour Roll (${player.playerName})`);

    // 2. Trigger point: rules may modify the roll or force/cancel a break
    const ctx: ArmourBreakContext = {
      player,
      causedBy,
      cause: this.fall?.cause ?? (causedBy ? "block" : undefined),
      vacatedSquare: this.fall?.vacatedSquare,
      roll,
      armourModifier: 0,
      injuryModifier: 0,
      broken: roll >= effectiveAV(player, gameService.getState()),
      decisions: gameService.getDecisionService(),
      flow: flowManager,
      arbiter: gameService.getRerollArbiter(),
      dice: gameService.getDiceController(),
      triggers: [],
    };
    const opponents = gameService.getOpponents(player.teamId);
    // Standing opponents adjacent to the fallen player, plus — for a failed
    // Dodge — those adjacent to the square they were leaving (Arm Bar).
    const nearby = [
      ...(player.gridPosition ? adjacentStanding(player.gridPosition, opponents) : []),
      ...(this.fall ? adjacentStanding(this.fall.vacatedSquare, opponents) : []),
    ];
    await foldTrigger(
      "onArmourBreak",
      gatherParticipants(
        causedBy ?? player,
        causedBy ? player : undefined,
        nearby
      ),
      ctx
    );
    ctx.triggers.forEach((t) =>
      eventBus.emit(GameEventNames.SkillTriggered, t)
    );

    const isBroken =
      ctx.forcedBreak ||
      roll + ctx.armourModifier >= effectiveAV(player, gameService.getState());

    if (isBroken) {
      eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      await context.delay(600);

      // 3. Trigger Injury Operation (with any carried modifier). A failed
      // Dodge/Leap is not a Block Action, so it never arms Plague Ridden.
      flowManager.add(
        new InjuryOperation(this.playerId, {
          modifier: ctx.injuryModifier,
          causedById: this.causedById,
          cause: this.fall ? undefined : this.cause,
        }),
        true
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }
  }
}
