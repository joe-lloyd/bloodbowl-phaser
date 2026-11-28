import { fixtureValue } from "../../src/testing/fixtureValue";
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
import { hasTackleZone } from "../../src/types/Player";
import { withDriveModifiers } from "../../src/game/kickoff/driveEffects";
import { scoresAt } from "../../src/game/rules/frames";
import { pairFrame } from "../../src/game/variants/activeMatch";
import { seatedTeams } from "../../src/game/seating";

let game: HeadlessGame | null = null;
let kickingTeamId: string | null = null;
let answered: unknown = null;
const rng = createCoachRng(7);

function attach(): HeadlessGame {
  const c = ServiceContainer.getInstance();

  const gs = ((c.gameService as unknown as { inner?: unknown }).inner ??
    c.gameService) as Record<string, unknown>;
  const online = getActiveOnlineMatch()?.teams;
  const teams = online ?? c.gameService.getTeams();
  game = new HeadlessGame({
    autoStartOnReady: false,
    ctx: {
      eventBus: c.eventBus,
      gameService: gs as never,
      rng: c.rngService,
      teams: seatedTeams(teams),
      seed: 0,
      matchStats: c.matchStats,
    },
  });
  return game;
}

const DIALOG_DECISIONS = new Set([
  "reroll",
  "reaction",
  "follow-up",
  "block-dice",
]);

