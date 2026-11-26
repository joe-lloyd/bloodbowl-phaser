import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { escapeHtml } from "../../../src/simulation/viewer";
import { argument, writeMatchViewer } from "./lab";
import type { Drama } from "./drama";

function firstScoreStep(drama: Drama): number {
  const first = drama.scores[0];
  if (!first) throw new Error(`${drama.game} has no scores`);
  return first.step;
}

function activationStart(recording: MatchRecording, step: number): number {
  for (let i = step; i >= 0; i--)
    if (recording.steps[i]?.command.type === "declare-action") return i;
  return step;
}

async function main() {
  const run = path.resolve(argument(2));
  const picksFile = path.resolve(argument(3));
  const picks = JSON.parse(readFileSync(picksFile, "utf8")) as [
    string,
    string,
  ][];
  const out = path.resolve(argument(4));
  mkdirSync(out, { recursive: true });
  const dramas = JSON.parse(
    readFileSync(path.join(run, "drama.json"), "utf8")
  ) as Drama[];
  const drama = new Map(dramas.map((d) => [d.game, d]));
  const items: string[] = [];
  for (const [id, why] of picks) {
    const d = drama.get(id)!;
    const recording = await writeMatchViewer(run, out, id);
    const decider = d.scores.at(-1)!;
    const start = activationStart(recording, decider.step);
    const timeline = d.scores
      .map((s) => `${d.rosters[s.side]} H${String(s.half)} T${String(s.turn)}`)
      .join(", ");
    const firstScore = activationStart(recording, firstScoreStep(d)) + 1;
    items.push(`<li><h3>${escapeHtml(d.rosters[0])} ${String(d.final[0])}–${String(d.final[1])} ${escapeHtml(d.rosters[1])}</h3>
<p>${escapeHtml(why)}</p>
<p class="quiet">Scores: ${escapeHtml(timeline)}.</p>
<p><a href="${escapeHtml(id)}.html#step=${String(start + 1)}">Watch the deciding score</a> · <a href="${escapeHtml(id)}.html#step=${String(firstScore)}">from the first score</a> · <a href="${escapeHtml(id)}.html">whole match</a></p></li>`);
  }
  writeFileSync(
    path.join(out, "index.html"),
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
  console.log(path.join(out, "index.html"));
}
await main();
