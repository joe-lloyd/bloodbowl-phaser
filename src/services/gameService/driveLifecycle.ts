import type { Team } from "@/types/Team";
import { GamePhase, type MatchResult, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { isLeagueMode } from "@/types/Team";
import { PlayerStatus } from "@/types/Player";
import { type NextHalf } from "@/game/managers/TurnManager";
import {
  ClearPitchOperation,
  ExtraTimeKickoffOperation,
  KORecoveryOperation,
  StartNextDriveOperation,
  TouchdownCelebrationOperation,
} from "@/game/operations/EndDriveOperations";
import {
  assertSinglePlayerLocation,
  movePlayerToBox,
} from "@/game/rules/playerLocation";
import { isInEndZone } from "@/game/elements/GridUtils";
import { GameConfig } from "@/config/GameConfig";
import { BloodlustBiteOperation } from "@/game/operations/BloodlustBiteOperation";
import { inducementCount } from "@/game/inducements/inventory";
import {
  OfferYouDopeOperation,
  holdsMeasure,
  restoreFrogs,
} from "@/game/inducements/matchInducements";
import { DesperateMeasure } from "@/game/inducements/desperateMeasures";
import { Inducement } from "@/types/Inducements";
import {
  driveEffectsEmpty,
  emptyDriveEffects,
  getDriveEffects,
} from "@/game/kickoff/driveEffects";
import { updateDedicatedFans as updateTeamDedicatedFans } from "@/game/rules/leagueRoster";
import { fanFactor } from "@/game/rules/winnings";
import type { GameParts } from "./parts";
import { GameOperation } from "@/game/core/GameOperation";
import { takeUnsatedBloodlust } from "./activation";

export function startKickoff(parts: GameParts): void {
  const { state, eventBus } = parts;
  state.phase = GamePhase.KICKOFF;
  state.subPhase = SubPhase.ROLL_KICKOFF;
  eventBus.emit(GameEventNames.KickoffStarted, undefined);
  eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  });

  if (
    [parts.team1, parts.team2].some((team) =>
      holdsMeasure(state, team.id, DesperateMeasure.YOU_DOPE)
    )
  ) {
    parts.flowManager.add(new OfferYouDopeOperation());
  }
  // A kicking team with nobody on the pitch picks no kicker: Touchback.
  const kicking = [parts.team1, parts.team2].find(
    (team) => team.id === state.setup?.kickingTeamId
  );
  if (kicking && !kicking.players.some((p) => p.gridPosition)) {
    parts.flowManager.add(
      new AutomaticTouchbackOperation(() =>
        parts.ballManager.automaticTouchback(kicking.id === parts.team1.id)
      )
    );
  }
}

/** The drive's kick-off when the kicking team has nobody to kick. */
class AutomaticTouchbackOperation extends GameOperation {
  public readonly name = "AutomaticTouchback";
  constructor(private readonly touchback: () => Promise<void>) {
    super();
  }
  async execute(): Promise<void> {
    await this.touchback();
  }
}

export function selectKicker(parts: GameParts, playerId: string): void {
  if (parts.state.phase === GamePhase.KICKOFF) {
    const player = parts.game.getPlayerById(playerId);
    if (player) {
      parts.eventBus.emit(GameEventNames.PlayerSelected, { player });
    }
  }
}

