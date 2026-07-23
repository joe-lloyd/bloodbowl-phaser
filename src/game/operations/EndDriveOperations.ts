/**
 * End of Drive Sequence operations (rulebook p.83), queued in order by
 * GameService.endDrive:
 *
 *   1. ClearPitchOperation   - announce drive end, everyone to the dugouts
 *   2. KORecoveryOperation   - D6 per KO'd player, 4+ recovers to Reserves
 *   3. StartNextDriveOperation - setup for the next drive (no coin flip)
 *
 * Secret Weapons and End of Drive weather effects are ordering points only
 * for now; they gain behavior in later changes.
 */

import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SubPhase } from "../../types/GameState";
import { SkillType, hasSkill } from "../../types/Skills";
import { PlayerStatus } from "../../types/Player";

export class ClearPitchOperation extends GameOperation {
  public readonly name = "ClearPitch";

  constructor(
    private reason: "touchdown" | "halftime",
    private nextKickingTeamId: string
  ) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;

    eventBus.emit(GameEventNames.DriveEnded, {
      reason: this.reason,
      nextKickingTeamId: this.nextKickingTeamId,
    });

    const activeTeamId = gameService.getActiveTeamId();
    const activeTeam = activeTeamId
      ? gameService.getTeam(activeTeamId)
      : undefined;
    const players = activeTeam
      ? [...activeTeam.players, ...gameService.getOpponents(activeTeam.id)]
      : [];
    for (const player of players) {
      if (
        hasSkill(player.skills, SkillType.SECRET_WEAPON) &&
        player.status !== PlayerStatus.RESERVE &&
        player.status !== PlayerStatus.REMOVED
      ) {
        player.status = PlayerStatus.REMOVED;
        player.gridPosition = null;
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: SkillType.SECRET_WEAPON,
          effect: "Secret Weapon: Sent-off at the end of the Drive",
        });
        eventBus.emit(GameEventNames.PlayerStatusChanged, player);
      }
    }

    await context.delay(800);

    gameService.resetDriveState();
  }
}

export class KORecoveryOperation extends GameOperation {
  public readonly name = "KORecovery";

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;
    const phase = gameService.getPhase();

    eventBus.emit(GameEventNames.PhaseChanged, {
      phase,
      subPhase: SubPhase.RECOVER_KO,
    });

    gameService.rollKORecovery();

    await context.delay(800);
  }
}

export class StartNextDriveOperation extends GameOperation {
  public readonly name = "StartNextDrive";

  constructor(private kickingTeamId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    await context.delay(400);
    // No coin flip after drive one: setup starts directly with the
    // predetermined kicking team (scorer, or halftime swap).
    context.gameService.startSetup(this.kickingTeamId);
  }
}
