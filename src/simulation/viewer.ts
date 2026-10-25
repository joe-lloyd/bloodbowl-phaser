/**
 * Match viewer: turns a recording into one self-contained HTML page that
 * plays the match back on a drawn pitch, step by step, with the dice and
 * the play-by-play. Needs no server, no engine and no network to open.
 */

import * as fs from "node:fs";
import { EmittedEvent } from "../headless/protocol";
import { GameSnapshot } from "../headless/serialization";
import { GameEventNames } from "../types/events";
import { PlayerStatus } from "../types/Player";
import { MatchRecording, createSimGame } from "./runMatch";
import { checkInvariants } from "./invariants";

/** Status codes kept short: the page holds one frame per step. */
const STATUS_CODE: Partial<Record<PlayerStatus, string>> = {
  [PlayerStatus.ACTIVE]: "A",
  [PlayerStatus.PRONE]: "P",
  [PlayerStatus.STUNNED]: "S",
};

export interface DumpPlayer {
  id: string;
  team: 0 | 1;
  number: number;
  position: string;
  stats: string;
  skills: string[];
}

export interface DumpFrame {
  /** Recorded step label, or the opening frame's caption. */
  label: string;
  team: 0 | 1 | null;
  ok: boolean;
  reason?: string;
  note?: string;
  phase: string;
  half: 1 | 2;
  turn: number;
  /** Index of the team whose turn it is, if any. */
  active: 0 | 1 | null;
  score: [number, number];
  rerolls: [number, number];
  ball: [number, number] | null;
  /** Per player, in `players` order: [x, y, status] on the pitch, or the off-pitch status. */
  board: ([number, number, string] | string)[];
  activePlayer: number | null;
  /** Play-by-play for this step: dice, notices, turnovers, touchdowns. */
  log: string[];
  /** Invariants this step broke, if any. */
  problems: string[];
}

export interface MatchDump {
  title: string;
  seed: number;
  rosters: [string, string];
  coaches: [string, string];
  teamNames: [string, string];
  players: DumpPlayer[];
  frames: DumpFrame[];
  findings: MatchRecording["findings"];
}

function narrate(events: EmittedEvent[]): string[] {
  const out: string[] = [];
  for (const event of events) {
    const data = event.data as Record<string, unknown> | string | undefined;
    switch (event.name) {
      case GameEventNames.DiceRoll:
        if (
          data &&
          typeof data === "object" &&
          typeof data.description === "string"
        ) {
          out.push(`🎲 ${data.description}`);
        }
        break;
      case GameEventNames.UI_Notification:
        if (typeof data === "string") out.push(data);
        break;
      case GameEventNames.UI_Turnover:
        if (data && typeof data === "object")
          out.push(`TURNOVER: ${String(data.reason ?? "")}`);
        break;
      case GameEventNames.Touchdown:
        out.push("TOUCHDOWN!");
        break;
    }
  }
  // Notices repeat when several listeners announce the same thing.
  return out.filter((line, i) => line !== out[i - 1]);
}

function frameOf(
  snapshot: GameSnapshot,
  playerIds: string[],
  step: Pick<DumpFrame, "label" | "team" | "ok" | "reason" | "note">,
  log: string[],
  problems: string[]
): DumpFrame {
  const byId = new Map(
    snapshot.teams.flatMap((t) => t.players).map((p) => [p.id, p])
  );
  const teamIndex = (id: string | null) =>
    id === snapshot.teams[0].id ? 0 : id === snapshot.teams[1].id ? 1 : null;
  return {
    ...step,
    phase: snapshot.phase,
    half: snapshot.turn.isHalf2 ? 2 : 1,
    turn: snapshot.turn.turnNumber,
    active: teamIndex(snapshot.activeTeamId),
    score: [
      snapshot.score[snapshot.teams[0].id] ?? 0,
      snapshot.score[snapshot.teams[1].id] ?? 0,
    ],
    rerolls: [snapshot.teams[0].rerolls, snapshot.teams[1].rerolls],
    ball: snapshot.ballPosition
      ? [snapshot.ballPosition.x, snapshot.ballPosition.y]
      : null,
    board: playerIds.map((id) => {
      const p = byId.get(id)!;
      return p.position
        ? [p.position.x, p.position.y, STATUS_CODE[p.status] ?? "?"]
        : p.status;
    }),
    activePlayer: snapshot.activePlayer
      ? playerIds.indexOf(snapshot.activePlayer.id)
      : null,
    log,
    problems,
  };
}

