import { heatwaveCasualties } from "../kickoff/driveHazards";
import type { IGameService } from "../../services/interfaces/IGameService";
import {
  whenMomentsComplete,
  hasPendingMoments,
} from "../presentation/momentQueue";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
import { GameEventNames } from "../../types/events";
import { SubPhase } from "../../types/GameState";
import { type Player } from "../../types/Player";
import { type Team } from "../../types/Team";
import { getDriveEffects } from "../kickoff/driveEffects";
import { secretWeaponsAfterDrive } from "./secretWeaponsAfterDrive";
import { DiceController } from "../controllers/DiceController";
import { rollYouDopeCollapse } from "../inducements/matchInducements";
import { rollOff } from "../rules/extraTime";
import {
  assertSinglePlayerLocation,
  movePlayerToBox,
} from "../rules/playerLocation";

const TOUCHDOWN_CELEBRATION_MS = 2000;

const KO_RECOVERY_BEAT_MS = 500;

function skippableBeat(context: FlowContext, ms: number): Promise<void> {
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

function activeTeamFirst(gameService: FlowContext["gameService"]): Player[] {
  const activeTeamId = gameService.getActiveTeamId();
  const activeTeam = activeTeamId
    ? gameService.getTeam(activeTeamId)
    : undefined;
  return activeTeam
    ? [...activeTeam.players, ...gameService.getOpponents(activeTeam.id)]
    : [];
}

function youDopeCollapse(context: FlowContext): void {
  const { gameService, eventBus } = context;
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

export class TouchdownCelebrationOperation extends GameOperation {
  public readonly name = "TouchdownCelebration";

  private scoringTeamId: string;
  constructor(scoringTeamId: string) {
    super();
    this.scoringTeamId = scoringTeamId;
  }

  async execute(context: FlowContext): Promise<void> {
    if (hasPendingMoments(context.eventBus)) {
      await whenMomentsComplete(context.eventBus);
    } else {
      await skippableBeat(context, TOUCHDOWN_CELEBRATION_MS);
    }

    context.gameService.endDrive("touchdown", {
      kickingTeamId: this.scoringTeamId,
    });
  }
}

export class ClearPitchOperation extends GameOperation {
  public readonly name = "ClearPitch";

  private reason: "touchdown" | "halftime";
  private nextKickingTeamId: string | null;
  private anotherDrive: boolean;
  constructor(
    reason: "touchdown" | "halftime",

    nextKickingTeamId: string | null,

    anotherDrive: boolean
  ) {
    super();
    this.reason = reason;
    this.nextKickingTeamId = nextKickingTeamId;
    this.anotherDrive = anotherDrive;
  }

  async execute(context: FlowContext): Promise<void> {
    const { gameService, eventBus } = context;
    await whenMomentsComplete(eventBus);

    eventBus.emit(GameEventNames.DriveEnded, {
      reason: this.reason,
      nextKickingTeamId: this.nextKickingTeamId,
    });

    const players = activeTeamFirst(gameService);
    await secretWeaponsAfterDrive(context, players);

    const fainted = this.anotherDrive ? driveEndFaints(gameService) : [];

    if (this.anotherDrive) youDopeCollapse(context);

    await context.delay(800);

    gameService.resetDriveState();

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

function driveEndFaints(gameService: IGameService): Player[] {
  const dice = gameService.getDiceController();
  const teams = gameService.getTeams();
  const weather = gameService.getState().weather;
  if (weather === "Sweltering Heat") return swelteringHeat(teams, dice);
  if (weather !== "Underground Heatwave") return [];
  return heatwaveCasualties(teams.flatMap((team) => team.players), dice);
}

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

    await gameService.rollKORecovery(() =>
      skippableBeat(context, KO_RECOVERY_BEAT_MS)
    );
  }
}

export class StartNextDriveOperation extends GameOperation {
  public readonly name = "StartNextDrive";

  private kickingTeamId: string;
  constructor(kickingTeamId: string) {
    super();
    this.kickingTeamId = kickingTeamId;
  }

  async execute(context: FlowContext): Promise<void> {
    await context.delay(400);

    context.gameService.startSetup(this.kickingTeamId);
    context.eventBus.emit(GameEventNames.UI_Announce, {
      kind: "next-kicker",
      headline: `${context.gameService.getTeam(this.kickingTeamId)?.name ?? "Scoring team"} kick next`,
      subtitle: "Set up for the next drive",
    });
  }
}

export class ExtraTimeKickoffOperation extends GameOperation {
  public readonly name = "ExtraTimeKickoff";

  async execute(context: FlowContext): Promise<void> {
    const { gameService } = context;
    const [home, away] = gameService.getTeams();
    const winnerId = rollOff(
      gameService.getDiceController(),
      "Extra Time roll-off",
      [home, away]
    );
    const winner = winnerId === home.id ? home : away;
    const other = winner === home ? away : home;
    const answer = await gameService.getDecisionService().request({
      type: "reaction",
      playerId: "",
      chooserTeamId: winner.id,
      skill: "Extra Time",
      prompt: `${winner.name} won the roll-off. Kick off Extra Time? Choose No to receive.`,
    });
    const kicks = "accept" in answer && answer.accept;
    await new StartNextDriveOperation(kicks ? winner.id : other.id).execute(
      context
    );
  }
}
