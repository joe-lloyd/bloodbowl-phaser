/**
 * The drive and the half: the kick-off, touchdowns, the End of Drive
 * Sequence, KO recovery, and what full time rolls and announces.
 */

import { GamePhase, MatchResult, SubPhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { isLeagueMode } from "@/types/Team";
import { PlayerStatus } from "@/types/Player";
import { NextHalf } from "@/game/managers/TurnManager";
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
import { takeUnsatedBloodlust } from "./activation";

export function startKickoff(parts: GameParts): void {
  const { state, eventBus } = parts;
  state.phase = GamePhase.KICKOFF;
  state.subPhase = SubPhase.ROLL_KICKOFF;
  eventBus.emit(GameEventNames.KickoffStarted);
  eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  });
  // You Dope! is offered after both set-ups, before the kick (L21).
  if (
    [parts.team1, parts.team2].some((team) =>
      holdsMeasure(state, team.id, DesperateMeasure.YOU_DOPE)
    )
  ) {
    parts.flowManager.add(new OfferYouDopeOperation());
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
  // A drive ends at its first touchdown. A pickup in the end zone scores
  // from PickupOperation and the move that made it would score again.
  if (parts.state.phase !== GamePhase.PLAY) return;
  // Bloodlust: an unsated scorer must bite first; "if this player was in
  // the opposing End Zone, no Touchdown is scored" when they do not.
  if (scorerId && takeUnsatedBloodlust(parts, scorerId)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(scorerId, "consequences", (sated) =>
        sated
          ? parts.game.addTouchdown(teamId, scorerId)
          : parts.game.finishActivation(scorerId)
      )
    );
    return;
  }
  parts.state.score[teamId] = (parts.state.score[teamId] || 0) + 1;

  // Scored in the opponent's Turn (a push or a catch): that Turn ends with
  // the drive, and the scorers skip their next Turn celebrating.
  if (parts.state.activeTeamId && parts.state.activeTeamId !== teamId) {
    parts.turnManager.skipNextTurn(teamId);
    parts.eventBus.emit(
      GameEventNames.UI_Notification,
      `${parts.game.getTeam(teamId)?.name ?? "The scorers"} skip their next turn celebrating!`
    );
  }

  parts.state.phase = GamePhase.TOUCHDOWN;
  parts.state.subPhase = SubPhase.SCORING;

  // Phase first, then the score: the TOUCHDOWN phase handler is installed
  // by the phase change and must already own the scene when the Touchdown
  // event it announces arrives.
  parts.eventBus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.TOUCHDOWN,
    subPhase: SubPhase.SCORING,
  });
  parts.eventBus.emit(GameEventNames.Touchdown, {
    teamId,
    score: parts.state.score[teamId],
    scorerId,
  });

  announceTouchdown(parts, teamId, scorerId);

  // The celebration window is a queued operation, not a bare timer, so the
  // hand-off into the end-of-drive sequence is ordered against everything
  // else in flight (and paced identically headless).
  parts.flowManager.add(new TouchdownCelebrationOperation(teamId));
}

/**
 * Scorer, score and the turns each team has left in the half: on the
 * banner, which holds before setup, and as a row in the dice log.
 */
function announceTouchdown(
  parts: GameParts,
  teamId: string,
  scorerId: string | undefined
): void {
  const { team1, team2, state } = parts;
  const scorer = scorerId ? parts.game.getPlayerById(scorerId) : undefined;
  const who = scorer?.playerName ?? parts.game.getTeam(teamId)?.name ?? teamId;
  const score = `${team1.name} ${state.score[team1.id] ?? 0} : ${state.score[team2.id] ?? 0} ${team2.name}`;
  const turnsLeft = [team1, team2]
    .map((team) => `${team.name} ${parts.turnManager.turnsLeft(team.id)}`)
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

/**
 * Full time, announced once from the single place every GAME_OVER
 * transition passes through (headless CLI included, since this runs at
 * the engine level rather than in a Phaser scene). States the played
 * score and the actual outcome — win/draw, or concession/forfeit labelled
 * as such — never an invented result.
 */
export function announceFullTime(parts: GameParts): void {
  const { team1, team2 } = parts;
  const score1 = parts.state.score[team1.id] ?? 0;
  const score2 = parts.state.score[team2.id] ?? 0;
  const scoreline = `${team1.name} ${score1} : ${score2} ${team2.name}`;
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
    const won1 = result.penalties[team1.id] ?? 0;
    const won2 = result.penalties[team2.id] ?? 0;
    const winner = won1 > won2 ? team1 : team2;
    return `${winner.name} win on Penalties, ${Math.max(won1, won2)}–${Math.min(won1, won2)}`;
  }
  if (score1 === score2) return "draw";
  return `${score1 > score2 ? team1.name : team2.name} win`;
}

function concededOutcome(parts: GameParts, result: MatchResult): string {
  const conceding =
    (result.concedingTeamId && parts.game.getTeam(result.concedingTeamId)) ||
    undefined;
  const verb = result.reason === "concession" ? "conceded" : "forfeited";
  return conceding ? `${conceding.name} ${verb}` : `Match ${verb}`;
}

/**
 * The Fans (pre-game sequence): each team's Fan Factor is its Dedicated
 * Fans plus a D3. Only league winnings read it, so it is rolled at full
 * time, before Dedicated Fans change, and only in a fixture that pays
 * winnings with a league team playing. A tournament or friendly rolls
 * nothing, so its dice stay as they were. Nothing earlier in a Sevens
 * game uses it: Pitch Invasion adds Dedicated Fans (docs/SEVENS_RULES.md
 * K12).
 */
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
    fanFactors[team.id] = fanFactor(team.dedicatedFans ?? 0, d3);
  }
  parts.state.fanFactors = fanFactors;
}

