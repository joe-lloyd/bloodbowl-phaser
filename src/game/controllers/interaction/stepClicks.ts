/**
 * Pitch clicks while a declared action waits on its own step: the square a
 * Pass, Bomb or Punt aims at, the team-mate a Hand-off or a Throw Team-mate
 * picks, the victim of a Foul or a special attack.
 *
 * Every await sits where onSquareClicked had it before the split. A step
 * that resolves at once stays synchronous, so the command it sends goes
 * out in the same tick as the click.
 */

import type { ActionType } from "@/types/events";
import { GameEventNames } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import {
  BlockReplacement,
  blockReplacementForDirectAction,
} from "@/types/BlockReplacement";
import type { IGameService } from "@/services/interfaces/IGameService";
import { PassController } from "../PassController";
import { handoffTargetRefusalReason } from "../../rules/handoff";
import {
  isRightStuffEligible,
  isThrowTeammateInRange,
} from "../../rules/throwTeammate";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { SPECIAL_ACTION_MODES } from "./actionSteps";
import { confirmFoul } from "./previews";

export type SquareClick = { x: number; y: number; player: Player | null };
type StepClick = (
  c: GameplayInteractionController,
  click: SquareClick
) => Promise<void> | void;

/** The engine call that runs a special attack on an adjacent target. */
export function attack(
  gameService: IGameService,
  kind: BlockReplacement | "gaze",
  attackerId: string,
  targetId: string
): Promise<boolean> {
  return kind === "stab"
    ? gameService.stabPlayer(attackerId, targetId)
    : gameService.performSpecialAction(kind, attackerId, targetId);
}

/**
 * Hold the board while an action's command runs, then let the player go:
 * the action is over whether it worked or not.
 */
async function runThenDeselect(
  c: GameplayInteractionController,
  command: () => Promise<unknown>
): Promise<void> {
  c.isBusy = true;
  try {
    await command();
  } finally {
    c.isBusy = false;
    c.deselectPlayer();
  }
}

// PASS Execution (aiming step): a Pass targets any square on the Range
// Ruler, thrown via PassOperation.
async function clickPassTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  console.log("[Interaction] Attempting pass Execution...");
  if (playerAtSquare && playerAtSquare.id === c.selectedPlayerId) {
    return;
  }
  // The browser has no Hail Mary toggle yet: a passer with the skill
  // throws one only at a square beyond the Range Ruler.
  const passer = c.gameService.getPlayerById(c.selectedPlayerId);
  const hailMary =
    !!passer?.gridPosition &&
    hasSkill(passer.skills, SkillType.HAIL_MARY_PASS) &&
    PassController.rangeValue(passer.gridPosition, { x, y }) === null;
  c.isBusy = true;
  let thrown = true;
  try {
    const result = await c.gameService.throwBall(
      c.selectedPlayerId,
      x,
      y,
      hailMary
    );
    // A refused target (a Long Pass in a Blizzard) keeps the aim open.
    thrown = result.success;
    if (!thrown) {
      c.eventBus.emit(GameEventNames.UI_Notification, result.result);
    }
  } finally {
    c.isBusy = false;
    if (thrown) c.deselectPlayer();
  }
}

// HAND-OFF Execution (target-selection step): a Hand-off never aims —
// only a click on a legal team-mate resolves it, through handOffBall
// (a target id, never a square). Empty squares and illegal targets are
// ignored (refused by reason), never thrown.
function clickHandoffTarget(
  c: GameplayInteractionController,
  { player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const handerId = c.selectedPlayerId;
  if (!handerId) return;
  if (playerAtSquare && playerAtSquare.id === handerId) {
    return;
  }
  const hander = c.gameService.getPlayerById(handerId);
  if (!hander) return;
  if (!playerAtSquare) {
    // Empty square: nothing happens (no throw, no scatter).
    return;
  }
  const reason = handoffTargetRefusalReason(hander, playerAtSquare);
  if (reason) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      `Cannot hand off to ${playerAtSquare.playerName}: ${reason}.`
    );
    return;
  }
  return runThenDeselect(c, () =>
    c.gameService.handOffBall(handerId, playerAtSquare.id)
  );
}

/** The compass facing from a player towards a clicked square. */
function facingTowards(
  from: { x: number; y: number },
  x: number,
  y: number
): { facingX: number; facingY: number } {
  return { facingX: Math.sign(x - from.x), facingY: Math.sign(y - from.y) };
}

