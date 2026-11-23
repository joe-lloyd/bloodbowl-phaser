import { GameEventNames, type StepPrompt } from "@/types/events";
import { type Player, PlayerStatus } from "@/types/Player";
import { SkillType, hasSkill } from "@/types/Skills";
import { weatherEffects } from "../../rules/weather";
import { legalJumpTargets, type JumpTarget } from "../../rules/jump";
import { legalHandoffTargets } from "../../rules/handoff";
import { isThrowTeammateInRange } from "../../rules/throwTeammate";
import { rollLabel } from "../../rules/rollTargets";
import {
  foulPreview,
  blockPreviewLines,
  bombInterceptPreviewLine,
  interceptPreviewLine,
  type TargetRollPreview,
} from "../../rules/rollPreview";
import { BlockValidator } from "../../validators/BlockValidator";
import type { GameplayInteractionController } from "../GameplayInteractionController";
import { drawPath } from "./routes";
import { boardWith, currentFinish, plannedActor } from "./plan";
import { throwNeeds } from "./planSummary";

interface Square {
  x: number;
  y: number;
}

function plannedPlayer(c: GameplayInteractionController, id: string): Player | undefined {
  const player = c.gameService.getPlayerById(id);
  return player ? plannedActor(c, player) : undefined;
}

export function computeJumpTargets(
  c: GameplayInteractionController,
  player: Player
): JumpTarget[] {
  const from = player.gridPosition;
  if (!from || player.status !== PlayerStatus.ACTIVE) return [];
  return legalJumpTargets(player, from, [...c.getSceneTeam1().players, ...c.getSceneTeam2().players]);
}

function foulPreviewFor(
  c: GameplayInteractionController,
  fouler: Player,
  target: Player
) {
  return foulPreview(fouler, target, boardWith(c, fouler), c.gameService.getState());
}

function drawThrowAim(
{ c,selectedId,x,y }: { c: GameplayInteractionController; selectedId: string; x: number; y: number; }): void {
  c.pitch.clearPath();

  const selectedPlayer = plannedPlayer(c, selectedId);
  if (selectedPlayer?.gridPosition) {
    const ranges = c.passController.getAllRanges(
      selectedPlayer.gridPosition,
      weatherEffects(c.gameService.getState().weather).passTypes
    );
    c.pitch.drawPassZones(ranges);

    const passRange = c.passController.measureRange(
      selectedPlayer.gridPosition,
      { x, y }
    );
    c.pitch.drawPassLine(selectedPlayer.gridPosition, { x, y }, passRange.type);

    const opponents = c.gameService.getOpponents(selectedPlayer.teamId);
    const zone = c.passController.getInterceptionSquares(
      selectedPlayer.gridPosition,
      { x, y }
    );
    const threats = c.passController
      .checkInterceptions(
        { from: selectedPlayer.gridPosition,target: { x,y },opponents,isAccurate: true }      )
      .map((i) => i.position);
    c.pitch.drawInterceptZone(selectedPlayer.gridPosition, { x, y }, { zoneSquares: zone, threatSquares: threats }
    );
  }
}

function drawHandoffAim(
  c: GameplayInteractionController,
  selectedId: string
): void {
  c.pitch.clearPath();
  c.pitch.clearPassVisualization();
  const selectedPlayer = plannedPlayer(c, selectedId);
  if (selectedPlayer) {
    const teammates = c.gameService.getTeammates(selectedPlayer.id);
    const targets = legalHandoffTargets(selectedPlayer, teammates).flatMap(
      (t) => (t.gridPosition ? [t.gridPosition] : [])
    );
    c.pitch.drawHandoffTargets(targets);
  }
}

function drawTeamMateAim(
{ c,selectedId,x,y }: { c: GameplayInteractionController; selectedId: string; x: number; y: number; }): void {
  c.pitch.clearPath();
  const thrower = c.gameService.getPlayerById(selectedId);
  if (!thrower?.gridPosition) return;
  if (!c.ttmTeammateId) {
    c.pitch.clearPassVisualization();
    return;
  }

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

  c.pitch.drawPassLine(
    thrower.gridPosition,
    { x, y },
    inRange ? passRange.type : "Out of Range"
  );
}

const DOWNED_STATUSES = new Set<PlayerStatus>([PlayerStatus.PRONE, PlayerStatus.STUNNED]);

