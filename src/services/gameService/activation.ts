import { kickoffTurnOf } from "@/game/kickoff/kickRecord";
import { activationRolling, awaitingDeclaration } from "@/game/rules/awaitingDeclaration";
import { actFirstBlocks } from "@/game/inducements/potionHooks";
import type { Team } from "@/types/Team";
import { groundBall } from "@/game/rules/balls";
import { whenMomentsComplete } from "@/game/presentation/momentQueue";
import { type GameState, GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { isSecuringBall } from "@/game/rules/secureBall";
import { FinishBallAndChainSquare } from "@/game/operations/BallAndChainOperation";
import { BloodlustBiteOperation } from "@/game/operations/BloodlustBiteOperation";
import { CrowdTakesActionOperation } from "@/game/operations/CrowdTakesActionOperation";
import { canScoreWithoutDice } from "@/game/rules/stalling";
import { everyone, seatOf } from "@/game/seating";
import { moveAllowance } from "@/game/skills/movement";
import {
  holdsMeasure,
  offerMeasure,
} from "@/game/inducements/matchInducements";
import { DesperateMeasure } from "@/game/inducements/desperateMeasures";
import {
  SwarmOfRatsOperation,
  ratsCanStrike,
} from "@/game/kickoff/driveHazards";
import {
  missesThisTurn,
  withDriveModifiers,
} from "@/game/kickoff/driveEffects";
import { ActivationValidator } from "@/game/validators/ActivationValidator";
import type { GameParts } from "./parts";

type Declaration = NonNullable<GameState["activePlayer"]>;

const activationValidator = new ActivationValidator();

export function canActivate(parts: GameParts, playerId: string): boolean {
  const player = parts.game.getPlayerById(playerId);
  if (!player) return false;

  const { team } = seatOf(parts.seating, player.teamId);
  return (
    activationValidator.canActivate(player, parts.state.turn) &&
    !missesThisTurn(player, parts.state, parts.state.turn.turnNumber) &&
    !actFirstBlocks(parts.state, player, team.players)
  );
}

export function hasPlayerActed(parts: GameParts, playerId: string): boolean {
  return parts.state.turn.activatedPlayerIds.has(playerId);
}

export function endTurn(parts: GameParts): void {
  if (parts.turnManager.isTurnoverInProgress()) return;

  const live = parts.state.activePlayer;
  if (live && takeUnsatedBloodlust(parts, live.id)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(live.id, "consequences", () => {
        parts.game.endTurn();
      })
    );
    return;
  }

  if (live && takeStalling(parts, live.id)) {
    parts.flowManager.add(
      new CrowdTakesActionOperation(live.id, () => {
        parts.game.endTurn();
      })
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
  const square = parts.marks.ballAndChainSquare;
  if (square?.fanaticId === playerId) {
    parts.marks.ballAndChainSquare = null;
    parts.flowManager.add(new FinishBallAndChainSquare(square));
    return;
  }

  if (holdForSecondAction(parts, playerId)) {
    delete parts.state.activePlayer?.blitzBlockUsed;
    return;
  }

  if (takeUnsatedBloodlust(parts, playerId)) {
    parts.flowManager.add(
      new BloodlustBiteOperation(playerId, "consequences", () => {
        parts.game.finishActivation(playerId);
      })
    );
    return;
  }

  finishRemainingActivation(parts, playerId);
}

function finishRemainingActivation(parts: GameParts, playerId: string): void {
  if (takeStalling(parts, playerId)) {
    parts.flowManager.add(
      new CrowdTakesActionOperation(playerId, () => {
        parts.game.finishActivation(playerId);
      })
    );
    return;
  }
  parts.marks.crowdRolledFor = null;

  checkSecureBallEnd(parts, playerId);
  if (parts.state.activePlayer?.id === playerId) {
    parts.playerActionManager.commitAction(playerId);
    parts.state.activePlayer = null;
  }
  parts.turnManager.finishActivation(playerId);
  parts.eventBus.emit(GameEventNames.ActionResolved, { playerId });
  const player = parts.game.getPlayerById(playerId);
  if (player && ratsCanStrike(parts.state, player)) {
    parts.flowManager.add(new SwarmOfRatsOperation(playerId));
  }
}

export function awaitingSecondAction(
  parts: GameParts,
  playerId: string
): boolean {
  return (
    awaitingDeclaration(parts.state, playerId) ||
    activationRolling(parts.state, playerId)
  );
}

function holdForSecondAction(parts: GameParts, playerId: string): boolean {
  const active = parts.state.activePlayer;
  const razzle = active?.id === playerId ? active.razzleDazzle : undefined;
  const player = standingPlayer(parts, playerId);
  if (
    razzle?.actions.length !== 1 ||
    razzle.awaitingSecond ||
    parts.state.phase !== GamePhase.PLAY ||
    parts.game.isTurnoverInProgress() ||
    !player ||
    cannotCompleteSecureBall(parts, playerId)
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

function takeStalling(parts: GameParts, playerId: string): boolean {
  if (parts.marks.crowdRolledFor === playerId) return false;
  if (parts.state.phase !== GamePhase.PLAY) return false;
  const player = standingPlayer(parts, playerId);
  if (!player) {
    return false;
  }
  const active = parts.state.activePlayer;
  const stalling =
    active?.id === playerId
      ? declaredStalling(parts, active)
      : !parts.game.hasPlayerActed(playerId) &&
        couldScoreWithoutDice(parts, player);
  if (!stalling) return false;
  recordStalling(parts, playerId);
  return true;
}

function declaredStalling(parts: GameParts, active: Declaration): boolean {
  return (
    !!active.stalling &&
    (!(active.action === "pass" || active.action === "handoff") || parts.ballManager.hasBall(active.id))
  );
}

export function couldScoreWithoutDice(
  parts: GameParts,
  player: Player
): boolean {
  return canScoreWithoutDice({
    player,
    state: parts.state,
    players: everyone(parts.seating),
    frame: seatOf(parts.seating, player.teamId).frame,
  });
}

export function takeUnsatedBloodlust(
  parts: GameParts,
  playerId: string
): boolean {
  const active = parts.state.activePlayer;
  if (active?.id !== playerId || !active.bloodlustUnsated) return false;
  delete active.bloodlustUnsated;
  return true;
}

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

export function finishBlockActivation(
  parts: GameParts,
  attackerId: string
): void {
  parts.eventBus.emit(GameEventNames.DecisionResolved, { type: "follow-up" });

  if (
    parts.blockManager.offerPileDriver(attackerId, () => {
      parts.game.finishBlockActivation(attackerId);
    })
  ) {
    return;
  }
  const player = parts.game.getPlayerById(attackerId);
  const isBlitz =
    parts.state.activePlayer?.action === "blitz" &&
    parts.state.activePlayer.id === attackerId;
  if (player && isBlitz && player.status === PlayerStatus.ACTIVE &&
      parts.game.getMovementUsed(attackerId) <
      moveAllowance(withDriveModifiers(player, parts.state))
    ) {
      parts.eventBus.emit(GameEventNames.PlayerMovedInAction, {
        playerId: attackerId,
      });

      parts.eventBus.emit(GameEventNames.UI_ResumeBlitzMove, {
        playerId: attackerId,
      });
      return;
    }

  parts.blockManager.endBlockActivation(attackerId);
}

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
  if (parts.state.phase === GamePhase.KICKOFF && !kickoffTurnOf(parts.state)) {
    return;
  }

  const banner = parts.turnManager.checkTurnover(reason);
  if (!banner) return;

  void parts.flowManager
    .whenIdle()
    .then(() => {
      const playerId = parts.state.activePlayer?.id;
      if (!playerId || !takeUnsatedBloodlust(parts, playerId)) return;
      parts.flowManager.add(
        new BloodlustBiteOperation(playerId, "consequences", () => undefined)
      );
      return parts.flowManager.whenIdle();
    })
    .then(() => {
      parts.eventBus.emit(GameEventNames.UI_Turnover, banner);
    })
    .then(() => whenSettled(parts))
    .then(async (settled) => {
      if (!settled) return;
      await offerSportsEspionage(parts);
      await whenMomentsComplete(parts.eventBus);
      parts.turnManager.completeTurnover();
    });
}

export async function whenSettled(parts: GameParts): Promise<boolean> {
  await parts.flowManager.whenIdle();
  while (parts.decisionService.pending()) {
    if (!(await parts.decisionService.whenClosed())) return false;
    await parts.flowManager.whenIdle();
  }
  return true;
}

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
  grantEspionageRerolls(parts, team);
}

function grantEspionageRerolls(parts: GameParts, team: Team): void {
  parts.state.teamRerollsUsed ??= {};
  parts.state.teamRerollsUsed[team.id] =
    (parts.state.teamRerollsUsed[team.id] ?? 0) - 2;
  parts.eventBus.emit(
    GameEventNames.UI_GameLog,
    `Sports Espionage: ${team.name} gains two team re-rolls`
  );
}

function checkSecureBallEnd(parts: GameParts, playerId: string): void {
  const securer = parts.game.getPlayerById(playerId);
  const ball = groundBall(parts.state);
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
}

function recordStalling(parts: GameParts, playerId: string): void {
  parts.marks.crowdRolledFor = playerId;
  if (!parts.state.stallingPlayerIds?.includes(playerId)) {
    parts.state.stallingPlayerIds = [
      ...(parts.state.stallingPlayerIds ?? []),
      playerId,
    ];
  }
}

function standingPlayer(
  parts: GameParts,
  playerId: string
): Player | undefined {
  const player = parts.game.getPlayerById(playerId);
  return player?.gridPosition && player.status === PlayerStatus.ACTIVE
    ? player
    : undefined;
}

function cannotCompleteSecureBall(parts: GameParts, playerId: string): boolean {
  return (
    isSecuringBall(parts.state, playerId) &&
    !parts.ballManager.hasBall(playerId)
  );
}
