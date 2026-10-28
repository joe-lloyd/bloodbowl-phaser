/**
 * End of Drive Sequence (rulebook p.83), queued in order by
 * GameService.addTouchdown / GameService.endDrive:
 *
 *   0. TouchdownCelebrationOperation - the celebration window, then endDrive
 *   1. ClearPitchOperation   - announce drive end, everyone to the dugouts
 *   2. KORecoveryOperation   - D6 per KO'd player, 4+ recovers to Reserves
 *   3. StartNextDriveOperation - setup for the next drive (no coin flip)
 *
 * ClearPitchOperation also sends off Secret Weapons and, before a further
 * drive, resolves Sweltering Heat (the only End of Drive weather effect).
 */

import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SubPhase } from "../../types/GameState";
import { SkillType, hasSkill } from "../../types/Skills";
import { Player, PlayerStatus } from "../../types/Player";
import { Team } from "../../types/Team";
import { getDriveEffects } from "../kickoff/driveEffects";
import { offerBribe } from "../inducements/bribes";
import { DiceController } from "../controllers/DiceController";
import { rollYouDopeCollapse } from "../inducements/matchInducements";
import {
  assertSinglePlayerLocation,
  movePlayerToBox,
} from "../rules/playerLocation";

/** How long the coaches watch the score before the pitch is cleared. */
export const TOUCHDOWN_CELEBRATION_MS = 2000;
/** How long each KO recovery roll is shown before the next player rolls. */
export const KO_RECOVERY_BEAT_MS = 500;

/**
 * A pacing beat the local coach can cut short by emitting
 * `UI_SkipDriveSequence`. That event is a UI intent and never crosses the
 * wire, so an online match always plays the full fixed-length sequence and
 * both coaches stay in step.
 */
export function skippableBeat(context: FlowContext, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      context.eventBus.off(GameEventNames.UI_SkipDriveSequence, finish);
      resolve();
    };
    context.eventBus.on(GameEventNames.UI_SkipDriveSequence, finish);
    void context.delay(ms).then(finish);
  });
}

/**
 * The celebration window after a touchdown. The TOUCHDOWN phase handler owns
 * the scene while this runs; when the window ends this operation hands off
 * into the end-of-drive sequence. Queued rather than chained off a bare
 * timer so the hand-off is ordered against everything else in flight and
 * runs identically headless.
 */
export class TouchdownCelebrationOperation extends GameOperation {
  public readonly name = "TouchdownCelebration";

  constructor(private scoringTeamId: string) {
    super();
  }

  async execute(context: FlowContext): Promise<void> {
    await skippableBeat(context, TOUCHDOWN_CELEBRATION_MS);
    // Rulebook: the team that scored becomes the kicking team next drive.
    context.gameService.endDrive("touchdown", this.scoringTeamId);
  }
}

export class ClearPitchOperation extends GameOperation {
  public readonly name = "ClearPitch";

  constructor(
    private reason: "touchdown" | "halftime",
    private nextKickingTeamId: string,
    /** False at full time: End of Drive effects only prepare a next drive. */
    private anotherDrive: boolean
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
        eventBus.emit(GameEventNames.SkillTriggered, {
          playerId: player.id,
          skill: SkillType.SECRET_WEAPON,
          effect: "Secret Weapon: Sent-off at the end of the Drive",
        });
        if (await offerBribe(gameService, eventBus, player)) continue;
        movePlayerToBox(player, { box: "sent-off" }, eventBus);
      }
    }

    // End of Drive Effects: Sweltering Heat picks from the players still on
    // the pitch, so choose them before the pitch is cleared.
    const fainted =
      this.anotherDrive && gameService.getState().weather === "Sweltering Heat"
        ? swelteringHeat(gameService.getTeams(), gameService.getDiceController())
        : [];

    // You Dope! (L21): each doped player who played the drive rolls a D6;
    // on 1 or 2 they are Knocked-out and skip this KO recovery.
    if (this.anotherDrive) {
      const collapsed = rollYouDopeCollapse(
        gameService.getState(),
        gameService.getDiceController(),
        gameService.getTeams().flatMap((team) => team.players)
      );
      for (const player of collapsed) {
        movePlayerToBox(player, { box: "ko" }, eventBus);
        eventBus.emit(
          GameEventNames.UI_GameLog,
          `You Dope!: ${player.playerName} collapses and is Knocked-out`
        );
      }
    }

    await context.delay(800);

    gameService.resetDriveState();
    // Marked after the reset, which clears the ending drive's effects; this
    // one lasts through the next drive.
    const effects = getDriveEffects(gameService.getState());
    for (const player of fainted) {
      effects.playerModifiers[player.id] = { confinedToReserves: true };
      eventBus.emit(GameEventNames.DriveEffectGranted, {
        teamId: player.teamId,
        effect: "sweltering-heat",
        detail: `${player.playerName} faints in the heat and misses the next drive`,
      });
    }
    assertSinglePlayerLocation(players, "ClearPitchOperation");
  }
}

/**
 * Sweltering Heat: one coach rolls a D3, then each coach randomly selects
 * that many of their players on the pitch. Each pick is a D16, rerolled when
 * it falls outside a whole multiple of the pool so every player is as likely.
 */
function swelteringHeat(teams: Team[], dice: DiceController): Player[] {
  const count = dice.rollD3("Sweltering Heat");
  return teams.flatMap((team) => {
    const pool = team.players.filter((p) => !!p.gridPosition);
    const picked: Player[] = [];
    while (picked.length < count && pool.length > 0) {
      const accepted = Math.floor(16 / pool.length) * pool.length;
      let roll: number;
      do {
        roll = dice.rollD16(`Sweltering Heat — ${team.name}`, team.id);
      } while (roll > accepted);
      picked.push(...pool.splice((roll - 1) % pool.length, 1));
    }
    return picked;
  });
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

    // One player at a time: roll, show it, beat, then apply. Awaited, so
    // StartNextDriveOperation cannot begin until the sequence has settled.
    await gameService.rollKORecovery(() =>
      skippableBeat(context, KO_RECOVERY_BEAT_MS)
    );
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