export function addTouchdown(
  parts: GameParts,
  teamId: string,
  scorerId?: string
): void {
  if (parts.state.phase !== GamePhase.PLAY) return;

  if (scorerId && takeUnsatedBloodlust(parts, scorerId)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(scorerId, "consequences", (sated) => {
        if (sated) parts.game.addTouchdown(teamId, scorerId);
        else parts.game.finishActivation(scorerId);
      })
    );
    return;
  }
  parts.state.score[teamId] = (parts.state.score[teamId] ?? 0) + 1;

  if (parts.state.activeTeamId && parts.state.activeTeamId !== teamId) {
    parts.turnManager.skipNextTurn(teamId);
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${parts.game.getTeam(teamId)?.name ?? "The scorers"} skip their next turn celebrating!`
    );
  }

  parts.state.phase = GamePhase.TOUCHDOWN;
  parts.state.subPhase = SubPhase.SCORING;

  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.TOUCHDOWN,
    subPhase: SubPhase.SCORING,
  });
  parts.eventBus.emit(GameEventNames.Touchdown, {
    teamId,
    score: parts.state.score[teamId],
    ...(scorerId === undefined ? {} : { scorerId }),
  });

  announceTouchdown(parts, teamId, scorerId);

  parts.flowManager.add(new TouchdownCelebrationOperation(teamId));
}

function announceTouchdown(
  parts: GameParts,
  teamId: string,
  scorerId: string | undefined
): void {
  const { team1, team2, state } = parts;
  const scorer = scorerId ? parts.game.getPlayerById(scorerId) : undefined;
  const who = scorer?.playerName ?? parts.game.getTeam(teamId)?.name ?? teamId;
  const score = `${team1.name} ${String(state.score[team1.id] ?? 0)} : ${String(state.score[team2.id] ?? 0)} ${team2.name}`;
  const turnsLeft = [team1, team2]
    .map(
      (team) => `${team.name} ${String(parts.turnManager.turnsLeft(team.id))}`
    )
    .join(", ");
  const detail = `${who} scores. ${score}. Turns left in the half: ${turnsLeft}`;
  parts.eventBus.emit(GameEventNames.UI_Announce, {
    kind: "touchdown",
    headline: "Touchdown!",
    subtitle: detail,
  });
  parts.eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "score",
    headline: "TOUCHDOWN!",
    detail,
    teamId,
  });
}

export function announceFullTime(parts: GameParts): void {
  const { team1, team2 } = parts;
  const score1 = parts.state.score[team1.id] ?? 0;
  const score2 = parts.state.score[team2.id] ?? 0;
  const scoreline = `${team1.name} ${String(score1)} : ${String(score2)} ${team2.name}`;
  const line = `FULL TIME — ${scoreline} (${fullTimeOutcome(parts, score1, score2)})`;
  parts.eventBus.emit(GameEventNames.UI_Notification, line);
  parts.eventBus.emit(GameEventNames.UI_GameLog, line);
}

function fullTimeOutcome(
  parts: GameParts,
  score1: number,
  score2: number
): string {
  const { team1, team2 } = parts;
  const result = parts.state.result;
  if (result?.reason === "concession" || result?.reason === "forfeit") {
    return concededOutcome(parts, result);
  }
  if (score1 === score2 && result?.penalties) {
    return penaltyOutcome(parts, result.penalties);
  }
  if (score1 === score2) return "draw";
  return `${score1 > score2 ? team1.name : team2.name} win`;
}

function concededOutcome(parts: GameParts, result: MatchResult): string {
  const conceding = result.concedingTeamId
    ? parts.game.getTeam(result.concedingTeamId)
    : undefined;
  const verb = result.reason === "concession" ? "conceded" : "forfeited";
  return conceding ? `${conceding.name} ${verb}` : `Match ${verb}`;
}

export function rollFanFactors(parts: GameParts): void {
  if (!parts.state.paysWinnings || parts.state.fanFactors) return;
  const teams = [parts.team1, parts.team2];
  if (!teams.some((team) => isLeagueMode(team.advancementMode))) return;
  const fanFactors: Record<string, number> = {};
  for (const team of teams) {
    const d3 = parts.diceController.rollD3(
      `Fan Factor (${team.name})`,
      team.id
    );
    fanFactors[team.id] = fanFactor(team.dedicatedFans, d3);
  }
  parts.state.fanFactors = fanFactors;
}

export function updateDedicatedFans(parts: GameParts): void {
  const { team1, team2, state } = parts;
  const penalties = state.result?.penalties ?? {};
  for (const team of [team1, team2]) {
    updateTeamFans(parts, team, penalties);
  }
}

export function endDrive(
  parts: GameParts,
  reason: "touchdown" | "halftime",
  next: NextHalf
): void {
  const halfOver =
    reason === "touchdown" && parts.turnManager.isHalfExhausted();
  const upNext = halfOver ? parts.turnManager.beginNextHalf() : next;
  const kickingTeamId =
    upNext && "kickingTeamId" in upNext ? upNext.kickingTeamId : null;

  parts.flowManager.add(
    new ClearPitchOperation(
      halfOver ? "halftime" : reason,
      kickingTeamId,
      upNext !== null
    )
  );
  parts.flowManager.add(new KORecoveryOperation());

  if (upNext === null) return;
  parts.flowManager.add(
    kickingTeamId
      ? new StartNextDriveOperation(kickingTeamId)
      : new ExtraTimeKickoffOperation()
  );
}

export function resetDriveState(parts: GameParts): void {
  const { state, team1, team2 } = parts;

  restoreFrogs(state, [...team1.players, ...team2.players]);
  parts.setupManager.resetForNewDrive();
  state.ballPosition = null;
  state.activePlayer = null;

  const driveEffects = getDriveEffects(state);
  if (!driveEffectsEmpty(driveEffects)) {
    for (const teamId of new Set([
      ...Object.keys(driveEffects.freeRerolls),
      ...Object.keys(driveEffects.owedAssists),
    ])) {
      parts.eventBus.emit(GameEventNames.DriveEffectExpired, {
        teamId,
        effect: "drive-effects",
        detail: "kickoff effects expire as the drive ends",
      });
    }
    state.driveEffects = emptyDriveEffects();
  }

  delete state.kickoffResolution;
  delete state.kickoffKickResolved;

  resetTurnUsage(state);

  parts.marks.blitzBlockUsed.clear();

  [...team1.players, ...team2.players].forEach((p) => {
    if (p.conditions?.length) p.conditions = [];
  });

  parts.eventBus.emit(GameEventNames.RefreshBoard, undefined);
}

export async function rollKORecovery(
  parts: GameParts,
  beat: () => Promise<void>
): Promise<void> {
  const { state, team1, team2 } = parts;

  const noRecovery = state.matchInducements?.noRecoveryPlayerIds ?? [];
  const knockedOut = [...team1.players, ...team2.players].filter(
    (p) => p.status === PlayerStatus.KO && !noRecovery.includes(p.id)
  );
  if (state.matchInducements) {
    state.matchInducements.noRecoveryPlayerIds = [];
  }

  for (const player of knockedOut) {
    const roll = parts.diceController.rollD6("KO Recovery");

    const kegs = inducementCount(
      state,
      player.teamId,
      Inducement.BLITZERS_BEST_KEGS
    );
    const recovered = roll + kegs >= 4;
    parts.eventBus.emit(GameEventNames.KORecoveryRolled, {
      playerId: player.id,
      roll,
      recovered,
    });
    await beat();
    if (recovered) {
      movePlayerToBox(player, { box: "reserves" }, parts.eventBus);
    }
  }

  assertSinglePlayerLocation(
    [...team1.players, ...team2.players],
    "rollKORecovery"
  );
}

export function checkForTouchdown(parts: GameParts, playerId: string): boolean {
  if (parts.state.phase !== GamePhase.PLAY) return false;
  const player = parts.game.getPlayerById(playerId);
  if (!player?.gridPosition) return false;
  if (player.status !== PlayerStatus.ACTIVE) return false;
  if (!parts.ballManager.hasBall(playerId)) return false;

  const side = player.teamId === parts.team1.id ? 1 : 2;
  if (!isInEndZone(player.gridPosition, GameConfig.PITCH_WIDTH, side)) {
    return false;
  }
  parts.game.addTouchdown(player.teamId, player.id);
  return true;
}

function penaltyOutcome(
  parts: GameParts,
  penalties: Record<string, number>
): string {
  const { team1, team2 } = parts;
  const won1 = penalties[team1.id] ?? 0;
  const won2 = penalties[team2.id] ?? 0;
  const winner = won1 > won2 ? team1 : team2;
  return `${winner.name} win on Penalties, ${String(Math.max(won1, won2))}–${String(Math.min(won1, won2))}`;
}

function updateTeamFans(
  parts: GameParts,
  team: Team,
  penalties: Record<string, number>
): void {
  const { team1, team2, state } = parts;
  const dice = parts.diceController;
  const otherId = team.id === team1.id ? team2.id : team1.id;
  const lead =
    (state.score[team.id] ?? 0) - (state.score[otherId] ?? 0) ||
    (penalties[team.id] ?? 0) - (penalties[otherId] ?? 0);
  const outcome = fanOutcome(lead);
  updateTeamDedicatedFans(team, outcome, () =>
    dice.rollD6(`Dedicated Fans (${team.name})`, team.id)
  );
}

function fanOutcome(lead: number): "win" | "loss" | "draw" {
  if (lead > 0) return "win";
  return lead < 0 ? "loss" : "draw";
}

function resetTurnUsage(state: GameParts["state"]): void {
  state.turn.activatedPlayerIds.clear();
  state.turn.movementUsed.clear();
  state.turn.hasBlitzed = false;
  state.turn.hasPassed = false;
  state.turn.hasHandedOff = false;
  state.turn.hasFouled = false;
  state.turn.hasThrownTeamMate = false;
  state.turn.hasKickedTeamMate = false;
  state.turn.hasThrownBomb = false;
}
