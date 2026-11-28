import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TallyName } from "../../../src/simulation/telemetry";
import {
  type Gap,
  type RosterFindings,
  type Use,
  RARE_PER_100,
  actionLabel,
  gaps,
  neverUsed,
  per100,
  rarelyUsed,
  rosterFindings,
} from "./findings";
import { type GameTypeCoverage, readCoverage } from "./model";

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const rate = (count: number, matches: number) => per100(count, matches).toFixed(1);

const PLAY: readonly (readonly [TallyName, string])[] = [
  ["rushes", "Rushes"],
  ["dodges", "Dodges"],
  ["passes", "Passes"],
  ["handoffs", "Hand-offs"],
  ["interceptions", "Interceptions"],
  ["pickups", "Pick-ups"],
  ["casualtiesCaused", "Casualties caused"],
];

function gapList(title: string, found: readonly Gap[], label: (name: string) => string): string {
  if (found.length === 0) return `<h4>${title}</h4><p class="muted">None.</p>`;
  const items = found.map(
    ({ name, rosters }) =>
      `<li><b>${escape(label(name))}</b> <span class="muted">(${String(rosters.length)})</span>: ${escape(rosters.join(", "))}</li>`
  );
  return `<h4>${title}</h4><ul>${items.join("")}</ul>`;
}

function rosterRow({ roster, coverage, actions, skills }: RosterFindings): string {
  const { matches, completed, usage } = coverage;
  const cells = [
    escape(roster),
    String(matches),
    String(completed),
    (usage.tallies.touchdowns / Math.max(1, matches)).toFixed(2),
    ...PLAY.map(([tally]) => rate(usage.tallies[tally], matches)),
    rate(usage.chosen["declare:secureBall"] ?? 0, matches),
    String(neverUsed(actions).length),
    String(neverUsed(skills).length),
    String(rarelyUsed(actions, matches).length + rarelyUsed(skills, matches).length),
  ];
  return `<tr>${cells.map((cell, i) => (i === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`)).join("")}</tr>`;
}

function tone({ offered, used }: Use, matches: number): string {
  if (offered > 0 && used === 0) return "never";
  return per100(used, matches) < RARE_PER_100 ? "rare" : "";
}

function usageRows(uses: readonly Use[], matches: number, label: (name: string) => string): string {
  return uses
    .map((use) => {
      const { name, offered, used } = use;
      return `<tr class="${tone(use, matches)}"><th>${escape(label(name))}</th><td>${String(offered)}</td><td>${String(used)}</td><td>${rate(used, matches)}</td></tr>`;
    })
    .join("");
}

function rosterDetail(row: RosterFindings): string {
  const { matches } = row.coverage;
  return `<details><summary>${escape(row.roster)}, ${String(matches)} matches</summary>
<table><thead><tr><th>Action</th><th>Offered at decisions</th><th>Chosen</th><th>Chosen per 100 matches</th></tr></thead>
<tbody>${usageRows(row.actions, matches, actionLabel)}</tbody></table>
<table><thead><tr><th>Skill</th><th>Matches held</th><th>Triggers</th><th>Triggers per 100 matches</th></tr></thead>
<tbody>${usageRows(row.skills, matches, (name) => name)}</tbody></table></details>`;
}

function gameTypeSection(gameType: string, coverage: GameTypeCoverage): string {
  const rows = rosterFindings(coverage);
  const fewest = Math.min(...rows.map(({ coverage: { matches } }) => matches));
  const head = ["Roster", "Matches", "Full time", "Touchdowns a match", ...PLAY.map(([, label]) => `${label} /100`), "Secure the ball /100", "Actions never chosen", "Skills never triggered", "Rarely used"];
  return `<section><h2>${escape(gameType)}</h2>
<p>${String(coverage.seeds.length)} matches over ${String(rows.length)} rosters; every roster played at least ${String(fewest)}.</p>
${gapList("Actions offered but never chosen", gaps(rows, (row) => neverUsed(row.actions)), actionLabel)}
${gapList("Skills held but never triggered", gaps(rows, (row) => neverUsed(row.skills)), (name) => name)}
${gapList(`Actions chosen under ${String(RARE_PER_100)} times per 100 matches`, gaps(rows, (row) => rarelyUsed(row.actions, row.coverage.matches)), actionLabel)}
${gapList(`Skills triggered under ${String(RARE_PER_100)} times per 100 matches`, gaps(rows, (row) => rarelyUsed(row.skills, row.coverage.matches)), (name) => name)}
<h3>Rosters</h3>
<div class="wide"><table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => rosterRow(row)).join("")}</tbody></table></div>
<h3>Each roster</h3>${rows.map((row) => rosterDetail(row)).join("")}</section>`;
}

const STYLE = `:root{color-scheme:dark;--bg:#111418;--card:#1b2027;--line:#2c333d;--text:#e6e9ee;--muted:#9aa4b2;--never:#5c2a2a;--rare:#4a3f1c}
body{background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1200px;padding:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;margin:16px 0;padding:8px 16px}
table{border-collapse:collapse;margin:8px 0;width:100%}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left}
td{font-variant-numeric:tabular-nums}.wide{overflow-x:auto}.muted{color:var(--muted)}
tr.never{background:var(--never)}tr.rare{background:var(--rare)}summary{cursor:pointer;padding:4px 0}`;

function page(sections: readonly string[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coach coverage</title><style>${STYLE}</style></head><body>
<h1>Coach coverage</h1>
<p>Planner against planner. An action counts as offered once per decision point where the coach could declare it, and as chosen when the coach declared it. A skill counts as held in each match where a player on the roster has it, and as triggered each time the engine announces its effect. A skill whose effect the engine never announces shows zero triggers even when it changed a roll, so check the engine before treating such a skill as unused.</p>
${sections.join("\n")}</body></html>`;
}

const [input, out] = process.argv.slice(2);
if (!input || !out) throw new Error("Usage: report.ts <merged.json> <report.html>");
const coverage = readCoverage(input);
const sections = Object.entries(coverage.gameTypes)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([gameType, one]) => gameTypeSection(gameType, one));
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, page(sections));
console.log(`Report written to ${out}`);