/**
 * Post-game Update Dedicated Fans for both teams, on the played score: a
 * concession never invents a result, so a conceded 0-0 is a draw. A
 * Penalty Shoot-out decides a knockout game left level.
 */
export function updateDedicatedFans(parts: GameParts): void {
  const { team1, team2, state } = parts;
  const dice = parts.diceController;
  const penalties = state.result?.penalties ?? {};
  for (const team of [team1, team2]) {
    const otherId = team.id === team1.id ? team2.id : team1.id;
    const lead =
      (state.score[team.id] ?? 0) - (state.score[otherId] ?? 0) ||
      (penalties[team.id] ?? 0) - (penalties[otherId] ?? 0);
    const outcome = lead > 0 ? "win" : lead < 0 ? "loss" : "draw";
    updateTeamDedicatedFans(team, outcome, () =>
      dice.rollD6(`Dedicated Fans (${team.name})`, team.id)
    );
  }
}

/**
 * End of Drive Sequence (rulebook p.83): clear the pitch to the dugouts,
 * roll KO recovery, then restart with the given kicking team — no coin
 * flip after drive one. Runs as operations so the UI can pace each stage.
 */
export function endDrive(
  parts: GameParts,
  reason: "touchdown" | "halftime",
  next: NextHalf
): void {
  // A touchdown scored with no turns left in the half does not start a
  // further drive in that half: the sequence continues into halftime (or,
  // in the second half, to full time) instead.
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
  // Nothing next = full time; there is no next drive to set up.
  if (upNext === null) return;
  parts.flowManager.add(
    kickingTeamId
      ? new StartNextDriveOperation(kickingTeamId)
      : new ExtraTimeKickoffOperation()
  );
}

/**
 * Clear all drive state: players to dugouts (KO/Injured stay out),
 * placement bookkeeping reset, ball off the pitch.
 */
export function resetDriveState(parts: GameParts): void {
  const { state, team1, team2 } = parts;
  // Zap!'s Frogs are themselves again at the end of the drive
  restoreFrogs(state, [...team1.players, ...team2.players]);
  parts.setupManager.resetForNewDrive();
  state.ballPosition = null;
  state.activePlayer = null;

  // Kickoff-event effects never survive the drive (free re-roll, Dodgy
  // Snack modifiers, confinement); bribes persist — they are match-scoped.
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

  // The kickoff-roll-once guard is scoped to the drive that just ended;
  // the next drive's kickoff must be free to roll.
  state.kickoffResolution = undefined;
  state.kickoffKickResolved = undefined;

  // Activation state must not leak into the next drive's setup — stale
  // activatedPlayerIds left players "already gone" and blocked setup
  state.turn.activatedPlayerIds.clear();
  state.turn.movementUsed.clear();
  state.turn.hasBlitzed = false;
  state.turn.hasPassed = false;
  state.turn.hasHandedOff = false;
  state.turn.hasFouled = false;
  state.turn.hasThrownTeamMate = false;
  state.turn.hasKickedTeamMate = false;
  state.turn.hasThrownBomb = false;

  // A drive can end mid-activation (touchdown, halftime), which skips
  // finishActivation — clear the Blitz block guard at this boundary too.
  parts.marks.blitzBlockUsed.clear();

  // Conditions do not survive the drive (Rooted explicitly ends here)
  [...team1.players, ...team2.players].forEach((p) => {
    if (p.conditions?.length) p.conditions = [];
  });

  parts.eventBus.emit(GameEventNames.RefreshBoard);
}

/**
 * Roll KO recovery one knocked-out player at a time (D6, 4+ recovers to
 * Reserves). Each roll is announced via KORecoveryRolled and shown for a
 * beat BEFORE the status change is applied, so the visible roll and the
 * record never disagree. `beat` paces the sequence (a real pause in the
 * browser, immediate headless); the returned promise resolves only once
 * every player has been rolled for and moved.
 */
export async function rollKORecovery(
  parts: GameParts,
  beat: () => Promise<void>
): Promise<void> {
  const { state, team1, team2 } = parts;
  // You Dope! collapses cannot recover this end of drive (L21).
  const noRecovery = state.matchInducements?.noRecoveryPlayerIds ?? [];
  const knockedOut = [...team1.players, ...team2.players].filter(
    (p) => p.status === PlayerStatus.KO && !noRecovery.includes(p.id)
  );
  if (state.matchInducements) {
    state.matchInducements.noRecoveryPlayerIds = [];
  }

  for (const player of knockedOut) {
    const roll = parts.diceController.rollD6("KO Recovery");
    // Blitzer's Best Kegs: +1 per Keg to the owner's recovery rolls.
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

/**
 * Score a touchdown if the player is standing in the end zone they score
 * in while holding the ball. Called after any event that can put a
 * ball-carrier there: movement steps, pickups, catches, pushes.
 */
export function checkForTouchdown(parts: GameParts, playerId: string): boolean {
  if (parts.state.phase !== GamePhase.PLAY) return false;
  const player = parts.game.getPlayerById(playerId);
  if (!player || !player.gridPosition) return false;
  if (player.status !== PlayerStatus.ACTIVE) return false;
  if (!parts.ballManager.hasBall(playerId)) return false;

  const side = player.teamId === parts.team1.id ? 1 : 2;
  if (!isInEndZone(player.gridPosition, GameConfig.PITCH_WIDTH, side)) {
    return false;
  }
  parts.game.addTouchdown(player.teamId, player.id);
  return true;
}
