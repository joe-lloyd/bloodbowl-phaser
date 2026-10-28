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
import { getActiveOnlineMatch } from "../../src/network/OnlineMatch";

let game: HeadlessGame | null = null;
let kickingTeamId: string | null = null;
let answered: unknown = null;
const rng = createCoachRng(7);

function attach(): HeadlessGame {
  const c = ServiceContainer.getInstance();
  // Online, the guest's service forwards every mutation to the host; read
  // its local replica instead so enumerating moves never sends anything.
  const gs = ((c.gameService as unknown as { inner?: unknown }).inner ??
    c.gameService) as Record<string, unknown>;
  const teams = getActiveOnlineMatch()?.teams;
  game = new HeadlessGame({
    autoStartOnReady: false,
    ctx: {
      eventBus: c.eventBus,
      gameService: gs as never,
      rng: c.rngService,
      team1: (teams?.team1 ?? gs.team1) as never,
      team2: (teams?.team2 ?? gs.team2) as never,
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
  // Online, the match knows the decision both sides are waiting on.
  const online = getActiveOnlineMatch();
  if (online && g.snapshot().phase === GamePhase.GAME_OVER)
    return { over: true };
  if (online) {
    held.pending = online.pendingDecision() as never;
    if (!online.mayAct()) return { over: false, waiting: true };
  }
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
      // A crowd square in the corner sits under the dugout panel, where
      // the driver's click cannot reach it
      if (
        c.type === "choose-push-direction" &&
        ((c as { y?: number }).y! < 0 ||
          (c as { y?: number }).y! >= GameConfig.PITCH_HEIGHT)
      )
        return score - 50;
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

/** Online: both coaches' seed commitments and the seed they derive. */
export async function probeSeed(code: string) {
  const { fetchLobby, seedFor } = await import("../../src/firebase/lobby");
  const lobby = await fetchLobby(code);
  if (!lobby) return { error: "no lobby" };
  return {
    commits: Object.keys(lobby.seedCommits ?? {}).length,
    reveals: Object.keys(lobby.seedReveals ?? {}).length,
    seed: await seedFor(lobby).catch((error: Error) => error.message),
  };
}

/** Online: may this page's coach act now? Locally one page plays both teams. */
export function mayAct(): boolean {
  return getActiveOnlineMatch()?.mayAct() ?? true;
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

/** Where the canvas draws each player and the ball, as pitch squares. */
export function view() {
  type Sprite = { x: number; y: number; angle: number; visible: boolean };
  const scene = (
    window as unknown as {
      game?: { scene: { getScene(key: string): Record<string, unknown> } };
    }
  ).game?.scene.getScene("GameScene") as
    | {
        playerSprites?: Map<string, Sprite>;
        ballSprite?: Sprite | null;
        getPitch?: () => {
          getPixelPosition(x: number, y: number): { x: number; y: number };
        };
      }
    | undefined;
  const pitch = scene?.getPitch?.();
  if (!scene?.playerSprites || !pitch) return null;
  const a = pitch.getPixelPosition(0, 0);
  const b = pitch.getPixelPosition(1, 1);
  const square = (sprite: Sprite) => {
    const x = Math.round((sprite.x - a.x) / (b.x - a.x));
    const y = Math.round((sprite.y - a.y) / (b.y - a.y));
    const onPitch =
      sprite.visible &&
      x >= 0 &&
      y >= 0 &&
      x < GameConfig.PITCH_WIDTH &&
      y < GameConfig.PITCH_HEIGHT;
    return onPitch ? `${x},${y}` : "off";
  };
  const players: Record<string, string> = {};
  scene.playerSprites.forEach((sprite, id) => {
    players[id] = square(sprite) + (sprite.angle !== 0 ? " down" : "");
  });
  const ball = scene.ballSprite ? square(scene.ballSprite) : "none";
  // The scoreboard has no test id; its header reads MATCH.
  const header = [...document.querySelectorAll("span")].find(
    (span) => span.textContent === "MATCH"
  );
  const hud = (header?.parentElement?.parentElement?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return { players, ball, hud };
}

/**
 * A strip along the bottom of the page for the recording: which side this
 * is, this machine's clock to the millisecond, and whether this coach may
 * act. Two recordings line up by the clock; the strip shows whose move it is.
 */
export function installOverlay(label: string) {
  const id = "bb-recording-strip";
  document.getElementById(id)?.remove();
  const strip = document.createElement("div");
  strip.id = id;
  strip.style.cssText =
    "position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:99999;" +
    "font:600 22px/1.2 ui-monospace,Menlo,monospace;padding:6px 16px;border-radius:8px;" +
    "background:rgba(5,8,14,0.88);color:#e6e1d6;border:2px solid #444;pointer-events:none";
  document.body.appendChild(strip);
  const tick = () => {
    if (!strip.isConnected) return;
    const match = getActiveOnlineMatch();
    const acting = match?.mayAct() ?? false;
    const now = new Date();
    const clock = `${now.toLocaleTimeString("en-GB")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
    strip.textContent = `${label}  ${clock}  ${acting ? "YOUR MOVE" : "WAITING"}`;
    strip.style.borderColor = acting ? "#3fbf6a" : "#c9a227";
    strip.style.color = acting ? "#9cf0b4" : "#f1d27a";
    requestAnimationFrame(tick);
  };
  tick();
}
