/**
 * Runs inside the page (served by Vite dev). Watches the live engine with a
 * passive HeadlessGame and asks the simulation's heuristic coach what to do.
 * It never executes a command: the Playwright driver performs the choice
 * through the real UI.
 */
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import {
  heuristicCoach,
  rankCandidates,
} from "../../src/simulation/coaches/heuristic";
import { createCoachRng } from "../../src/simulation/rng";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameConfig } from "../../src/config/GameConfig";

let game: HeadlessGame | null = null;
let kickingTeamId: string | null = null;
let answered: unknown = null;
const rng = createCoachRng(7);

function attach(): HeadlessGame {
  const c = ServiceContainer.getInstance();
  const gs = c.gameService as unknown as Record<string, unknown>;
  game = new HeadlessGame({
    autoStartOnReady: false,
    ctx: {
      eventBus: c.eventBus,
      gameService: c.gameService as never,
      rng: c.rngService,
      team1: gs.team1 as never,
      team2: gs.team2 as never,
      seed: 0,
      matchStats: c.matchStats,
    },
  });
  return game;
}

/** Decisions the browser asks with a modal dialog rather than the board. */
const DIALOG_DECISIONS = new Set([
  "reroll",
  "reaction",
  "follow-up",
  "block-dice",
]);

export async function next(dialogOpen = false) {
  const g = game ?? attach();
  // A passive observer only clears `pending` on its own execute(), so once
  // the HUD has answered a dialog its copy goes stale.
  const held = g as unknown as { pending: { type: string } | null };
  if (!dialogOpen && held.pending && DIALOG_DECISIONS.has(held.pending.type))
    held.pending = null;
  answered = held.pending;
  const snapshot = g.snapshot();
  if (snapshot.subPhase === SubPhase.SETUP_KICKING)
    kickingTeamId = snapshot.activeTeamId;
  if (snapshot.phase === GamePhase.GAME_OVER) return { over: true };
  const point = await enumerateDecision(g, kickingTeamId);
  if (point.candidates.length === 0)
    return {
      over: false,
      phase: snapshot.phase,
      subPhase: snapshot.subPhase,
      pending: point.pending,
      candidate: null,
    };
  // The sim's heuristic coach never steps into a tackle zone it can avoid, so
  // two cautious coaches rarely meet. Push it toward contact so a single
  // recorded match shows blocks, injuries and turnovers.
  const ball = snapshot.ballPosition;
  const players = [...g.ctx.team1.players, ...g.ctx.team2.players];
  const carrier = ball
    ? players.find(
        (p) => p.gridPosition?.x === ball.x && p.gridPosition?.y === ball.y
      )
    : undefined;
  const toGoal = (teamId: string, x: number) =>
    teamId === g.ctx.team1.id ? GameConfig.PITCH_WIDTH - 1 - x : x;
  const scores = rankCandidates({ game: g, snapshot, point, rng }).map(
    (score, i) => {
      const c = point.candidates[i].commands[0] as {
        type: string;
        action?: string;
        playerId?: string;
        path?: { x: number; y: number }[];
      };
      // ...and make the carrier run for the line, dodging if it has to.
      if (
        c.type === "move" &&
        carrier &&
        c.playerId === carrier.id &&
        c.path?.length
      ) {
        const to = c.path[c.path.length - 1];
        if (
          toGoal(carrier.teamId, to.x) <
          toGoal(carrier.teamId, carrier.gridPosition!.x)
        )
          return score + 25;
      }
      if (c.type === "declare-action" && c.action === "blitz")
        return score + 40;
      if (c.type === "declare-action" && c.action === "block")
        return score + 30;
      if (c.type === "block") return score + 30;
      return score;
    }
  );
  let best = 0;
  scores.forEach((score, i) => {
    if (score > scores[best]) best = i;
  });
  const choice = { index: best };
  void heuristicCoach;
  const top = point.candidates
    .map((c, i) => `${scores[i].toFixed(1)} ${c.label}`)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .slice(0, 4);
  const candidate = point.candidates[choice.index] ?? point.candidates[0];
  return {
    over: false,
    phase: snapshot.phase,
    subPhase: snapshot.subPhase,
    pending: point.pending,
    teamId: point.teamId,
    candidate,
    team1Id: g.ctx.team1.id,
    board: JSON.stringify([
      snapshot.activePlayer,
      snapshot.ballPosition,
      snapshot.activeTeamId,
      snapshot.turn.turnNumber,
      held.pending?.type,
      snapshot.teams.map((t) =>
        t.players.map((p) => [p.position?.x, p.position?.y, p.status])
      ),
    ]),
    debug: {
      ball: g.ctx.gameService.getState().ballPosition,
      n: point.candidates.length,
      top,
    },
  };
}

export function noteKicker(teamId: string) {
  kickingTeamId = teamId;
}

export function reset() {
  game = null;
  kickingTeamId = null;
}

/** Forget the decision the HUD just answered (see `next`). */
export function clearPending() {
  // Only the decision just answered: a chain push raises a fresh one while
  // the first is being resolved.
  const held = game as unknown as { pending: unknown } | null;
  if (held && held.pending === answered) held.pending = null;
}