/** Replay the recording and capture the board after every step. */
export async function buildMatchDump(
  recording: MatchRecording
): Promise<MatchDump> {
  const game = createSimGame(
    recording.seed,
    recording.rosters,
    recording.rerolls
  );
  const start = game.snapshot();
  const players: DumpPlayer[] = start.teams.flatMap((team, t) =>
    team.players.map((p) => ({
      id: p.id,
      team: t as 0 | 1,
      number: p.number,
      position: p.positionName,
      stats: `MA${p.stats.MA} ST${p.stats.ST} AG${p.stats.AG}+ PA${p.stats.PA ?? "-"}+ AV${p.stats.AV}+`,
      skills: p.skills,
    }))
  );
  const ids = players.map((p) => p.id);
  const frames: DumpFrame[] = [
    frameOf(
      start,
      ids,
      { label: "Kick-off: both teams in the dugout", team: null, ok: true },
      [],
      []
    ),
  ];
  for (const step of recording.steps) {
    const before = game.snapshot();
    const response = await game.execute(step.command);
    const problems = response.ok
      ? checkInvariants(
          before,
          response.snapshot,
          !!response.pendingDecision
        ).map((v) => `${v.rule}: ${v.message}`)
      : [];
    frames.push(
      frameOf(
        response.snapshot,
        ids,
        {
          label: step.label,
          team: step.team,
          ok: response.ok,
          reason: response.reason,
          note: step.note,
        },
        narrate(response.events),
        problems
      )
    );
  }
  return {
    title: `${recording.rosters[0]} vs ${recording.rosters[1]}, seed ${recording.seed}`,
    seed: recording.seed,
    rosters: recording.rosters,
    coaches: recording.coaches,
    teamNames: [
      `${recording.rosters[0]} (home)`,
      `${recording.rosters[1]} (away)`,
    ],
    players,
    frames,
    findings: recording.findings,
  };
}

const TEMPLATE = new URL("./viewer.html", import.meta.url);

/** The viewer page with the dump inlined; safe to open from disk. */
export function renderMatchHtml(dump: MatchDump): string {
  const json = JSON.stringify(dump).replace(/</g, "\\u003c");
  return fs
    .readFileSync(TEMPLATE, "utf8")
    .replace("__TITLE__", escapeHtml(dump.title))
    .replace("/*__MATCH_DATA__*/null", json);
}

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!
  );
}

export interface IndexEntry {
  /** Page file name, relative to the index. */
  page: string;
  seed: number;
  rosters: [string, string];
  score: [number, number];
  commands: number;
  findings: number;
}

/** A batch's front page: totals, coverage, and a link to every match. */
export function renderIndexHtml(batch: {
  title: string;
  coaches: [string, string];
  matches: IndexEntry[];
  commandCoverage: Record<string, number>;
  findings: { key: string; matches: number; count: number }[];
}): string {
  const rows = batch.matches
    .map(
      (m) => `<tr${m.findings ? ' class="bad"' : ""}>
  <td><a href="${escapeHtml(m.page)}">${escapeHtml(m.rosters[0])} vs ${escapeHtml(m.rosters[1])}</a></td>
  <td class="n">${m.score[0]}–${m.score[1]}</td><td class="n">${m.seed}</td>
  <td class="n">${m.commands}</td><td class="n">${m.findings || ""}</td></tr>`
    )
    .join("\n");
  const coverage = Object.entries(batch.commandCoverage)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span>${escapeHtml(k)} <b>${v}</b></span>`)
    .join(" ");
  const problems = batch.findings.length
    ? `<ul>${batch.findings
        .map(
          (f) =>
            `<li>${escapeHtml(f.key)}: ${f.count} times in ${f.matches} matches</li>`
        )
        .join("")}</ul>`
    : "<p>No rule was broken in any match.</p>";
  const touchdowns = batch.matches.reduce(
    (s, m) => s + m.score[0] + m.score[1],
    0
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(batch.title)}</title>
<style>
body{margin:0;background:#0b0f1e;color:#e8e4d6;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:20px 24px;max-width:1000px}
h1{color:#e0b24a;font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8d93a8;margin:22px 0 8px}
p,.meta{color:#8d93a8}a{color:#e8e4d6}table{border-collapse:collapse;width:100%}
td,th{padding:5px 10px;border-bottom:1px solid #2a3352;text-align:left}th{color:#8d93a8;font-weight:500}
.n{text-align:right;font-variant-numeric:tabular-nums}tr:hover{background:#131a30}tr.bad td{color:#ff9b9b}
.cov span{display:inline-block;margin:0 12px 4px 0;color:#8d93a8}.cov b{color:#e8e4d6}
</style></head><body>
<h1>${escapeHtml(batch.title)}</h1>
<p>${escapeHtml(batch.coaches[0])} (home) vs ${escapeHtml(batch.coaches[1])} (away) · ${batch.matches.length} matches · ${touchdowns} touchdowns. Open a match to watch it back.</p>
<h2>Problems</h2>${problems}
<h2>Matches</h2>
<table><tr><th>Match</th><th class="n">Score</th><th class="n">Seed</th><th class="n">Steps</th><th class="n">Problems</th></tr>
${rows}</table>
<h2>Commands exercised</h2><div class="cov">${coverage}</div>
</body></html>`;
}
