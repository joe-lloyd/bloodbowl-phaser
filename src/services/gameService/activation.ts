/**
 * Who may activate, and how an activation, and a turn, ends: Razzle-Dazzle's
 * held second Action, Bloodlust's bite, Stalling and the crowd, Secure the
 * Ball, and the Turnover that settles the reaction chain before the turn
 * passes.
 */

import { whenMomentsComplete } from "@/game/presentation/momentQueue";
import { GameState, GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { isSecuringBall } from "@/game/rules/secureBall";
import { FinishBallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { BloodlustBiteOperation } from "@/game/operations/BloodlustBiteOperation";
import { CrowdTakesActionOperation } from "@/game/operations/CrowdTakesActionOperation";
import { canScoreWithoutDice } from "@/game/rules/stalling";
import { moveAllowance } from "@/game/skills/movement";
import {
  holdsMeasure,
  offerMeasure,
} from "@/game/inducements/matchInducements";
import { DesperateMeasure } from "@/game/inducements/desperateMeasures";
import { withDriveModifiers } from "@/game/kickoff/driveEffects";
import { ActivationValidator } from "@/game/validators/ActivationValidator";
import type { GameParts } from "./parts";

type Declaration = NonNullable<GameState["activePlayer"]>;

const activationValidator = new ActivationValidator();

export function canActivate(parts: GameParts, playerId: string): boolean {
  const player = parts.game.getPlayerById(playerId);
  if (!player) return false;
  // Charge! (kickoff 10) runs before the drive's first turn, so the turn
  // ledger is not this window's: at the opening kick-off it names no
  // team, and after a touchdown it holds the scoring turn. Only the
  // charger up now may act, and only while Standing.
  if (parts.kickoffEventManager.isChargeActive()) {
    return (
      parts.kickoffEventManager.getChargeActivePlayerId() === playerId &&
      player.status === PlayerStatus.ACTIVE
    );
  }
  return activationValidator.canActivate(player, parts.state.turn);
}

export function hasPlayerActed(parts: GameParts, playerId: string): boolean {
  // The charger up now is mid-activation, whatever the stale ledger says
  if (parts.kickoffEventManager.getChargeActivePlayerId() === playerId) {
    return false;
  }
  return parts.state.turn.activatedPlayerIds.has(playerId);
}

export function endTurn(parts: GameParts): void {
  if (parts.turnManager.isTurnoverInProgress()) return;
  // A failed Bloodlust still owes its bite. Ending the turn is one more
  // way of not biting, so it is settled first, exactly as ending the
  // activation would: bite a Thrall, or take the Turnover and Distracted.
  // The turn then ends, through that Turnover if there was one.
  const live = parts.state.activePlayer;
  if (live && takeUnsatedBloodlust(parts, live.id)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(live.id, "consequences", () =>
        parts.game.endTurn()
      )
    );
    return;
  }
  // A turn can be force-ended (the online clock expiring, or a manual End
  // Turn click) while a player's declaration is still live — declared and
  // even committed (movement spent, a die rolled), but never finalized via
  // finishActivation(). Left alone, that stale state.activePlayer survives
  // into the next team's turn and declareAction()'s "a live once-per-turn
  // declaration must release first" guard then refuses the NEXT team's
  // very first declaration, making the turn look like it never ended.
  // Finalize it the same way finishActivation() would.
  if (live && takeStalling(parts, live.id)) {
    parts.flowManager.add(
      new CrowdTakesActionOperation(live.id, () => parts.game.endTurn())
    );
    return;
  }
  parts.marks.crowdRolledFor = null;
  if (parts.state.activePlayer) {
    parts.playerActionManager.commitAction(parts.state.activePlayer.id);
    parts.state.activePlayer = null;
  }
  parts.turnManager.endTurn();
}

export function finishActivation(parts: GameParts, playerId: string): void {
  // A Ball & Chain collision has resolved: the block engine ends a Block
  // by finishing the activation, but the lurch only finishes its square,
  // once everything the Block queued has come to rest.
  const square = parts.marks.ballAndChainSquare;
  if (square?.fanaticId === playerId) {
    parts.marks.ballAndChainSquare = null;
    parts.flowManager.add(new FinishBallAndChainSquare(square));
    return;
  }
  // Both Razzle-Dazzle Actions share one activation: the bite is due after both.
  if (holdForSecondAction(parts, playerId)) {
    parts.marks.blitzBlockUsed.delete(playerId);
    return;
  }
  // A failed Bloodlust is settled first: bite a Thrall or pay for it.
  if (takeUnsatedBloodlust(parts, playerId)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(playerId, "consequences", () =>
        parts.game.finishActivation(playerId)
      )
    );
    return;
  }
  // Charge! free activations end without touching the turn ledger — the
  // player may still activate normally when their team's turn begins.
  if (parts.kickoffEventManager.isChargeActive()) {
    parts.state.activePlayer = null;
    parts.kickoffEventManager.noteChargeActivationEnded(playerId);
    parts.eventBus.emit(GameEventNames.ActionResolved, { playerId });
    return;
  }
  // Stalling: the crowd may pelt a player who could have scored
  if (takeStalling(parts, playerId)) {
    parts.flowManager.add(
      new CrowdTakesActionOperation(playerId, () =>
        parts.game.finishActivation(playerId)
      )
    );
    return;
  }
  parts.marks.crowdRolledFor = null;
  parts.marks.blitzBlockUsed.delete(playerId);
  // Secure the Ball: "this Move Action must finish on a square containing
  // a ball otherwise a Turnover is caused". A pick-up on the ball ends the
  // activation holding it; a failed one has already turned over.
  const securer = parts.game.getPlayerById(playerId);
  const ball = parts.state.ballPosition;
  if (
    isSecuringBall(parts.state, playerId) &&
    !(
      ball &&
      securer?.gridPosition?.x === ball.x &&
      securer.gridPosition.y === ball.y
    )
  ) {
    parts.game.triggerTurnover("Secure the Ball ended off the ball");
  }
  if (parts.state.activePlayer?.id === playerId) {
    // The activation being finalized commits the declaration — a Blitz
    // ended without moving or rolling still spends the team's Blitz.
    parts.playerActionManager.commitAction(playerId);
    parts.state.activePlayer = null;
  }
  parts.turnManager.finishActivation(playerId);
  parts.eventBus.emit(GameEventNames.ActionResolved, { playerId });
}

