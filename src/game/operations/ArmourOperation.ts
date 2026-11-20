import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import type { GameEventMap } from "../../services/EventBus";
import { type IGameService } from "../../services/interfaces/IGameService.js";
import { InjuryOperation } from "./InjuryOperation.js";
import { type CasualtyCause } from "../rules/plagueRidden";
import { effectiveAV } from "../kickoff/driveEffects";
import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import {
  foldTrigger,
  gatherParticipants,
  adjacentStanding,
  type ArmourBreakContext,
} from "../skills";
import {
  type InjuryParties,
  InjuryPartiesOperation,
} from "./injuryParties";
import { activeRules } from "../variants/activeMatch";
import {
  surfaceArmourModifier,
  surfaceStacksWith,
} from "../rules/surfaceArmour";

export type ArmourFall =
  | { cause: "dodge"; vacatedSquare: { x: number; y: number } }
  | { cause: "rush" }
  | { cause: "barricade" };

export async function foldArmourRoll(
  context: Pick<FlowContext, "gameService" | "eventBus" | "flowManager">,
  participants: Player[],
  roll: Pick<
    ArmourBreakContext,
    | "player"
    | "causedBy"
    | "cause"
    | "vacatedSquare"
    | "knockedDown"
    | "roll"
    | "armourModifier"
  > & { surfaceModifier?: number },
  armourSkipped = false
): Promise<ArmourBreakContext> {
  const { gameService, eventBus, flowManager } = context;
  const { surfaceModifier = 0, ...armourRoll } = roll;
  const ctx: ArmourBreakContext = {
    ...armourRoll,
    injuryModifier: 0,
    broken: roll.roll >= effectiveAV(roll.player, gameService.getState()),
    decisions: gameService.getDecisionService(),
    flow: flowManager,
    arbiter: gameService.getRerollArbiter(),
    dice: gameService.getDiceController(),
    triggers: [],
  };
  await foldTrigger("onArmourBreak", participants, ctx);
  if (surfaceStacksWith(ctx.triggers)) ctx.armourModifier += surfaceModifier;
  placeMightyBlow(
    ctx,
    effectiveAV(roll.player, gameService.getState()),
    armourSkipped
  );
  ctx.triggers.forEach((t) => {
    eventBus.emit(GameEventNames.SkillTriggered, t);
  });
  return ctx;
}

function placeMightyBlow(
  ctx: ArmourBreakContext,
  av: number,
  armourSkipped: boolean
): void {
  const blow = ctx.mightyBlow;
  if (!blow) return;
  const wouldFlip =
    !armourSkipped &&
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
      ? `Mighty Blow: +${String(blow.bonus)} to the armour roll`
      : `Mighty Blow: +${String(blow.bonus)} saved for the injury roll`,
  });
}

export function announceArmour(
  eventBus: FlowContext["eventBus"],
  outcome: GameEventMap[typeof GameEventNames.ArmorRolled]
): void {
  eventBus.emit(GameEventNames.ArmorRolled, outcome);
}

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

export class ArmourOperation extends InjuryPartiesOperation {
  public readonly name = "ArmourOperation";

  private fall: ArmourFall | undefined;
  private cause: CasualtyCause;
  private armourModifier: number;
  constructor(
    playerId: string,

    causedById?: string,

    fall?: ArmourFall,

    cause: CasualtyCause = "block",

    armourModifier = 0
  ) {
    super(playerId, causedById);
    this.fall = fall;
    this.cause = cause;
    this.armourModifier = armourModifier;
  }

  protected async resolve(
    context: FlowContext,
    { player, causedBy }: InjuryParties
  ): Promise<void> {
    const { gameService, eventBus } = context;

    const armourSkipped = hasSkill(player.skills, SkillType.BALL_AND_CHAIN);
    if (!armourSkipped) {
      eventBus.emit(
        GameEventNames.UI_Notification,
        `Armour Roll for ${player.playerName} (AV ${String(player.stats.AV)}+)`
      );
    }

    const roll = armourSkipped
      ? 0
      : gameService
          .getDiceController()
          .roll2D6(`Armour Roll (${player.playerName})`, player.teamId);

    const opponents = gameService.getOpponents(player.teamId);

    const nearby = this.nearbyOpponents(player, opponents);
    const ctx = await foldArmourRoll(
      context,
      gatherParticipants(
        causedBy ?? player,
        causedBy ? player : undefined,
        nearby
      ),
      {
        player,
        ...(causedBy === undefined ? {} : { causedBy: causedBy }),
        cause: this.casualtyCause(),
        ...(this.fall?.cause === "dodge"
          ? { vacatedSquare: this.fall.vacatedSquare }
          : {}),
        knockedDown: true,
        roll,
        armourModifier: this.armourModifier,
        surfaceModifier: surfaceArmourModifier(
          activeRules().armour,
          this.fall ? "failed-dodge-or-rush" : "knocked-down"
        ),
      },
      armourSkipped
    );
    const isBroken = armourSkipped || armourBroken(ctx, roll, gameService);
    if (!armourSkipped) {
      announceArmour(eventBus, {
        playerId: player.id,
        roll: roll + ctx.armourModifier,
        armor: effectiveAV(player, gameService.getState()),
        broken: isBroken,
        rollType: `Armour Roll (${player.playerName})`,
        diceTeamId: player.teamId,
      });
    }

    this.resolveBreak(context, isBroken, armourSkipped, ctx.injuryModifier);
  }

  private casualtyCause(): CasualtyCause {
    return this.fall?.cause === "dodge" ? "dodge" : this.cause;
  }

  private nearbyOpponents(player: Player, opponents: Player[]): Player[] {
    return [
      ...(player.gridPosition
        ? adjacentStanding(player.gridPosition, opponents)
        : []),
      ...(this.fall?.cause === "dodge"
        ? adjacentStanding(this.fall.vacatedSquare, opponents)
        : []),
    ];
  }

  private resolveBreak(
    context: FlowContext,
    isBroken: boolean,
    armourSkipped: boolean,
    injuryModifier: number
  ): void {
    const { eventBus, flowManager } = context;
    if (isBroken) {
      if (!armourSkipped) {
        eventBus.emit(GameEventNames.UI_Notification, "ARMOUR BROKEN!");
      }

      flowManager.add(
        new InjuryOperation(this.playerId, {
          modifier: injuryModifier,
          ...(this.causedById !== undefined
            ? { causedById: this.causedById }
            : {}),
          cause: this.casualtyCause(),
          stunnedIsKnockedOut: armourSkipped,
        }),
        true
      );
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }
  }
}
