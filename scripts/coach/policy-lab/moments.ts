/**
 * A page of the candidate's scoring moments by play, each linking to a
 * playback of its match opened at the declaration. Reads the usage summary
 * and the saved traces; plays nothing again but the recorded commands.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join, resolve } from "node:path";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchSave } from "../../../src/headless/serialization";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import {
  buildMatchDump,
  escapeHtml,
  renderMatchHtml,
} from "../../../src/simulation/viewer";
import type { Moment, Tally } from "./usage";

interface Summary {
  revision: string;
  games: number;
  policies: Record<"candidate" | "frozen", Record<string, Tally>>;
  moments: Moment[];
}

const perGame = (n: number, games: number) => (n / games).toFixed(2);

function usageRows(summary: Summary): string {
  const { candidate, frozen } = summary.policies;
  const plays = [
    ...new Set([...Object.keys(candidate), ...Object.keys(frozen)]),
  ]
    .filter((p) => !p.startsWith("unplanned:"))
    .sort((a, b) => (candidate[b]?.plays ?? 0) - (candidate[a]?.plays ?? 0));
  const cell = (t: Tally | undefined) =>
    `<td class="n">${perGame(t?.plays ?? 0, summary.games)}</td>` +
    `<td class="n">${t?.scoredThisTurn ?? 0}</td>` +
    `<td class="n">${t?.scoredNextTurn ?? 0}</td>` +
    `<td class="n">${t?.turnovers ?? 0}</td>`;
  return plays
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p)}</td>${cell(candidate[p])}${cell(frozen[p])}</tr>`
    )
    .join("\n");
}

function momentList(moments: Moment[]): string {
  const byPlay = new Map<string, Moment[]>();
  for (const m of moments)
    byPlay.set(m.play, [...(byPlay.get(m.play) ?? []), m]);
  return [...byPlay]
    .map(
      ([play, list]) =>
        `<h3>${escapeHtml(play)}</h3><ul>${list
          .map(
            (m) =>
              `<li><a href="${escapeHtml(m.game)}.html#step=${m.step + 1}">${escapeHtml(m.roster)}, half ${m.half} turn ${m.turn}</a>: ${escapeHtml(m.note)}, scored ${m.scored === "this-turn" ? "that turn" : "the next turn"}</li>`
          )
          .join("")}</ul>`
    )
    .join("\n");
}

async function main() {
  const run = resolve(process.argv[2]);
  const out = join(run, "moments");
  mkdirSync(out, { recursive: true });
  const summary = JSON.parse(
    readFileSync(join(run, "usage-summary.json"), "utf8")
  ) as Summary;
  for (const id of new Set(summary.moments.map((m) => m.game))) {
    const trace = JSON.parse(
      gunzipSync(readFileSync(join(run, "traces", id + ".json.gz"))).toString()
    ) as { initial: MatchSave; recording: MatchRecording };
    const dump = await buildMatchDump(
      trace.recording,
      new HeadlessGame({ matchSave: trace.initial })
    );
    writeFileSync(join(out, id + ".html"), renderMatchHtml(dump));
  }
  writeFileSync(
    join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sevens play moments</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0f1e;color:#e8e4d6;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:20px 16px;max-width:1000px}
h1{color:#e0b24a;font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8d93a8;margin:24px 0 8px}
h3{font-size:14px;margin:16px 0 4px}p{color:#8d93a8}a{color:#e8e4d6}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:560px}
td,th{padding:5px 8px;border-bottom:1px solid #2a3352;text-align:left}th{color:#8d93a8;font-weight:500}
.n{text-align:right;font-variant-numeric:tabular-nums}li{margin:2px 0}
</style></head><body>
<h1>Sevens play moments</h1>
<p>Revision ${escapeHtml(summary.revision.slice(0, 12))}, ${summary.games} games. A play scored when its team scored that turn or the next; turnovers happened during it. This is what followed a play, not what the play was worth.</p>
<h2>Plays per game</h2>
<div class="wrap"><table>
<tr><th></th><th colspan="4">Candidate</th><th colspan="4">Frozen</th></tr>
<tr><th>Play</th><th class="n">Per game</th><th class="n">Scored that turn</th><th class="n">Next turn</th><th class="n">Turnovers</th><th class="n">Per game</th><th class="n">Scored that turn</th><th class="n">Next turn</th><th class="n">Turnovers</th></tr>
${usageRows(summary)}
</table></div>
<h2>Candidate scoring moments</h2>
<p>Rarest plays first. Each link opens the match at the declaration.</p>
${momentList(summary.moments)}
</body></html>`
  );
  console.log(join(out, "index.html"));
}
await main();
