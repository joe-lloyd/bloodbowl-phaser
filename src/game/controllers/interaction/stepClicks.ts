import { isStandingOpponent } from "./players";
import { withinOneSquare, adjacentTo } from "./squares";
import type { ActionType } from "@/types/events";
import { GameEventNames } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import {
  type BlockReplacement,
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

export interface SquareClick {
  x: number;
  y: number;
  player: Player | null;
}
type StepClick = (
  c: GameplayInteractionController,
  click: SquareClick
) => Promise<void> | void;

export function attack(
{ gameService,kind,attackerId,targetId }: { gameService: IGameService; kind: BlockReplacement|"gaze"; attackerId: string; targetId: string; }): Promise<boolean> {
  return kind === "stab"
    ? gameService.stabPlayer(attackerId, targetId)
    : gameService.performSpecialAction(kind, attackerId, targetId);
}

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

async function clickPassTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  console.log("[Interaction] Attempting pass Execution...");
  if (playerAtSquare?.id === c.selectedPlayerId) {
    return;
  }

  const passer = c.gameService.getPlayerById(c.selectedPlayerId);
  const hailMary =
    !!passer?.gridPosition &&
    hasSkill(passer.skills, SkillType.HAIL_MARY_PASS) &&
    PassController.rangeValue(passer.gridPosition, { x, y }) === null;
  c.isBusy = true;
  let thrown = true;
  try {
    const result = await c.gameService.throwBall({ passerId: c.selectedPlayerId, targetX: x, targetY: y, hailMary: hailMary }
    );

    thrown = result.success;
    if (!thrown) {
      c.eventBus.emit(GameEventNames.UI_Notification, result.result ?? "Pass failed");
    }
  } finally {
    c.isBusy = false;
    if (thrown) c.deselectPlayer();
  }
}

function clickHandoffTarget(
  c: GameplayInteractionController,
  { player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const handerId = c.selectedPlayerId;
  if (!handerId) return;
  if (playerAtSquare?.id === handerId) {
    return;
  }
  const hander = c.gameService.getPlayerById(handerId);
  if (!hander) return;
  if (!playerAtSquare) {
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

function facingTowards(
  from: { x: number; y: number },
  x: number,
  y: number
): { facingX: number; facingY: number } {
  return { facingX: Math.sign(x - from.x), facingY: Math.sign(y - from.y) };
}

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

async function clickMultipleBlockTarget(
  c: GameplayInteractionController,
  { player: target }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  const attacker = c.gameService.getPlayerById(c.selectedPlayerId);
  const adjacent = adjacentTo(attacker?.gridPosition, target?.gridPosition);
  if (
    !isStandingOpponent(attacker, target) || !adjacent
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

function clickBombTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const bomberId = c.selectedPlayerId;
  if (!bomberId) return;
  if (playerAtSquare?.id === bomberId) {
    return;
  }
  return runThenDeselect(c, () => c.gameService.throwBomb(bomberId, x, y));
}

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

function teamMateToThrow(
  thrower: Player | undefined,
  { x, y, player: mate }: SquareClick
): Player | null {
  const adjacent = withinOneSquare(thrower?.gridPosition, { x, y });
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
    await c.gameService.throwTeammate({ throwerId: c.selectedPlayerId, teammateId: c.ttmTeammateId, x: x, y: y }
    );
  } finally {
    c.isBusy = false;
    c.ttmTeammateId = null;
    c.deselectPlayer();
  }
}

function teamMateClickFor(
  c: GameplayInteractionController,
  selectedId: string,
  click: SquareClick
): StepClick | null {
  if (c.ttmTeammateId) return throwTeamMateAt;
  const thrower = c.gameService.getPlayerById(selectedId);
  const mate = teamMateToThrow(thrower, click);
  if (mate)
    return () => {
      pickTeamMate(c, mate);
    };

  return c.currentStepId === "throw" ? askForTeamMate : null;
}

async function clickFoulTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> {
  if (!c.selectedPlayerId) return;
  if (playerAtSquare?.id === c.selectedPlayerId) {
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

      c.targetRollPreview = null;
      c.eventBus.emit(GameEventNames.UI_TargetRollPreview, null);
      if (!fouler || !(await confirmFoul(c, fouler, playerAtSquare))) return;
      committed = true;
      c.clearRollPreviews();
      await c.gameService.foulPlayer(c.selectedPlayerId, x, y);

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

function clickSpecialTarget(
  c: GameplayInteractionController,
  { x, y, player: playerAtSquare }: SquareClick
): Promise<void> | void {
  const mode = c.currentActionMode;
  const attackerId = c.selectedPlayerId;
  if (!mode || !attackerId) return;

  const kind =
    c.currentBlockReplacement ??
    blockReplacementForDirectAction(mode) ??
    "gaze";
  const attacker = c.gameService.getPlayerById(attackerId);
  if (playerAtSquare?.id === attackerId) {
    return;
  }
  const adjacent = withinOneSquare(attacker?.gridPosition, { x, y });
  if (
    isStandingOpponent(attacker, playerAtSquare) && adjacent
  ) {
    return runThenDeselect(c, () =>
      attack({ gameService: c.gameService,kind,attackerId,targetId: playerAtSquare.id })
    );
  }
  c.eventBus.emit(
    GameEventNames.UI_Notification,
    "Target must be an adjacent Standing opponent!"
  );
}

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

function specialTargetStep(c: GameplayInteractionController): StepClick | null {
  const mode = c.currentActionMode;
  if (!mode) return null;
  const special =
    SPECIAL_ACTION_MODES.has(mode) ||
    (mode === "blitz" && c.currentBlockReplacement !== null);
  return special && c.currentStepId === "target" ? clickSpecialTarget : null;
}

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
  return specialTargetStep(c);
}

function aimsAtPassingPlayer(c: GameplayInteractionController): boolean {
  return (c.currentActionMode === "pass" && c.currentStepId === "pass") ||
    (c.currentActionMode === "handoff" && c.currentStepId === "handoff");
}

function boardTakesPlayerClick(c: GameplayInteractionController): boolean {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  if (mode === "foul" || mode === "throwTeamMate") return true;
  if (mode === "multipleBlock") return step === "multipleBlock";
  if (mode === "throwBomb") return step === "bomb";
  return step === "target" && (c.currentBlockReplacement !== null || mode === "gaze");
}

function takesPlayerClick(c: GameplayInteractionController): "pass" | "board" | null {
  if (aimsAtPassingPlayer(c)) return "pass";
  return boardTakesPlayerClick(c) ? "board" : null;
}

export function playerClickTarget(
  c: GameplayInteractionController,
  playerId: string
): { x: number; y: number } | null {
  const takes = takesPlayerClick(c);

  const target =
    takes === "pass"
      ? [...c.scene.team1.players, ...c.scene.team2.players].find(
          (p) => p.id === playerId
        )
      : takes && c.gameService.getPlayerById(playerId);
  if (!target?.gridPosition) return null;
  if (takes === "pass")
    console.log(
      `[Interaction] Target player clicked at ${String(target.gridPosition.x)},${String(target.gridPosition.y)}. Triggering ${String(c.currentActionMode)} onSquareClicked.`
    );
  return target.gridPosition;
}
