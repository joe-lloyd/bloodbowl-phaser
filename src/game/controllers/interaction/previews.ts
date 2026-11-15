/**
 * What hovering a square shows before a click: the hover card's rolls for
 * a Block, Foul, Pass or Hand-off target, and the aim, path or targets the
 * current step draws on the pitch. Nothing here sends a command.
 */

import { GameEventNames, StepPrompt } from "@/types/events";
import { Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { GameConfig } from "@/config/GameConfig";
import { weatherEffects } from "../../rules/weather";
import { withDriveModifiers } from "../../kickoff/driveEffects";
import { jumpTargets, JumpTarget } from "../../rules/jump";
import { legalHandoffTargets } from "../../rules/handoff";
import { isThrowTeammateInRange } from "../../rules/throwTeammate";
import { rollLabel } from "../../rules/rollTargets";
import {
  foulPreview,
  blockPreviewLines,
  catchTarget,
  interceptPreviewLine,
  passTarget,
  TargetRollPreview,
} from "../../rules/rollPreview";
import { BlockValidator } from "../../validators/BlockValidator";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { foulRequest } from "./Confirmations";
import { drawPath } from "./routes";

type Square = { x: number; y: number };

/** Every legal Jump (over → landing) for the selected player right now. */
export function computeJumpTargets(
  c: GameplayInteractionController,
  player: Player
): JumpTarget[] {
  const from = player.gridPosition;
  if (!from || player.status !== PlayerStatus.ACTIVE) return [];
  const others = [
    ...c.getSceneTeam1().players,
    ...c.getSceneTeam2().players,
  ].filter((p) => p.id !== player.id && p.gridPosition);
  const canJumpAnything =
    hasSkill(player.skills, SkillType.LEAP) ||
    hasSkill(player.skills, SkillType.POGO);
  const inBounds = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < GameConfig.PITCH_WIDTH &&
    y < GameConfig.PITCH_HEIGHT;
  return jumpTargets(from, others, canJumpAnything, inBounds);
}

function foulPreviewFor(
  c: GameplayInteractionController,
  fouler: Player,
  target: Player
) {
  return foulPreview(
    fouler,
    target,
    [...c.getSceneTeam1().players, ...c.getSceneTeam2().players],
    c.gameService.getState()
  );
}

export function confirmFoul(
  c: GameplayInteractionController,
  fouler: Player,
  target: Player
): Promise<boolean> {
  const foul = foulPreviewFor(c, fouler, target);
  return c.confirmations.ask("foul", foulRequest(fouler, foul));
}

// PASS MODE: Visualize even if hovering a player. A thrown Bomb aims like
// a Pass — same range template + arrow.
function drawThrowAim(
  c: GameplayInteractionController,
  selectedId: string,
  x: number,
  y: number
): void {
  c.pitch.clearPath(); // Ensure movement path is gone

  const selectedPlayer = c.gameService.getPlayerById(selectedId);
  if (selectedPlayer && selectedPlayer.gridPosition) {
    // Draw pass zones
    const ranges = c.passController.getAllRanges(
      selectedPlayer.gridPosition,
      weatherEffects(c.gameService.getState().weather).passTypes
    );
    c.pitch.drawPassZones(ranges);

    // Draw pass line to cursor
    const passRange = c.passController.measureRange(
      selectedPlayer.gridPosition,
      { x, y }
    );
    c.pitch.drawPassLine(selectedPlayer.gridPosition, { x, y }, passRange.type);

    // Preview the interception corridor for a throw at this square: the
    // whole zone a defender could intercept from, plus the squares where
    // a standing opponent actually threatens the throw.
    const opponents = c.gameService.getOpponents(selectedPlayer.teamId);
    const zone = c.passController.getInterceptionSquares(
      selectedPlayer.gridPosition,
      { x, y }
    );
    const threats = c.passController
      .checkInterceptions(
        selectedPlayer.gridPosition,
        { x, y },
        opponents,
        true
      )
      .map((i) => i.position);
    c.pitch.drawInterceptZone(
      selectedPlayer.gridPosition,
      { x, y },
      zone,
      threats
    );
  }
}

// HAND-OFF MODE: highlight the legal team-mates. No Range Ruler, pass
// line, or interception preview — a Hand-off never aims.
function drawHandoffAim(
  c: GameplayInteractionController,
  selectedId: string
): void {
  c.pitch.clearPath();
  c.pitch.clearPassVisualization();
  const selectedPlayer = c.gameService.getPlayerById(selectedId);
  if (selectedPlayer) {
    const teammates = c.gameService.getTeammates(selectedPlayer.id);
    const targets = legalHandoffTargets(selectedPlayer, teammates).flatMap(
      (t) => (t.gridPosition ? [t.gridPosition] : [])
    );
    c.pitch.drawHandoffTargets(targets);
  }
}

// THROW TEAM-MATE aim: reuse the pass arrow + range template, but capped
// to Quick and Short range (a thrown player is too heavy to go further —
// Long / Long Bomb are out of range).
function drawTeamMateAim(
  c: GameplayInteractionController,
  selectedId: string,
  x: number,
  y: number
): void {
  c.pitch.clearPath();
  const thrower = c.gameService.getPlayerById(selectedId);
  if (!thrower?.gridPosition) return;
  if (!c.ttmTeammateId) {
    // No mate chosen yet: no target highlight, just clear stale viz.
    c.pitch.clearPassVisualization();
    return;
  }
  // A mate is chosen: show the throw template + arrow to the cursor.
  const all = c.passController.getAllRanges(thrower.gridPosition);
  const limited = new Map<string, { x: number; y: number }[]>();
  for (const type of ["Quick Pass", "Short Pass"] as const) {
    const squares = all.get(type);
    if (squares) limited.set(type, squares);
  }
  c.pitch.drawPassZones(limited);

  const inRange = isThrowTeammateInRange(thrower.gridPosition, { x, y });
  const passRange = c.passController.measureRange(thrower.gridPosition, {
    x,
    y,
  });
  // In range → colour by Quick/Short; out of range → grey arrow.
  c.pitch.drawPassLine(
    thrower.gridPosition,
    { x, y },
    inRange ? passRange.type : "Out of Range"
  );
}

// FOUL MODE: Highlight valid targets, redrawn on every hover. A foul in
// flight keeps its victim's square until it resolves.
function drawFoulTargets(
  c: GameplayInteractionController,
  selectedId: string
): void {
  if (c.isBusy) return;
  c.pitch.clearPath();
  c.pitch.clearLayer("highlight");
  const selectedPlayer = c.gameService.getPlayerById(selectedId);
  const from = selectedPlayer?.gridPosition;
  if (!selectedPlayer || !from) return;
  const opponents = c.gameService.getOpponents(selectedPlayer.teamId);
  for (const p of opponents) {
    if (!p.gridPosition) continue;
    const dx = Math.abs(p.gridPosition.x - from.x);
    const dy = Math.abs(p.gridPosition.y - from.y);
    const downed =
      p.status === PlayerStatus.PRONE || p.status === PlayerStatus.STUNNED;
    if (dx <= 1 && dy <= 1 && downed) {
      c.pitch.highlightSquare(p.gridPosition.x, p.gridPosition.y, 0xff0000);
    }
  }
}

// JUMP MODE: show every legal landing at once (lines + end nodes + amber
// jump-over nodes); no free walking path.
function drawJumpAim(
  c: GameplayInteractionController,
  selectedId: string
): void {
  c.pitch.clearPassVisualization();
  const selectedPlayer = c.gameService.getPlayerById(selectedId);
  if (selectedPlayer?.gridPosition) {
    c.pitch.drawJumpTargets(
      selectedPlayer.gridPosition,
      computeJumpTargets(c, selectedPlayer)
    );
  } else {
    c.pitch.clearPath();
  }
}

/** What a click on this square would do: its rolls, path or throw. */
export function previewSquare(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  // 1. Highlight Square Cursor
  c.pitch.highlightHoverSquare(x, y);
  updateTargetPreview(c, x, y);

  // 2. Visualization
  const selectedId = c.selectedPlayerId;
  if (!selectedId) {
    c.pitch.clearPath();
    c.pitch.clearPassVisualization();
    return;
  }
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  if (
    (mode === "pass" && step === "pass") ||
    (mode === "throwBomb" && step === "bomb")
  ) {
    drawThrowAim(c, selectedId, x, y);
  } else if (mode === "handoff" && step === "handoff") {
    drawHandoffAim(c, selectedId);
  } else if (mode === "throwTeamMate" && step === "throw") {
    drawTeamMateAim(c, selectedId, x, y);
  } else if (mode === "foul" && step === "foul") {
    drawFoulTargets(c, selectedId);
  } else if (c.jumpTargeting) {
    drawJumpAim(c, selectedId);
  } else {
    // MOVE MODE: Only visualize if NOT hovering a player
    c.pitch.clearPassVisualization();

    if (!c.getPlayerAt(x, y)) {
      drawPath(c, x, y);
    } else {
      c.pitch.clearPath();
    }
  }
}

function ringAssists(
  c: GameplayInteractionController,
  ours: Player[],
  theirs: Player[]
): void {
  c.pitch.drawAssistRings(
    ours.flatMap((p) => (p.gridPosition ? [p.gridPosition] : [])),
    theirs.flatMap((p) => (p.gridPosition ? [p.gridPosition] : []))
  );
}

function blockTargetPreview(
  c: GameplayInteractionController,
  actor: Player,
  target: Player,
  square: Square,
  adjacent: boolean
): TargetRollPreview {
  const analysis = new BlockValidator().analyzeBlock(
    actor,
    target,
    [...c.getSceneTeam1().players, ...c.getSceneTeam2().players],
    c.gameService.getState().activeTeamId
  );
  const preview = {
    square,
    lines: blockPreviewLines(analysis, actor, target, "attacker"),
    danger: analysis.isUphill,
  };
  if (!adjacent)
    preview.lines.push("At current positions. Move into reach to block.");
  ringAssists(c, analysis.attackerAssists, analysis.defenderAssists);
  return preview;
}

function foulTargetPreview(
  c: GameplayInteractionController,
  actor: Player,
  target: Player,
  square: Square
): TargetRollPreview {
  const foul = foulPreviewFor(c, actor, target);
  ringAssists(
    c,
    foul.analysis.offensiveAssists,
    foul.analysis.defensiveAssists
  );
  return { square, lines: foul.lines, danger: true };
}

/** Each opponent who could intercept a throw at this square, with its roll. */
function interceptions(
  c: GameplayInteractionController,
  actor: Player,
  from: Square,
  square: Square,
  opponents: Player[]
): { lines: string[]; rolls: { square: Square; target: number }[] } {
  const weather = c.gameService.getState().weather;
  const passingTeam = [actor, ...c.gameService.getTeammates(actor.id)];
  const lines: string[] = [];
  const rolls: { square: Square; target: number }[] = [];
  for (const attempt of c.passController.checkInterceptions(
    from,
    square,
    opponents,
    true
  )) {
    const interceptor = c.gameService.getPlayerById(attempt.playerId);
    if (!interceptor) continue;
    if (
      hasSkill(actor.skills, SkillType.CLOUD_BURSTER) &&
      !hasSkill(interceptor.skills, SkillType.VERY_LONG_LEGS)
    )
      continue;
    const { line, accurate } = interceptPreviewLine(
      interceptor,
      passingTeam,
      weather
    );
    lines.push(line);
    if (interceptor.gridPosition)
      rolls.push({ square: interceptor.gridPosition, target: accurate });
  }
  return { lines, rolls };
}

function throwTargetPreview(
  c: GameplayInteractionController,
  actor: Player,
  from: Square,
  target: Player,
  square: Square,
  opponents: Player[]
): { preview: TargetRollPreview; aim: StepPrompt } {
  const state = c.gameService.getState();
  const passer = withDriveModifiers(actor, state);
  const receiver = withDriveModifiers(target, state);
  const handoff = c.currentActionMode === "handoff";
  const range = c.passController.measureRange(from, square);
  const throwNeeds = passTarget(passer, opponents, state.weather, range);
  const catchNeeds = catchTarget(
    receiver,
    opponents,
    state.weather,
    handoff ? "handoff" : "pass"
  );
  const lines = handoff ? [] : [rollLabel(range.type, throwNeeds)];
  lines.push(rollLabel("Catch", catchNeeds));
  // Online, the other coach sees the pass being aimed, read-only
  const aimRolls: StepPrompt["rolls"] = handoff
    ? [{ type: "catch", target: catchNeeds }]
    : [
        { type: "pass", target: throwNeeds },
        { type: "catch", target: catchNeeds },
      ];
  const intercepts = handoff
    ? { lines: [], rolls: [] }
    : interceptions(c, actor, from, square, opponents);
  lines.push(...intercepts.lines);
  c.pitch.drawInterceptionRolls(intercepts.rolls);
  return {
    preview: { square, lines, danger: false },
    aim: { playerId: actor.id, rolls: aimRolls },
  };
}

/** A Pass or a Hand-off is aiming at a team-mate. */
function aimingAtTeamMate(c: GameplayInteractionController): boolean {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  return (
    (mode === "pass" && step === "pass") ||
    (mode === "handoff" && step === "handoff")
  );
}

/** The hover card's rolls for a click on `target`, and the aim to share. */
function targetPreview(
  c: GameplayInteractionController,
  actor: Player,
  from: Square,
  target: Player,
  square: Square
): { preview: TargetRollPreview | null; aim: StepPrompt | null } {
  const mode = c.currentActionMode;
  const opponent = target.teamId !== actor.teamId;
  const adjacent =
    Math.max(Math.abs(from.x - square.x), Math.abs(from.y - square.y)) === 1;
  const downed =
    target.status === PlayerStatus.PRONE ||
    target.status === PlayerStatus.STUNNED;
  const blocking =
    (mode === "block" || mode === "blitz") && !c.currentBlockReplacement;
  if (blocking && opponent && target.status === PlayerStatus.ACTIVE) {
    const preview = blockTargetPreview(c, actor, target, square, adjacent);
    return { preview, aim: null };
  }
  if (mode === "foul" && adjacent && opponent && downed) {
    return { preview: foulTargetPreview(c, actor, target, square), aim: null };
  }
  if (!opponent && aimingAtTeamMate(c)) {
    const opponents = c.gameService.getOpponents(actor.teamId);
    return throwTargetPreview(c, actor, from, target, square, opponents);
  }
  return { preview: null, aim: null };
}

export function updateTargetPreview(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  // A prompt or an action is in flight: keep what the coach is reading
  if (c.isBusy) return;
  c.targetRollPreview = null;
  c.targetAnchor = null;
  c.eventBus.emit(GameEventNames.UI_TargetRollPreview, null);
  c.pitch.clearLayer("assist_ring");
  c.pitch.clearLayer("intercept_roll_label");
  c.eventBus.emit(GameEventNames.UI_RoutePreview, null);
  if (!c.selectedPlayerId) return;
  const actor = c.gameService.getPlayerById(c.selectedPlayerId);
  const target = c.getPlayerAt(x, y);
  const from = actor?.gridPosition;
  if (!actor || !from || !target || target.id === actor.id) return;
  const { preview, aim } = targetPreview(c, actor, from, target, { x, y });
  c.targetRollPreview = preview;
  c.publishTargetPreview();
  c.eventBus.emit(GameEventNames.UI_PassAimed, aim);
}
