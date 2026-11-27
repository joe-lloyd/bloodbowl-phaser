import { GamePhase, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import type { Player } from "@/types/Player";
import type { Team } from "@/types/Team";
import {
  type PairSeating,
  pairSeating,
  pairTeams,
  teamsOf,
} from "@/game/seating";
import { penaltyShootout, undecided } from "@/game/rules/extraTime";
import { replenishTeamRerolls } from "@/game/teamRerolls";
import {
  ClearPitchOperation,
  ExtraTimeKickoffOperation,
  KORecoveryOperation,
  StartNextDriveOperation,
  TouchdownCelebrationOperation,
} from "@/game/operations/EndDriveOperations";
import {
  PreDriveInducementsOperation,
  holdsDriveInducements,
} from "@/game/inducements/driveInducements";
import { beginCoinFlip } from "./matchStart";
import type { GameParts } from "./parts";

export const ONLY_BALL = 0;

export type NextHalf = { kickingTeamId: string } | { rollOff: true };

interface PairStandings {
  readonly kind: "pair";
  readonly winnerId: string | null;
  readonly penalties?: Record<string, number>;
}

interface DrivesFlow {
  readonly kind: "drives";
  readonly scoreRun: "stop";
  begin(): void;
  touchdown(scorer: Player, ball: typeof ONLY_BALL): void;
  halfOver(): void;
  standings(): PairStandings;
}

export type MatchFlow = DrivesFlow;

export function flowFor(parts: GameParts): MatchFlow {
  return drivesFlow(parts, pairSeating(parts.seating));
}

function drivesFlow(parts: GameParts, seating: PairSeating): DrivesFlow {
  return {
    kind: "drives",
    scoreRun: "stop",
    begin: () => {
      beginCoinFlip(parts);
    },
    touchdown: (scorer) => {
      scoreTouchdown(parts, seating, scorer);
    },
    halfOver: () => {
      const next = nextHalf(parts, seating);
      if (next) endDrive(parts, "halftime", next);
    },
    standings: () => pairStandings(parts, seating),
  };
}

function scoreTouchdown(
  parts: GameParts,
  seating: PairSeating,
  scorer: Player
): void {
  const { teamId } = scorer;
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
    scorerId: scorer.id,
  });

  announceTouchdown(parts, seating, scorer);

  parts.flowManager.add(new TouchdownCelebrationOperation(teamId));
}

function announceTouchdown(
  parts: GameParts,
  seating: PairSeating,
  scorer: Player
): void {
  const { state } = parts;
  const [team1, team2] = pairTeams(seating);
  const score = `${team1.name} ${String(state.score[team1.id] ?? 0)} : ${String(state.score[team2.id] ?? 0)} ${team2.name}`;
  const turnsLeft = [team1, team2]
    .map(
      (team) => `${team.name} ${String(parts.turnManager.turnsLeft(team.id))}`
    )
    .join(", ");
  const detail = `${scorer.playerName} scores. ${score}. Turns left in the half: ${turnsLeft}`;
  parts.eventBus.emit(GameEventNames.UI_Announce, {
    kind: "touchdown",
    headline: "Touchdown!",
    subtitle: detail,
  });
  parts.eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "score",
    headline: "TOUCHDOWN!",
    detail,
    teamId: scorer.teamId,
  });
}

export function endDrive(
  parts: GameParts,
  reason: "touchdown" | "halftime",
  next: NextHalf
): void {
  const halfOver =
    reason === "touchdown" && parts.turnManager.isHalfExhausted();
  const upNext = halfOver ? nextHalf(parts, pairSeating(parts.seating)) : next;
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
  if (holdsDriveInducements(parts.state, teamsOf(parts.seating)))
    parts.flowManager.add(new PreDriveInducementsOperation());
  parts.flowManager.add(
    kickingTeamId
      ? new StartNextDriveOperation(kickingTeamId)
      : new ExtraTimeKickoffOperation()
  );
}

function nextHalf(parts: GameParts, seating: PairSeating): NextHalf | null {
  const { state } = parts;
  const undecidedGame = !state.result && undecided(state, seating);
  if (state.turn.isHalf2 && undecidedGame && !state.turn.extraTime)
    return beginExtraTime(parts, seating);
  if (state.turn.isHalf2) {
    endMatch(parts, seating, undecidedGame);
    return null;
  }

  state.turn.isHalf2 = true;
  replenishTeamRerolls(state);
  parts.turnManager.seedTurnCounts(0);
  announceBreak(parts, seating, "Halftime");

  return {
    kickingTeamId: rivalOf(seating, parts.turnManager.firstHalfKicker()).id,
  };
}

function endMatch(
  parts: GameParts,
  seating: PairSeating,
  undecidedGame: boolean
): void {
  const { state } = parts;
  state.phase = GamePhase.GAME_OVER;
  state.activeTeamId = null;
  state.result ??= {
    reason: "completed",
    ...(undecidedGame && {
      penalties: penaltyShootout(parts.diceController, seating),
    }),
  };
  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.GAME_OVER,
  });
}

function beginExtraTime(parts: GameParts, seating: PairSeating): NextHalf {
  parts.state.turn.extraTime = true;
  parts.turnManager.seedTurnCounts(0);
  announceBreak(parts, seating, "Extra Time");
  return { rollOff: true };
}

function announceBreak(
  parts: GameParts,
  seating: PairSeating,
  headline: string
): void {
  const { state, eventBus } = parts;
  state.phase = GamePhase.HALFTIME;
  eventBus.emit(GameEventNames.PhaseChanged, { phase: GamePhase.HALFTIME });
  const [home, away] = pairTeams(seating);
  const score = `${home.name} ${String(state.score[home.id] ?? 0)} : ${String(state.score[away.id] ?? 0)} ${away.name}`;
  eventBus.emit(GameEventNames.UI_LogEntry, {
    category: "drive",
    headline,
    detail: score,
  });
  eventBus.emit(GameEventNames.UI_Announce, {
    kind: "halftime",
    headline,
    subtitle: score,
  });
}

function rivalOf(seating: PairSeating, teamId: string | null): Team {
  const [home, away] = pairTeams(seating);
  return teamId === home.id ? away : home;
}

function pairStandings(parts: GameParts, seating: PairSeating): PairStandings {
  const [home, away] = pairTeams(seating);
  const { score, result } = parts.state;
  const lead = (score[home.id] ?? 0) - (score[away.id] ?? 0);
  const penalties = lead === 0 ? result?.penalties : undefined;
  const shootoutLead = penalties
    ? (penalties[home.id] ?? 0) - (penalties[away.id] ?? 0)
    : 0;
  return {
    kind: "pair",
    winnerId: leaderOf(home, away, lead || shootoutLead),
    ...(penalties && { penalties }),
  };
}

function leaderOf(home: Team, away: Team, lead: number): string | null {
  if (lead === 0) return null;
  return lead > 0 ? home.id : away.id;
}