function drawFoulTargets(
  c: GameplayInteractionController,
  selectedId: string
): void {
  if (c.isBusy) return;
  c.pitch.clearPath();
  c.pitch.clearLayer("highlight");
  const selectedPlayer = plannedPlayer(c, selectedId);
  const from = selectedPlayer?.gridPosition;
  if (!selectedPlayer || !from) return;
  const opponents = c.gameService.getOpponents(selectedPlayer.teamId);
  for (const p of opponents) {
    if (!p.gridPosition) continue;
    const dx = Math.abs(p.gridPosition.x - from.x);
    const dy = Math.abs(p.gridPosition.y - from.y);
    const downed = DOWNED_STATUSES.has(p.status);
    if (dx <= 1 && dy <= 1 && downed) {
      c.pitch.highlightSquare({ x: p.gridPosition.x, y: p.gridPosition.y }, 0xff0000);
    }
  }
}

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

function drawThrowStep(input: { c: GameplayInteractionController; selectedId: string; x: number; y: number }): boolean {
  const { c, selectedId, x, y } = input;
  const pass = c.currentActionMode === "pass" && c.currentStepId === "pass";
  const bomb = c.currentActionMode === "throwBomb" && c.currentStepId === "bomb";
  if (!pass && !bomb) return false;
  drawThrowAim({ c, selectedId, x, y });
  return true;
}

function drawActionAim(input: Parameters<typeof drawThrowStep>[0]): boolean {
  const { c, selectedId, x, y } = input;
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  if (mode === "pass" || mode === "throwBomb") return drawThrowStep({ c, selectedId, x, y });
  if (mode === "handoff" && step === "handoff") { drawHandoffAim(c, selectedId); return true; }
  if (mode === "throwTeamMate" && step === "throw") { drawTeamMateAim({ c, selectedId, x, y }); return true; }
  if (mode === "foul" && step === "foul") { drawFoulTargets(c, selectedId); return true; }
  return false;
}

export function previewSquare(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  c.pitch.highlightHoverSquare(x, y);
  updateTargetPreview(c, x, y);

  const selectedId = c.selectedPlayerId;
  if (!selectedId) {
    c.pitch.clearPath();
    c.pitch.clearPassVisualization();
    return;
  }
  const aim = currentFinish(c) ?? { x, y };
  if (drawActionAim({ c, selectedId, x: aim.x, y: aim.y })) return;
  if (c.jumpTargeting) { drawJumpAim(c, selectedId); return; }
  c.pitch.clearPassVisualization();
  if (!c.getPlayerAt(x, y)) drawPath(c, x, y);
  else c.pitch.clearPath();
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
{ c,actor,target,square,adjacent }: { c: GameplayInteractionController; actor: Player; target: Player; square: Square; adjacent: boolean; }): TargetRollPreview {
  const analysis = new BlockValidator().analyzeBlock({ attacker: actor, defender: target, allPlayers: boardWith(c, actor), activeTeamId: c.gameService.getState().activeTeamId });
  const preview = {
    square,
    lines: blockPreviewLines(analysis, actor, target, "attacker"),
    danger: analysis.isUphill,
  };
  if (!adjacent)
    preview.lines.push("Click to plan a route next to them.");
  ringAssists(c, analysis.attackerAssists, analysis.defenderAssists);
  return preview;
}

function foulTargetPreview(
{ c,actor,target,square }: { c: GameplayInteractionController; actor: Player; target: Player; square: Square; }): TargetRollPreview {
  const foul = foulPreviewFor(c, actor, target);
  ringAssists(
    c,
    foul.analysis.offensiveAssists,
    foul.analysis.defensiveAssists
  );
  return { square, lines: foul.lines, danger: true };
}

export function interceptions(
{ c,actor,from,square,opponents,bomb = false }: { c: GameplayInteractionController; actor: Player; from: Square; square: Square; opponents: Player[]; bomb?: boolean }): { lines: string[]; rolls: { square: Square; target: number }[] } {
  const state = c.gameService.getState();
  const passingTeam = [actor, ...c.gameService.getTeammates(actor.id)];
  const lines: string[] = [];
  const rolls: { square: Square; target: number }[] = [];
  for (const attempt of c.passController.checkInterceptions(
    { from,target: square,opponents,isAccurate: true }  )) {
    const interceptor = c.gameService.getPlayerById(attempt.playerId);
    if (!interceptor) continue;
    if (
      !bomb &&
      hasSkill(actor.skills, SkillType.CLOUD_BURSTER) &&
      !hasSkill(interceptor.skills, SkillType.VERY_LONG_LEGS)
    )
      continue;
    const { line, accurate } = bomb
      ? bombInterceptPreviewLine(interceptor, passingTeam)
      : interceptPreviewLine(interceptor, passingTeam, state);
    lines.push(line);
    if (interceptor.gridPosition)
      rolls.push({ square: interceptor.gridPosition, target: accurate });
  }
  return { lines, rolls };
}