export async function next(dialogOpen = false) {
  const g = game ?? attach();

  const held = g as unknown as { pending: { type: string } | null };
  if (!dialogOpen && held.pending && DIALOG_DECISIONS.has(held.pending.type))
    held.pending = null;

  const online = getActiveOnlineMatch();
  if (online && g.snapshot().phase === GamePhase.GAME_OVER)
    return { over: true };
  if (online) {
    held.pending = online.pendingDecision();
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

  const ball = snapshot.ballPosition;
  const players = [...g.ctx.teams[0].players, ...g.ctx.teams[1].players];
  const carrier = ball
    ? players.find(
        (p) => p.gridPosition?.x === ball.x && p.gridPosition?.y === ball.y
      )
    : undefined;
  const toGoal = (teamId: string, x: number) =>
    teamId === g.ctx.teams[0].id ? GameConfig.PITCH_WIDTH - 1 - x : x;
  const scores = rankCandidates({ game: g, snapshot, point, rng }).map(
    ({ candidate, score }) => {
      const c = candidate.commands[0] as {
        type: string;
        action?: string;
        playerId?: string;
        path?: { x: number; y: number }[];
      };

      if (
        c.type === "move" &&
        carrier &&
        c.playerId === carrier.id &&
        c.path?.length
      ) {
        const to = c.path.at(-1);
        if (
          toGoal(carrier.teamId, fixtureValue(to).x) <
          toGoal(carrier.teamId, fixtureValue(carrier.gridPosition).x)
        )
          return score + 25;
      }

      if (
        c.type === "choose-push-direction" &&
        (fixtureValue((c as { y?: number }).y) < 0 ||
          fixtureValue((c as { y?: number }).y) >= GameConfig.PITCH_HEIGHT)
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
  for (const [i, score] of scores.entries()) {
    if (score > fixtureValue(scores[best])) best = i;
  }
  const choice = { index: best };
  heuristicCoach;
  const top = point.candidates
    .map((c, i) => `${fixtureValue(scores[i]).toFixed(1)} ${c.label}`)
    .sort((a, b) => Number.parseFloat(b) - Number.parseFloat(a))
    .slice(0, 4);
  const candidate = runTo(
    g,
    fixtureValue(point.candidates[choice.index] ?? point.candidates[0])
  );
  return {
    over: false,
    phase: snapshot.phase,
    subPhase: snapshot.subPhase,
    pending: point.pending,
    teamId: point.teamId,
    candidate,
    team1Id: g.ctx.teams[0].id,
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
      ball: g.ctx.gameService.getState().balls[0].at,
      n: point.candidates.length,
      top,
    },
  };
}

interface Candidate {
  kind: string;
  label: string;
  commands: Record<string, unknown>[];
}
interface Square {
  x: number;
  y: number;
}
const chebyshev = (a: Square, b: Square) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function runTo(g: HeadlessGame, c: Candidate): Candidate {
  const cmd = c.commands[0] as {
    type: string;
    playerId?: string;
    path?: Square[];
  };
  if (cmd.type !== "move" || cmd.path?.length !== 1 || !cmd.playerId) return c;
  const gs = g.ctx.gameService;
  const state = gs.getState();
  const player = gs.getPlayerById(cmd.playerId);
  const at = player?.gridPosition;
  if (!player || !at) return c;
  const step = cmd.path[0];
  const opponents = gs
    .getOpponents(player.teamId)
    .filter((o) => o.gridPosition && hasTackleZone(o));
  const marked = (sq: Square) =>
    opponents.some((o) => chebyshev(fixtureValue(o.gridPosition), sq) === 1);
  const ball = state.balls[0].at;
  const onBall = (sq: Square) => !!ball && ball.x === sq.x && ball.y === sq.y;
  const carrying = onBall(at);
  if (marked(fixtureValue(step)) || onBall(fixtureValue(step))) return c;

  const left =
    withDriveModifiers(player, state).stats.MA - gs.getMovementUsed(player.id);
  const frame = pairFrame(player.teamId === g.ctx.teams[0].id);
  const scores = (sq: Square) => carrying && scoresAt(frame, sq);
  const reach = gs
    .getAvailableMovements(player.id)
    .filter((sq) => (sq.cost ?? 99) <= left || scores(sq));

  const pickup = !carrying && reach.find((element) => onBall(element));
  const dir = { x: fixtureValue(step).x - at.x, y: fixtureValue(step).y - at.y };
  const gain = (sq: Square) =>
    (scores(sq) ? 100 : 0) +
    (sq.x - at.x) * dir.x +
    (sq.y - at.y) * dir.y -
    (marked(sq) ? 3 : 0);
  let dest = pickup;
  if (!dest) {
    dest = fixtureValue(step);
    for (const sq of reach) {
      if (gain(sq) > gain(dest)) dest = sq;
    }
  }
  if (dest.x === fixtureValue(step).x && dest.y === fixtureValue(step).y) return c;
  return {
    ...c,
    label: `${c.label.replace(/ steps to .*/, "")} runs to (${String(dest.x)},${String(dest.y)})`,
    commands: [{ ...cmd, path: [{ x: dest.x, y: dest.y }] }],
  };
}

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

export function clearPending() {
  const held = game as unknown as { pending: unknown } | null;
  if (held && held.pending === answered) held.pending = null;
}

export function view() {
  interface Sprite {
    x: number;
    y: number;
    angle: number;
    visible: boolean;
  }
  const scene: | {
        playerSprites?: Map<string, Sprite>;
        ballSprite?: Sprite | null;
        getPitch?: () => {
          getPixelPosition(x: number, y: number): { x: number; y: number };
        };
      }
    | undefined = (
    globalThis as unknown as {
      game?: { scene: { getScene(key: string): Record<string, unknown> } };
    }
  ).game?.scene.getScene("GameScene");
  const pitch = scene?.getPitch?.();
  if (!scene?.playerSprites || !pitch) return null;

  const centres: { x: number; y: number; key: string }[] = [];
  for (let x = 0; x < GameConfig.PITCH_WIDTH; x++)
    for (let y = 0; y < GameConfig.PITCH_HEIGHT; y++) {
      const p = pitch.getPixelPosition(x, y);
      centres.push({ x: p.x, y: p.y, key: `${String(x)},${String(y)}` });
    }
  const near = pitch.getPixelPosition(1, 0);
  const origin = pitch.getPixelPosition(0, 0);
  const tile = Math.hypot(near.x - origin.x, near.y - origin.y);
  const square = (sprite: Sprite) => {
    if (!sprite.visible) return "off";
    let best = centres[0];
    let bestDistance = Infinity;
    for (const c of centres) {
      const d = Math.hypot(c.x - sprite.x, c.y - sprite.y);
      if (!(d < bestDistance)) {
        continue;
      }

      bestDistance = d;
      best = c;
    }
    return bestDistance <= tile * 0.6 ? fixtureValue(best).key : "off";
  };
  const players: Record<string, string> = {};
  scene.playerSprites.forEach((sprite, id) => {
    players[id] = square(sprite) + (sprite.angle === 0 ? "" : " down");
  });
  const ball = scene.ballSprite ? square(scene.ballSprite) : "none";
  const scoreboard = document.querySelector('[data-testid="scoreboard"]');
  const hud = (scoreboard?.textContent ?? "").replaceAll(/\s+/g, " ").trim();
  return { players, ball, hud };
}

export function installOverlay(label: string) {
  const id = "bb-recording-strip";
  document.querySelector(`#${id}`)?.remove();
  const strip = document.createElement("div");
  strip.id = id;
  strip.style.cssText =
    "position:fixed;left:50%;bottom:6px;transform:translateX(-50%);z-index:99999;" +
    "font:600 22px/1.2 ui-monospace,Menlo,monospace;padding:6px 16px;border-radius:8px;" +
    "background:rgba(5,8,14,0.88);color:#e6e1d6;border:2px solid #444;pointer-events:none";
  document.body.append(strip);
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

export async function stateDump() {
  const { stateChecksum } = await import("../../src/headless/checksum");
  const g = game ?? attach();
  return {
    checksum: stateChecksum(g),
    snapshot: g.snapshot(),
    pending: g.pendingDecision(),
    rng: g.ctx.rng.captureState(),
    stats: g.ctx.matchStats.captureState(),
  };
}