// PUNT: click a square to choose the Throw-in Template facing.
function clickPuntFacing(
  c: GameplayInteractionController,
  { x, y }: SquareClick
): Promise<void> | void {
  const punterId = c.selectedPlayerId;
  if (!punterId) return;
  const punter = c.gameService.getPlayerById(punterId);
  if (!punter?.gridPosition) return;
  const { facingX, facingY } = facingTowards(punter.gridPosition, x, y);
  if (facingX === 0 && facingY === 0) return;
  return runThenDeselect(c, () =>
    c.gameService.puntBall(punterId, facingX, facingY)
  );
}

// MULTIPLE BLOCK: select two different adjacent Standing opponents.
async function clickMultipleBlockTarget(
  c: GameplayInteractionController,
  { player: target }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  const attacker = c.gameService.getPlayerById(c.selectedPlayerId);
  const adjacent =
    !!attacker?.gridPosition &&
    !!target?.gridPosition &&
    Math.max(
      Math.abs(attacker.gridPosition.x - target.gridPosition.x),
      Math.abs(attacker.gridPosition.y - target.gridPosition.y)
    ) === 1;
  if (
    !attacker ||
    !target ||
    target.teamId === attacker.teamId ||
    target.status !== PlayerStatus.ACTIVE ||
    !adjacent
  ) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Select an adjacent Standing opponent."
    );
    return;
  }
  if (!c.multipleBlockFirstTargetId) {
    c.multipleBlockFirstTargetId = target.id;
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "First target selected — choose a different adjacent opponent."
    );
    return;
  }
  if (c.multipleBlockFirstTargetId === target.id) return;
  c.isBusy = true;
  try {
    await c.gameService.multipleBlock(
      c.selectedPlayerId,
      c.multipleBlockFirstTargetId,
      target.id
    );
  } finally {
    c.isBusy = false;
    c.multipleBlockFirstTargetId = null;
    c.deselectPlayer();
  }
}

// THROW BOMB Execution (Bombardier): click any square to lob the bomb.
function clickBombTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const bomberId = c.selectedPlayerId;
  if (!bomberId) return;
  if (playerAtSquare && playerAtSquare.id === bomberId) {
    return;
  }
  return runThenDeselect(c, () => c.gameService.throwBomb(bomberId, x, y));
}

// BALL & CHAIN Execution (Fanatic): the click picks a facing — a cardinal
// direction (an End Zone or a Sideline) — and the Fanatic lurches one
// square. UI_ResumeBallAndChain picks it back up for the next.
function clickSwingFacing(
  c: GameplayInteractionController,
  { x, y }: SquareClick
): Promise<void> | void {
  const fanaticId = c.selectedPlayerId;
  if (!fanaticId) return;
  const fanatic = c.gameService.getPlayerById(fanaticId);
  if (!fanatic?.gridPosition) return;
  const { facingX, facingY } = facingTowards(fanatic.gridPosition, x, y);
  if (facingX === 0 && facingY === 0) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Click a square in the direction to swing."
    );
    return;
  }
  return runThenDeselect(c, () =>
    c.gameService.ballAndChain(fanaticId, facingX, facingY)
  );
}

/** The adjacent Standing Right-Stuff team-mate this click picks, if any. */
function teamMateToThrow(
  thrower: Player | undefined,
  { x, y, player: mate }: SquareClick
): Player | null {
  const adjacent =
    !!thrower?.gridPosition &&
    Math.abs(thrower.gridPosition.x - x) <= 1 &&
    Math.abs(thrower.gridPosition.y - y) <= 1;
  const validTarget =
    !!mate &&
    !!thrower &&
    mate.id !== thrower.id &&
    mate.teamId === thrower.teamId &&
    mate.status === PlayerStatus.ACTIVE &&
    adjacent &&
    isRightStuffEligible(mate);
  return validTarget ? mate : null;
}

/** A valid team-mate is picked, and the stepper moves on to aiming. */
function pickTeamMate(c: GameplayInteractionController, mate: Player): void {
  c.ttmTeammateId = mate.id;
  if (c.currentStepId !== "throw") {
    c.currentStepId = "throw";
    c.eventBus.emit(GameEventNames.UI_UpdateActionSteps, {
      steps: c.actionSteps,
      currentStepId: c.currentStepId,
    });
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    `Aim ${mate.playerName}'s throw — click a Quick/Short-range square.`
  );
}

