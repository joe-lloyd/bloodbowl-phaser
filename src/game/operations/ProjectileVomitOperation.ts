import { GameOperation } from "../core/GameOperation";
import { GameEventNames } from "../../types/events";
import { IGameService } from "../../services/interfaces/IGameService";
import { Player, PlayerStatus } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { FlowContext } from "../core/GameFlowManager";
import { effectiveAV } from "../kickoff/driveEffects";
import { InjuryOperation } from "./InjuryOperation";
import { BounceOperation } from "./BounceOperation";
import { foldArmourRoll } from "./ArmourOperation";
import { gatherParticipants } from "../skills";

/** Ends the vomiter's activation once everything has settled. */
class FinishVomitOperation extends GameOperation {
  public readonly name = "FinishProjectileVomit";

  constructor(private attackerId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.attackerId);
  }
}

/**
 * ProjectileVomitOperation (2025 rulebook p.133, Projectile Vomit trait)
 *
 * Against an adjacent Standing opposition player: roll a D6. On a 2+, an
 * UNMODIFIABLE Armour Roll against the target; if broken, an Injury Roll,
 * otherwise nothing. On a 1, the player covers themselves in acidic bile —
 * the same unmodifiable Armour Roll against THIS player (broken armour
 * knocks them down: an active-team Knocked Down is a turnover). May replace
 * the Block Action of a Blitz. The activation ends once resolved.
 */
export class ProjectileVomitOperation extends GameOperation {
  public readonly name = "ProjectileVomitOperation";

  constructor(
    private attackerId: string,
    private targetId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    const dice = gameService.getDiceController();

    const attacker = gameService.getPlayerById(this.attackerId);
    const target = gameService.getPlayerById(this.targetId);
    if (!attacker?.gridPosition || !target?.gridPosition) return;

    if (target.status !== PlayerStatus.ACTIVE) {
      eventBus.emit(GameEventNames.UI_Notification, "Target must be Standing!");
      return;
    }
    const dx = Math.abs(attacker.gridPosition.x - target.gridPosition.x);
    const dy = Math.abs(attacker.gridPosition.y - target.gridPosition.y);
    if (dx > 1 || dy > 1 || dx + dy === 0) {
      eventBus.emit(GameEventNames.UI_Notification, "Target must be adjacent!");
      return;
    }

    eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: attacker.id,
      skill: SkillType.PROJECTILE_VOMIT,
      effect: `Projectile Vomit: aimed at ${target.playerName}`,
    });
    await context.delay(600);

    const aim = dice.rollSkillCheck(
      "Projectile Vomit",
      2,
      0,
      attacker.playerName,
      attacker.teamId
    );
    const victim = aim.success ? target : attacker;
    const selfHit = victim.id === attacker.id;
    eventBus.emit(
      GameEventNames.UI_Notification,
      selfHit
        ? `${attacker.playerName} is covered in acidic bile!`
        : `${target.playerName} is drenched!`
    );

    const armour = dice.rollArmorCheck(
      effectiveAV(victim, gameService.getState()),
      victim.playerName,
      attacker.teamId
    );
    // Unmodifiable: the fold runs, but only the natural roll vs AV counts.
    const causedBy = selfHit ? undefined : attacker;
    const armourCtx = await foldArmourRoll(
      context,
      gatherParticipants(causedBy ?? victim, causedBy ? victim : undefined, []),
      {
        player: victim,
        causedBy,
        cause: "special",
        roll: armour.roll,
        armourModifier: 0,
      }
    );
    if (armourCtx.broken) {
      this.knockDown(context, victim, causedBy, armourCtx.injuryModifier);
      if (selfHit) {
        gameService.triggerTurnover("Knocked Down by their own bile");
      }
    } else {
      eventBus.emit(GameEventNames.UI_Notification, "Armour Holds.");
    }

    context.flowManager.add(new FinishVomitOperation(this.attackerId));
  }

  private knockDown(
    context: FlowContext,
    victim: Player,
    causedBy: Player | undefined,
    injuryModifier: number
  ): void {
    const gameService = context.gameService as IGameService;
    const eventBus = context.eventBus;
    victim.status = PlayerStatus.PRONE;
    eventBus.emit(GameEventNames.PlayerKnockedDown, { playerId: victim.id });
    eventBus.emit(GameEventNames.PlayerStatusChanged, victim);
    const ball = gameService.getState().ballPosition;
    if (
      ball &&
      victim.gridPosition &&
      ball.x === victim.gridPosition.x &&
      ball.y === victim.gridPosition.y
    ) {
      context.flowManager.add(
        new BounceOperation({ ...victim.gridPosition }),
        true
      );
    }
    context.flowManager.add(
      new InjuryOperation(victim.id, {
        modifier: injuryModifier,
        ...(causedBy ? { causedById: causedBy.id, cause: "special" } : {}),
      }),
      true
    );
  }
}
