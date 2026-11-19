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
import type { Drama } from "./drama";

function activationStart(recording: MatchRecording, step: number): number {
  for (let i = step; i >= 0; i--)
    if (recording.steps[i].command.type === "declare-action") return i;
  return step;
}

async function main() {
  const run = resolve(process.argv[2]);
  const picks = JSON.parse(readFileSync(resolve(process.argv[3]), "utf8")) as [
    string,
    string,
  ][];
  const out = resolve(process.argv[4]);
  mkdirSync(out, { recursive: true });
  const drama = new Map(
    (JSON.parse(readFileSync(join(run, "drama.json"), "utf8")) as Drama[]).map(
      (d) => [d.game, d]
    )
  );
  const items: string[] = [];
  for (const [id, why] of picks) {
    const d = drama.get(id)!;
    const trace = JSON.parse(
      gunzipSync(readFileSync(join(run, "traces", id + ".json.gz"))).toString()
    ) as { initial: MatchSave; recording: MatchRecording };
    const dump = await buildMatchDump(
      trace.recording,
      new HeadlessGame({ matchSave: trace.initial })
    );
    writeFileSync(join(out, id + ".html"), renderMatchHtml(dump));
    const decider = d.scores.at(-1)!;
    const start = activationStart(trace.recording, decider.step);
    const timeline = d.scores
      .map((s) => `${d.rosters[s.side]} H${String(s.half)} T${String(s.turn)}`)
      .join(", ");
    items.push(`<li><h3>${escapeHtml(d.rosters[0])} ${String(d.final[0])}–${String(d.final[1])} ${escapeHtml(d.rosters[1])}</h3>
<p>${escapeHtml(why)}</p>
<p class="quiet">Scores: ${escapeHtml(timeline)}.</p>
<p><a href="${escapeHtml(id)}.html#step=${String(start + 1)}">Watch the deciding score</a> · <a href="${escapeHtml(id)}.html#step=${String(activationStart(trace.recording, d.scores[0].step) + 1)}">from the first score</a> · <a href="${escapeHtml(id)}.html">whole match</a></p></li>`);
  }
  writeFileSync(
    join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sevens nail-biters</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0f1e;color:#e8e4d6;font:15px/1.5 system-ui,-apple-system,sans-serif;padding:20px 16px;max-width:820px}
h1{color:#e0b24a;font-size:22px;margin:0 0 6px}h3{font-size:16px;margin:0 0 4px}
p{margin:4px 0}.quiet{color:#8d93a8;font-size:13px}a{color:#8cc7ff}
ol{padding-left:20px}li{background:#141a2e;border:1px solid #2a3352;border-radius:10px;padding:12px 14px;margin:0 0 12px}
</style></head><body>
<h1>Sevens nail-biters</h1>
<p class="quiet">Eight of the closest games from 5,184 played by the best planner against main's frozen planner. Chosen from scoring timelines: lead changes, comebacks and scores on the last turn. Each link opens the match viewer at that activation; use the arrow keys to step.</p>
<ol>
${items.join("\n")}
</ol>
</body></html>`
  );
  console.log(join(out, "index.html"));
}
await main();