function throwTargetPreview(
{ c,actor,from,target,square,opponents }: { c: GameplayInteractionController; actor: Player; from: Square; target: Player; square: Square; opponents: Player[]; }): { preview: TargetRollPreview; aim: StepPrompt } {
  const handoff = c.currentActionMode === "handoff";
  const needs = throwNeeds(c, { passer: actor, receiver: target, square, handoff, bomb: false });
  const catchNeeds = needs.catch ?? 6;
  const lines = handoff ? [] : [rollLabel(needs.range.type, needs.pass)];
  lines.push(rollLabel("Catch", catchNeeds));

  const aimRolls: StepPrompt["rolls"] = handoff
    ? [{ type: "catch", target: catchNeeds }]
    : [
        { type: "pass", target: needs.pass },
        { type: "catch", target: catchNeeds },
      ];
  const intercepts = handoff
    ? { lines: [], rolls: [] }
    : interceptions({ c,actor,from,square,opponents });
  lines.push(...intercepts.lines);
  c.pitch.drawInterceptionRolls(intercepts.rolls);
  return {
    preview: { square, lines, danger: false },
    aim: { playerId: actor.id, rolls: aimRolls },
  };
}

function aimingAtTeamMate(c: GameplayInteractionController): boolean {
  const mode = c.currentActionMode;
  const step = c.currentStepId;
  return (
    (mode === "pass" && step === "pass") ||
    (mode === "handoff" && step === "handoff")
  );
}

function isBlockAim(c: GameplayInteractionController, actor: Player, target: Player): boolean {
  const mode = c.currentActionMode;
  return (mode === "block" || mode === "blitz") && !c.currentBlockReplacement
    && target.teamId !== actor.teamId && target.status === PlayerStatus.ACTIVE;
}

function targetPreview(
{ c,actor,from,target,square }: { c: GameplayInteractionController; actor: Player; from: Square; target: Player; square: Square; }): { preview: TargetRollPreview | null; aim: StepPrompt | null } {
  const mode = c.currentActionMode;
  const opponent = target.teamId !== actor.teamId;
  const adjacent =
    Math.max(Math.abs(from.x - square.x), Math.abs(from.y - square.y)) === 1;
  const downed =
    target.status === PlayerStatus.PRONE ||
    target.status === PlayerStatus.STUNNED;
  if (isBlockAim(c, actor, target)) {
    const preview = blockTargetPreview({ c,actor,target,square,adjacent });
    return { preview, aim: null };
  }
  if (mode === "foul" && adjacent && opponent && downed) {
    return { preview: foulTargetPreview({ c,actor,target,square }), aim: null };
  }
  if (!opponent && aimingAtTeamMate(c)) {
    const opponents = c.gameService.getOpponents(actor.teamId);
    return throwTargetPreview({ c,actor,from,target,square,opponents });
  }
  return { preview: null, aim: null };
}

function updateTargetPreview(
  c: GameplayInteractionController,
  x: number,
  y: number
): void {
  if (c.isBusy) return;
  c.targetRollPreview = null;
  c.targetAnchor = null;
  c.eventBus.emit(GameEventNames.UI_TargetRollPreview, null);
  c.pitch.clearLayer("assist_ring");
  c.pitch.clearLayer("intercept_roll_label");
  c.eventBus.emit(GameEventNames.UI_RoutePreview, null);
  if (!c.selectedPlayerId) return;
  const actor = plannedPlayer(c, c.selectedPlayerId);
  const target = c.getPlayerAt(x, y);
  const from = actor?.gridPosition;
  if (!actor || !from || !target || target.id === actor.id) return;
  const { preview, aim } = targetPreview({ c,actor,from,target,square: { x,y } });
  c.targetRollPreview = preview;
  c.publishTargetPreview();
  c.eventBus.emit(GameEventNames.UI_PassAimed, aim);
}