function askForTeamMate(c: GameplayInteractionController): void {
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Select an adjacent Right Stuff team-mate (ST 3 or less)!"
  );
}

// A team-mate has been chosen — this click is the aim square.
async function throwTeamMateAt(
  c: GameplayInteractionController,
  { x, y }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId || !c.ttmTeammateId) return;
  const thrower = c.gameService.getPlayerById(c.selectedPlayerId);
  if (
    thrower?.gridPosition &&
    !isThrowTeammateInRange(thrower.gridPosition, { x, y })
  ) {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Out of range — a team-mate can only be thrown to Quick or Short range!"
    );
    return;
  }
  c.isBusy = true;
  try {
    await c.gameService.throwTeammate(
      c.selectedPlayerId,
      c.ttmTeammateId,
      x,
      y
    );
  } finally {
    c.isBusy = false;
    c.ttmTeammateId = null;
    c.deselectPlayer();
  }
}

// THROW / KICK TEAM-MATE: clicking a valid target team-mate (adjacent,
// Standing, Right-Stuff) selects it as the throw target and jumps to the
// aim step — even directly from the Move step, so a direct click on the
// target works without first switching to the Throw step. Once a target
// is chosen, the next click aims at a Quick/Short-range square.
function teamMateClickFor(
  c: GameplayInteractionController,
  selectedId: string,
  click: SquareClick
): StepClick | null {
  if (c.ttmTeammateId) return throwTeamMateAt;
  const thrower = c.gameService.getPlayerById(selectedId);
  const mate = teamMateToThrow(thrower, click);
  if (mate) return () => pickTeamMate(c, mate);
  // No valid target on this square. In the aim step tell the coach what
  // to click; in the Move step let the click fall through to movement.
  return c.currentStepId === "throw" ? askForTeamMate : null;
}

// FOUL Execution. A Foul may move first, so during the Move step an empty
// square still falls through to movement — but a click on ANY player is
// claimed here, at either step. Without that, a coach who declared a Foul
// and went straight for the victim (still on the Move step) fell through
// to the implicit-Block path and got the block dice dialog instead.
async function clickFoulTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  if (playerAtSquare && playerAtSquare.id === c.selectedPlayerId) {
    return;
  }

  if (
    playerAtSquare &&
    (playerAtSquare.status === PlayerStatus.PRONE ||
      playerAtSquare.status === PlayerStatus.STUNNED)
  ) {
    c.isBusy = true;
    let committed = false;
    try {
      const fouler = c.gameService.getPlayerById(c.selectedPlayerId);
      // The confirm repeats the hover card, so only the assist rings stay
      c.targetRollPreview = null;
      c.eventBus.emit(GameEventNames.UI_TargetRollPreview, null);
      if (!fouler || !(await confirmFoul(c, fouler, playerAtSquare))) return;
      committed = true;
      c.clearRollPreviews();
      await c.gameService.foulPlayer(c.selectedPlayerId, x, y);
      // foulPlayer only queues FoulOperation on GameService's own
      // GameFlowManager (fire-and-forget); wait for that queue to fully
      // drain — including any KO/Casualty/Send-Off consequence it
      // triggers — before clearing the red target highlight, so it
      // doesn't disappear before the foul has actually resolved.
      await c.gameService.getFlowContext().flowManager.whenIdle();
    } finally {
      c.isBusy = false;
      if (committed) c.deselectPlayer();
    }
  } else {
    c.eventBus.emit(
      GameEventNames.UI_Notification,
      "Target must be Prone or Stunned!"
    );
  }
}