export function awaitingSecondAction(
  parts: GameParts,
  playerId: string
): boolean {
  return (
    parts.state.activePlayer?.id === playerId &&
    !!parts.state.activePlayer.razzleDazzle?.awaitingSecond
  );
}

/**
 * Razzle-Dazzle (L22): the first of the player's two Actions has ended,
 * so the activation stays open for the second, unless the player can no
 * longer act: down, off the pitch, or the turn is over.
 */
function holdForSecondAction(parts: GameParts, playerId: string): boolean {
  const active = parts.state.activePlayer;
  const razzle = active?.id === playerId ? active.razzleDazzle : undefined;
  const player = parts.game.getPlayerById(playerId);
  if (
    !razzle ||
    razzle.actions.length !== 1 ||
    razzle.awaitingSecond ||
    parts.state.phase !== GamePhase.PLAY ||
    parts.game.isTurnoverInProgress() ||
    player?.status !== PlayerStatus.ACTIVE ||
    !player.gridPosition ||
    // An unsuccessful Secure the Ball must end in a Turnover, not a second Action.
    (isSecuringBall(parts.state, playerId) &&
      !parts.ballManager.hasBall(playerId))
  ) {
    return false;
  }
  parts.playerActionManager.commitAction(playerId);
  razzle.awaitingSecond = true;
  parts.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Razzle-Dazzle: ${player.playerName} may declare a second Action`
  );
  parts.eventBus.emit(GameEventNames.RazzleDazzleSecondAction, { playerId });
  return true;
}

/**
 * Stalling (2025 rulebook p.80), judged as the activation ends: the player
 * held the ball and could score without dice when activated, and has not
 * scored. A Pass or Hand-off that got rid of the ball is not Stalling;
 * putting it down with Fumblerooski is (May 2026 FAQ). A player who
 * Forgoes their activation is judged as they stand. Records the player
 * for the post-game Winnings and returns true once per activation.
 */
function takeStalling(parts: GameParts, playerId: string): boolean {
  if (parts.marks.crowdRolledFor === playerId) return false;
  if (parts.state.phase !== GamePhase.PLAY) return false;
  const player = parts.game.getPlayerById(playerId);
  if (!player?.gridPosition || player.status !== PlayerStatus.ACTIVE) {
    return false;
  }
  const active = parts.state.activePlayer;
  const stalling =
    active?.id === playerId
      ? declaredStalling(parts, active)
      : !parts.game.hasPlayerActed(playerId) &&
        couldScoreWithoutDice(parts, player);
  if (!stalling) return false;
  parts.marks.crowdRolledFor = playerId;
  if (!parts.state.stallingPlayerIds?.includes(playerId)) {
    parts.state.stallingPlayerIds = [
      ...(parts.state.stallingPlayerIds ?? []),
      playerId,
    ];
  }
  return true;
}

/** Stalling since activation, unless a Pass or Hand-off got rid of the ball. */
function declaredStalling(parts: GameParts, active: Declaration): boolean {
  return (
    !!active.stalling &&
    !(
      (active.action === "pass" || active.action === "handoff") &&
      !parts.ballManager.hasBall(active.id)
    )
  );
}

/** Whether this ball carrier could score now without rolling any dice. */
export function couldScoreWithoutDice(
  parts: GameParts,
  player: Player
): boolean {
  return canScoreWithoutDice({
    player,
    state: parts.state,
    players: [...parts.team1.players, ...parts.team2.players],
    side: player.teamId === parts.team1.id ? 1 : 2,
  });
}

/** True once per failed Bloodlust activation; clears the mark. */
export function takeUnsatedBloodlust(
  parts: GameParts,
  playerId: string
): boolean {
  const active = parts.state.activePlayer;
  if (active?.id !== playerId || !active.bloodlustUnsated) return false;
  delete active.bloodlustUnsated;
  return true;
}

/**
 * Bloodlust: "If a player who failed this roll wants to perform a Pass
 * Action, Hand-off Action, or score, then they must bite a Thrall Lineman
 * before they perform the Action or score." Queues the bite ahead of
 * `perform`; refusing leaves the ball where it is.
 */
export function biteBeforeBallAction(
  parts: GameParts,
  playerId: string,
  perform: () => void
): void {
  parts.flowManager.add(
    new BloodlustBiteOperation(playerId, "refuse", (sated) => {
      if (sated) perform();
      else if (parts.state.activePlayer?.id === playerId) {
        parts.state.activePlayer.bloodlustUnsated = true;
      }
    })
  );
}

/**
 * End (or continue) a blocker's activation once their block has fully
 * resolved. A plain Block always ends the activation. A Blitz block does
 * not: while any of the MA+rush budget remains and the blocker is still
 * Standing, the player stays active so the coach can keep moving (and
 * Rush). The normal movement auto-finish ends it once the budget is spent.
 */
export function finishBlockActivation(
  parts: GameParts,
  attackerId: string
): void {
  // The follow-up, if one was offered, is settled either way
  parts.eventBus.emit(GameEventNames.DecisionResolved, { type: "follow-up" });
  // Pile Driver's free Foul comes first, on a Blitz as on a Block.
  if (
    parts.blockManager.offerPileDriver(attackerId, () =>
      parts.game.finishBlockActivation(attackerId)
    )
  ) {
    return;
  }
  const player = parts.game.getPlayerById(attackerId);
  const isBlitz =
    parts.state.activePlayer?.action === "blitz" &&
    parts.state.activePlayer?.id === attackerId;
  if (player && isBlitz && player.status === PlayerStatus.ACTIVE) {
    // The Blitz block's square was charged, and the block marked spent, in
    // rollBlockDice; here we only decide whether the move continues.
    if (
      parts.game.getMovementUsed(attackerId) <
      moveAllowance(withDriveModifiers(player, parts.state))
    ) {
      parts.eventBus.emit(GameEventNames.PlayerMovedInAction, {
        playerId: attackerId,
      });
      // The board picks the blitzer back up for the rest of the move,
      // however the block ended (with or without a follow-up, online too)
      parts.eventBus.emit(GameEventNames.UI_ResumeBlitzMove, {
        playerId: attackerId,
      });
      return;
    }
  }
  // A plain Block ends here — Hit and Run may take a free square first.
  parts.blockManager.endBlockActivation(attackerId);
}

/**
 * A Stab always ends the activation, on a Blitz too. Hit and Run (p.123)
 * covers "a Block Action or a Stab Special Action", so it may take its
 * free square first (FAQ: also when the Stab replaced a Blitz's Block).
 */
export async function finishStabActivation(
  parts: GameParts,
  attackerId: string
): Promise<void> {
  const attacker = parts.game.getPlayerById(attackerId);
  if (attacker && hasSkill(attacker.skills, SkillType.HIT_AND_RUN)) {
    await parts.blockManager.resolveHitAndRun(attackerId);
    return;
  }
  parts.game.finishActivation(attackerId);
}

export function triggerTurnover(parts: GameParts, reason: string): void {
  // Charge! (kickoff 10) runs before the drive begins: a failure there
  // only ends the Charge, never the coming turn. The knockdown itself
  // aborts the sequence via the PlayerKnockedDown subscription.
  if (
    parts.state.phase === GamePhase.KICKOFF ||
    parts.kickoffEventManager.isChargeActive()
  ) {
    return;
  }
  // Only the first turnover of a resolution latches; later failures in the
  // same chain (bounce → dropped catch → …) are absorbed by it.
  const banner = parts.turnManager.checkTurnover(reason);
  if (!banner) return;

  // Let the reaction chain fully settle (ball at rest, armour/injury rolls
  // done), then raise the turnover banner, so it plays after the fall's
  // dice. Give it its moment, then end the turn once. A failed Bloodlust
  // activation cut short still gets its bite.
  parts.flowManager
    .whenIdle()
    .then(() => {
      const playerId = parts.state.activePlayer?.id;
      if (!playerId || !takeUnsatedBloodlust(parts, playerId)) return;
      parts.flowManager.add(
        new BloodlustBiteOperation(playerId, "consequences", () => {})
      );
      return parts.flowManager.whenIdle();
    })
    .then(() => parts.eventBus.emit(GameEventNames.UI_Turnover, banner))
    .then(() => whenSettled(parts))
    .then(async (settled) => {
      // A resync abandoned the choice it waited on: the restored game
      // carries on without this chain.
      if (!settled) return;
      await offerSportsEspionage(parts);
      await whenMomentsComplete(parts.eventBus);
      parts.turnManager.completeTurnover();
    });
}

/**
 * Resolves once the flow is idle and no decision waits for an answer. A
 * roll outside the flow, such as a re-roll offer, can still be waiting when
 * the flow empties, and a second question would be refused. False if a
 * waited-on decision was abandoned instead of answered.
 */
export async function whenSettled(parts: GameParts): Promise<boolean> {
  await parts.flowManager.whenIdle();
  while (parts.decisionService.pending()) {
    if (!(await parts.decisionService.whenClosed())) return false;
    await parts.flowManager.whenIdle();
  }
  return true;
}

/**
 * Sports Espionage (L26): once the Turnover has resolved, the team that
 * suffered it may gain two team re-rolls for the rest of the half. The
 * dice that caused the Turnover are long settled by now. A bounce caught
 * for a touchdown has ended the turn already, so there is no offer then.
 */
async function offerSportsEspionage(parts: GameParts): Promise<void> {
  if (parts.state.phase !== GamePhase.PLAY) return;
  const team = parts.state.activeTeamId
    ? parts.game.getTeam(parts.state.activeTeamId)
    : undefined;
  if (
    !team ||
    !holdsMeasure(parts.state, team.id, DesperateMeasure.SPORTS_ESPIONAGE)
  ) {
    return;
  }
  const playerId = parts.state.activePlayer?.id ?? team.players[0]?.id;
  if (!playerId) return;
  const used = await offerMeasure(
    { gameService: parts.game },
    team.id,
    playerId,
    DesperateMeasure.SPORTS_ESPIONAGE,
    `${team.name} suffered a Turnover — use Sports Espionage for two team re-rolls?`
  );
  if (!used) return;
  parts.state.teamRerollsUsed ??= {};
  parts.state.teamRerollsUsed[team.id] =
    (parts.state.teamRerollsUsed[team.id] ?? 0) - 2;
  parts.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Sports Espionage: ${team.name} gains two team re-rolls`
  );
}
