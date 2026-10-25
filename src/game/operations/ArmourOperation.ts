import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryOperation } from "./InjuryOperation.js";
import { CasualtyCause } from "../rules/plagueRidden";
import { effectiveAV } from "../kickoff/driveEffects";
import { Player } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  ArmourBreakContext,
} from "../skills";

/**
 * Fold the rules that act on an Armour Roll (Mighty Blow, Claws, Iron Hard
 * Skin, ...) over the given participants, in order, and announce what they
 * did. Blocks, falls and fouls go through here.
 */
export async function foldArmourRoll(
  context: Pick<FlowContext, "gameService" | "eventBus" | "flowManager">,
  participants: Player[],
  roll: Pick<
    ArmourBreakContext,
    "player" | "causedBy" | "cause" | "vacatedSquare" | "roll" | "armourModifier"
  >
): Promise<ArmourBreakContext> {
  const { gameService, eventBus, flowManager } = context;
  const ctx: ArmourBreakContext = {
    ...roll,
    injuryModifier: 0,
    broken:
      roll.roll >= effectiveAV(roll.player, gameService.getState()),
    decisions: gameService.getDecisionService(),
    flow: flowManager,
    arbiter: gameService.getRerollArbiter(),
    dice: gameService.getDiceController(),
    triggers: [],
  };
  await foldTrigger("onArmourBreak", participants, ctx);
  placeMightyBlow(ctx, effectiveAV(roll.player, gameService.getState()));
  ctx.triggers.forEach((t) => eventBus.emit(GameEventNames.SkillTriggered, t));
  return ctx;
}

/**
 * Mighty Blow "may be applied after the roll has been made": once every
 * rule has folded, the +N breaks armour if it can (and Iron Hard Skin has
 * not locked out modifiers), otherwise it goes to the Injury Roll.
 */
function placeMightyBlow(ctx: ArmourBreakContext, av: number): void {
  const blow = ctx.mightyBlow;
  if (!blow) return;
  const wouldFlip =
    !ctx.forcedBreak &&
    ctx.roll + ctx.armourModifier < av &&
    ctx.roll + ctx.armourModifier + blow.bonus >= av;
  const onArmour = wouldFlip && !ctx.modifiersLocked;
  if (wouldFlip && ctx.modifiersLocked) {
    ctx.triggers.push({
      playerId: ctx.player.id,
      skill: SkillType.IRON_HARD_SKIN,
      effect: "Iron Hard Skin: armour roll modifiers cancelled",
    });
  }
  if (onArmour) ctx.armourModifier += blow.bonus;
  else ctx.injuryModifier += blow.bonus;
  ctx.triggers.push({
    playerId: blow.playerId,
    skill: SkillType.MIGHTY_BLOW,
    effect: onArmour
      ? `Mighty Blow: +${blow.bonus} to the armour roll`
      : `Mighty Blow: +${blow.bonus} saved for the injury roll`,
  });
}

/** Whether a natural Armour Roll breaks armour once the fold has run. */
export function armourBroken(
  ctx: ArmourBreakContext,
  roll: number,
  gameService: IGameService
): boolean {
  return (
    !!ctx.forcedBreak ||
    roll + ctx.armourModifier >= effectiveAV(ctx.player, gameService.getState())
  );
}

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
     * What inflicted the knockdown — read by the armour rules (Mighty Blow
     * and Claws need a Block) and carried through to the Casualty Roll for
     * Plague Ridden. Blocks are the default; a non-block causer passes its
     * own cause (Breathe Fire "special", Animal Savagery "lash-out").
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
    const opponents = gameService.getOpponents(player.teamId);
    // Standing opponents adjacent to the fallen player, plus — for a failed
    // Dodge — those adjacent to the square they were leaving (Arm Bar).
    const nearby = [
      ...(player.gridPosition ? adjacentStanding(player.gridPosition, opponents) : []),
      ...(this.fall ? adjacentStanding(this.fall.vacatedSquare, opponents) : []),
    ];
    const ctx = await foldArmourRoll(
      context,
      gatherParticipants(
        causedBy ?? player,
        causedBy ? player : undefined,
        nearby
      ),
      {
        player,
        causedBy,
        cause: this.fall?.cause ?? this.cause,
        vacatedSquare: this.fall?.vacatedSquare,
        roll,
        armourModifier: 0,
      }
    );
    const isBroken = armourBroken(ctx, roll, gameService);

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