// SPECIAL ACTION Execution, including an explicitly declared Blitz
// replacement retained through movement.
function clickSpecialTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const mode = c.currentActionMode;
  const attackerId = c.selectedPlayerId;
  if (!mode || !attackerId) return;
  // Every special mode but Hypnotic Gaze replaces a Block
  const kind =
    c.currentBlockReplacement ??
    blockReplacementForDirectAction(mode) ??
    "gaze";
  const attacker = c.gameService.getPlayerById(attackerId);
  if (playerAtSquare && playerAtSquare.id === attackerId) {
    return;
  }
  const adjacent =
    !!attacker?.gridPosition &&
    Math.abs(attacker.gridPosition.x - x) <= 1 &&
    Math.abs(attacker.gridPosition.y - y) <= 1;
  if (
    playerAtSquare &&
    attacker &&
    playerAtSquare.teamId !== attacker.teamId &&
    playerAtSquare.status === PlayerStatus.ACTIVE &&
    adjacent
  ) {
    return runThenDeselect(c, () =>
      attack(c.gameService, kind, attackerId, playerAtSquare.id)
    );
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Target must be an adjacent Standing opponent!"
  );
}

/** Steps that take every pitch click while they are the current step. */
const AIMING_STEPS: Partial<
  Record<ActionType, { step: string; click: StepClick }>
> = {
  pass: { step: "pass", click: clickPassTarget },
  handoff: { step: "handoff", click: clickHandoffTarget },
  punt: { step: "punt", click: clickPuntFacing },
  multipleBlock: { step: "multipleBlock", click: clickMultipleBlockTarget },
  throwBomb: { step: "bomb", click: clickBombTarget },
  ballAndChain: { step: "swing", click: clickSwingFacing },
};

/**
 * The handler of the declared action's step, when that step claims this
 * click. Null leaves the click to the Blitz's Block step or to the plain
 * pitch rules: select, block or move.
 */
export function stepClickFor(
  c: GameplayInteractionController,
  click: SquareClick
): StepClick | null {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  const selectedId = c.selectedPlayerId;
  if (!mode || !selectedId) return null;
  const aiming = AIMING_STEPS[mode];
  if (aiming) return aiming.step === step ? aiming.click : null;
  if (mode === "throwTeamMate") return teamMateClickFor(c, selectedId, click);
  if (mode === "foul") {
    return step === "foul" || click.player ? clickFoulTarget : null;
  }
  const special =
    SPECIAL_ACTION_MODES.has(mode) ||
    (mode === "blitz" && c.currentBlockReplacement !== null);
  return special && step === "target" ? clickSpecialTarget : null;
}

/**
 * Whether a click on a player is a target click for the current step, so
 * it goes to that square rather than selecting the player. Only a click
 * on a player standing on the pitch counts.
 */
function takesPlayerClick(
  c: GameplayInteractionController
): "pass" | "board" | null {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  // CRITICAL FIX: while aiming a targeted throw at a team-mate — a Pass or
  // a Hand-off — clicking a player MUST be treated as a TARGET click that
  // completes the action, never a re-selection of the clicked team-mate.
  if (
    (mode === "pass" && step === "pass") ||
    (mode === "handoff" && step === "handoff")
  )
    return "pass";
  const claims =
    // A Foul claims player clicks at either step (see onSquareClicked) so
    // the victim can be picked without first advancing the stepper.
    mode === "foul" ||
    (mode === "multipleBlock" && step === "multipleBlock") ||
    // Throw Bomb: clicking a player aims the bomb at their square.
    (mode === "throwBomb" && step === "bomb") ||
    // Throw / Kick Team-mate: the grid handler selects a valid target
    // team-mate (auto-advancing to the aim step) or aims once one is
    // chosen — never a plain re-selection.
    mode === "throwTeamMate" ||
    // Direct Special Actions and replacement Blitzes take target clicks.
    (step === "target" &&
      (c.currentBlockReplacement !== null || mode === "gaze"));
  return claims ? "board" : null;
}

/**
 * The square a click on this player targets, when the current step takes
 * player clicks as targets rather than selecting the player.
 */
export function playerClickTarget(
  c: GameplayInteractionController,
  playerId: string
): { x: number; y: number } | null {
  const takes = takesPlayerClick(c);
  // A Pass or Hand-off finds its target among the teams on the pitch
  const target =
    takes === "pass"
      ? [...c.scene.team1.players, ...c.scene.team2.players].find(
          (p) => p.id === playerId
        )
      : takes && c.gameService.getPlayerById(playerId);
  if (!target || !target.gridPosition) return null;
  if (takes === "pass")
    console.log(
      `[Interaction] Target player clicked at ${target.gridPosition.x},${target.gridPosition.y}. Triggering ${c.currentActionMode} onSquareClicked.`
    );
  return target.gridPosition;
}
