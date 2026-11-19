import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { RosterName } from "../../../src/types/Team";
import type { Tally as PlayTally } from "./usage";
import { nth } from "../nth";

type Tier = 1 | 2 | 3 | 4;

const STANDARDS: Record<Tier, { points: number; scores: number }> = {
  1: { points: 0.5, scores: 0.55 },
  2: { points: 0.45, scores: 0.5 },
  3: { points: 0.38, scores: 0.4 },
  4: { points: 0.28, scores: 0.35 },
};
const CEILING = 0.75;

const ROSTERS = new Set<string>(Object.values(RosterName));
const isRosterName = (name: string): name is RosterName => ROSTERS.has(name);
function tierOf(roster: string): Tier {
  if (!isRosterName(roster)) throw new Error(`Unknown roster ${roster}`);
  const tier = getRosterByRosterName(roster).tier;
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4)
    throw new Error(`${roster} has tier ${String(tier)}`);
  return tier;
}

interface TeamGame {
  game: string;
  block: string;
  policy: "candidate" | "frozen";
  roster: string;
  points: number;
  touchdowns: number;
  casualties: number;
  turnovers: number;
}

function parseTeamGames(text: string): TeamGame[] {
  const [head = "", ...lines] = text.trim().split("\n");
  const columns = head.split(",");
  const at = (name: string) => {
    const i = columns.indexOf(name);
    if (i < 0) throw new Error(`team-games.csv has no ${name} column`);
    return i;
  };
  const c = {
    game: at("game"),
    block: at("block"),
    policy: at("policy"),
    roster: at("roster"),
    points: at("points"),
    touchdowns: at("touchdowns"),
    casualties: at("casualties"),
    turnovers: at("turnovers"),
  };
  return lines.map((line) => {
    const f = line.split(",");
    const policy = f[c.policy];
    if (policy !== "candidate" && policy !== "frozen")
      throw new Error(`Unknown policy ${String(policy)}`);
    return {
      game: nth(f, c.game),
      block: nth(f, c.block),
      policy,
      roster: nth(f, c.roster),
      points: Number(f[c.points]),
      touchdowns: Number(f[c.touchdowns]),
      casualties: Number(f[c.casualties]),
      turnovers: Number(f[c.turnovers]),
    };
  });
}

interface FoulTally {
  fouls: number;
  sentOff: number;
  removed: number;
  casualties: number;
  stunned: number;
}

interface Signature {
  play: string;
  perGame: number;

  lift: number;

  scored: number;
}

export interface RosterCard {
  roster: string;
  tier: Tier;
  games: number;

  points: number;

  adjusted: number | null;

  pointsCi: [number, number] | null;

  judged: "strength" | "raw points";

  change: number | null;
  wins: number;
  draws: number;
  losses: number;
  touchdownsFor: number;
  touchdownsAgainst: number;
  scores: number;
  casualtiesFor: number;
  casualtiesAgainst: number;
  turnovers: number;
  foulsPerGame: number;
  sentOff: number;
  topFouler: string | null;
  signatures: Signature[];
  verdict: "meets" | "below" | "ceiling";
  misses: string[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface FitGame {
  roster: string;
  opponent: string;

  policy: "candidate" | "frozen";
  points: number;
}

export function strengths(games: FitGame[]): {
  strength: Map<string, number>;
  edge: number;
} | null {
  const rosters = [
    ...new Set(games.flatMap((g) => [g.roster, g.opponent])),
  ].sort();
  const index = new Map(rosters.map((r, i) => [r, i]));
  const n = rosters.length + 1;
  const a = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  const add = (terms: [number, number][], y: number) => {
    for (const [i, xi] of terms) {
      b[i] = nth(b, i) + xi * y;
      const row = nth(a, i);
      for (const [j, xj] of terms) row[j] = nth(row, j) + xi * xj;
    }
  };
  for (const g of games)
    add(
      [
        [index.get(g.roster)!, 1],
        [index.get(g.opponent)!, -1],
        [n - 1, g.policy === "candidate" ? 1 : -1],
      ],
      g.points - 0.5
    );

  add(
    rosters.map((_, i): [number, number] => [i, 1]),
    0
  );
  const x = solve(a, b);
  if (!x) return null;
  return {
    strength: new Map(rosters.map((r, i) => [r, nth(x, i)])),
    edge: nth(x, n - 1),
  };
}

function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, nth(b, i)]);
  const scale = Math.max(...a.map((row, i) => Math.abs(nth(row, i))), 1);
  for (let col = 0; col < n; col++)
    if (!eliminate(m, col, scale * 1e-9)) return null;
  return m.map((row, i) => nth(row, n) / nth(row, i));
}

function eliminate(m: number[][], col: number, tiny: number): boolean {
  let pivot = col;
  for (let r = col + 1; r < m.length; r++)
    if (Math.abs(nth(nth(m, r), col)) > Math.abs(nth(nth(m, pivot), col)))
      pivot = r;
  const lead = nth(m, pivot);
  m[pivot] = nth(m, col);
  m[col] = lead;
  if (Math.abs(nth(lead, col)) < tiny) return false;
  m.forEach((row, r) => {
    if (r === col) return;
    const f = nth(row, col) / nth(lead, col);
    for (let k = col; k < row.length; k++) row[k] = nth(row, k) - f * nth(lead, k);
  });
  return true;
}

export function strengthIntervals(
  games: (FitGame & { block: string })[],
  draws = 1000
): Map<string, [number, number]> | null {
  const blocks = new Map<string, FitGame[]>();
  for (const g of games)
    blocks.set(g.block, [...(blocks.get(g.block) ?? []), g]);
  const groups = [...blocks.values()];
  const field = new Set(games.flatMap((g) => [g.roster, g.opponent])).size;
  let seed = 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const samples = new Map<string, number[]>();
  let unfitted = 0;
  for (let d = 0; d < draws; d++) {
    const drawn = groups.flatMap(
      () => nth(groups, Math.floor(random() * groups.length))
    );

    const fit = strengths(drawn);
    if (!fit || fit.strength.size < field) {
      unfitted++;
      continue;
    }
    for (const [r, s] of fit.strength)
      samples.set(r, [...(samples.get(r) ?? []), s]);
  }
  if (unfitted > draws / 20) return null;
  const at = (xs: number[], q: number) =>
    nth(xs, Math.floor(q * (xs.length - 1)));
  return new Map(
    [...samples].map(([r, xs]) => {
      xs.sort((p, q) => p - q);
      return [r, [0.5 + at(xs, 0.025), 0.5 + at(xs, 0.975)]];
    })
  );
}

function playsIn(field: Record<string, PlayTally>, play: string): number {
  const tally = field[play];
  if (!tally) throw new Error(`No field tally for ${play}`);
  return tally.plays;
}

function signaturesOf(
  own: Record<string, PlayTally>,
  field: Record<string, PlayTally>,
  games: number
): Signature[] {
  const ownTotal = Object.values(own).reduce((a, t) => a + t.plays, 0);
  const fieldTotal = Object.values(field).reduce((a, t) => a + t.plays, 0);
  return Object.entries(own)
    .filter(([play, t]) => !play.startsWith("unplanned") && t.plays >= 20)
    .map(([play, t]) => ({
      play,
      perGame: t.plays / games,
      lift: t.plays / ownTotal / (playsIn(field, play) / fieldTotal),
      scored: (t.scoredThisTurn + t.scoredNextTurn) / t.plays,
    }))
    .filter((s) => s.lift >= 1.25)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 3);
}

const tenth = (n: number) => `${(100 * n).toFixed(1)}%`;

function verdictOf(
  tier: Tier,
  share: number,
  scores: number,
  judged: RosterCard["judged"]
): Pick<RosterCard, "verdict" | "misses"> {
  if (share > CEILING)
    return {
      verdict: "ceiling",
      misses: [`${judged} ${pct(share)} over the ${pct(CEILING)} ceiling`],
    };
  const standard = STANDARDS[tier];
  const misses = [
    share < standard.points
      ? `${judged} ${tenth(share)} under ${pct(standard.points)}`
      : "",
    scores < standard.scores
      ? `scores in ${tenth(scores)} of games, under ${pct(standard.scores)}`
      : "",
  ].filter(Boolean);
  return { verdict: misses.length ? "below" : "meets", misses };
}

function foulsOf(
  fouls: Record<"candidate" | "frozen", Record<string, FoulTally>>,
  policies: ("candidate" | "frozen")[],
  roster: string
) {
  const groups = policies.flatMap((p) =>
    Object.entries(fouls[p]).filter(([key]) => key.startsWith(roster + " / "))
  );
  const byFouler = new Map<string, number>();
  for (const [key, t] of groups) {
    const position = key.slice(roster.length + 3);
    byFouler.set(position, (byFouler.get(position) ?? 0) + t.fouls);
  }
  return {
    count: groups.reduce((a, [, t]) => a + t.fouls, 0),
    sentOff: groups.reduce((a, [, t]) => a + t.sentOff, 0),
    topFouler: [...byFouler].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

export function scorecard(
  teamGames: TeamGame[],
  usage: Record<string, Record<string, PlayTally>>,
  fouls: Record<"candidate" | "frozen", Record<string, FoulTally>>,
  policies: ("candidate" | "frozen")[]
): RosterCard[] {
  const byGame = new Map<string, TeamGame[]>();
  for (const row of teamGames)
    byGame.set(row.game, [...(byGame.get(row.game) ?? []), row]);
  const counted = teamGames.filter((r) => policies.includes(r.policy));
  const field: Record<string, PlayTally> = {};
  for (const policy of policies)
    for (const [key, plays] of Object.entries(usage))
      if (key.startsWith(policy + "/"))
        for (const [play, t] of Object.entries(plays)) {
          const f = (field[play] ??= {
            plays: 0,
            scoredThisTurn: 0,
            scoredNextTurn: 0,
            turnovers: 0,
          });
          f.plays += t.plays;
          f.scoredThisTurn += t.scoredThisTurn;
          f.scoredNextTurn += t.scoredNextTurn;
          f.turnovers += t.turnovers;
        }

  const opponentOf = (r: TeamGame) => {
    const other = byGame.get(r.game)!.find((o) => o !== r);
    if (!other) throw new Error(`${r.game} has one side`);
    return other;
  };
  const fitGames = counted.map((r) => ({
    roster: r.roster,
    opponent: opponentOf(r).roster,
    policy: r.policy,
    points: r.points,
    block: r.block,
  }));

  const fitted = strengths(fitGames)?.strength ?? null;
  const intervals = fitted ? strengthIntervals(fitGames) : null;
  const rosters = [...new Set(counted.map((r) => r.roster))];
  const pointsUnder = (roster: string, policy: TeamGame["policy"]) => {
    const xs = teamGames
      .filter((r) => r.roster === roster && r.policy === policy)
      .map((r) => r.points);
    return xs.length ? mean(xs) : null;
  };
  const changeOf = (roster: string) => {
    const candidate = pointsUnder(roster, "candidate");
    const frozen = pointsUnder(roster, "frozen");
    return candidate === null || frozen === null ? null : candidate - frozen;
  };
  return rosters
    .map((roster): RosterCard => {
      const rows = counted.filter((r) => r.roster === roster);
      const opponents = rows.map(opponentOf);
      const games = rows.length;
      const points = mean(rows.map((r) => r.points));
      const adjusted = fitted ? 0.5 + fitted.get(roster)! : null;
      const share = adjusted ?? points;
      const judged = adjusted === null ? "raw points" : "strength";
      const own: Record<string, PlayTally> = {};
      for (const policy of policies)
        for (const [play, t] of Object.entries(
          usage[`${policy}/${roster}`] ?? {}
        )) {
          const o = (own[play] ??= {
            plays: 0,
            scoredThisTurn: 0,
            scoredNextTurn: 0,
            turnovers: 0,
          });
          o.plays += t.plays;
          o.scoredThisTurn += t.scoredThisTurn;
          o.scoredNextTurn += t.scoredNextTurn;
          o.turnovers += t.turnovers;
        }
      const foul = foulsOf(fouls, policies, roster);
      const tier = tierOf(roster);
      const scores = rows.filter((r) => r.touchdowns > 0).length / games;
      return {
        roster,
        tier,
        games,
        points,
        adjusted,
        pointsCi: intervals?.get(roster) ?? null,
        judged,
        change: changeOf(roster),
        wins: rows.filter((r) => r.points === 1).length,
        draws: rows.filter((r) => r.points === 0.5).length,
        losses: rows.filter((r) => r.points === 0).length,
        touchdownsFor: mean(rows.map((r) => r.touchdowns)),
        touchdownsAgainst: mean(opponents.map((r) => r.touchdowns)),
        scores,
        casualtiesFor: mean(rows.map((r) => r.casualties)),
        casualtiesAgainst: mean(opponents.map((r) => r.casualties)),
        turnovers: mean(rows.map((r) => r.turnovers)),
        foulsPerGame: foul.count / games,
        sentOff: foul.count && foul.sentOff / foul.count,
        topFouler: foul.topFouler,
        signatures: signaturesOf(own, field, games),
        ...verdictOf(tier, share, scores, judged),
      };
    })
    .sort(
      (a, b) =>
        a.tier - b.tier || (b.adjusted ?? b.points) - (a.adjusted ?? a.points)
    );
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const num = (x: number) => x.toFixed(2);

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(100 * x).toFixed(1)}`;
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => `&${String({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c])};`
  );

function html(cards: RosterCard[], stage: string, revision: string): string {
  const below = cards.filter((c) => c.verdict !== "meets");
  const row = (c: RosterCard) => `<tr class="${c.verdict}">
<td>${esc(c.roster)}</td><td class="n">${String(c.tier)}</td><td class="n">${String(c.games)}</td>
<td class="n">${c.adjusted === null ? "n/a" : pct(c.adjusted)} <span class="ci">${c.pointsCi ? `${pct(c.pointsCi[0])}–${pct(c.pointsCi[1])}` : ""}</span></td><td class="n">${pct(c.points)}</td><td class="n">${c.change === null ? "n/a" : signed(c.change)}</td>
<td class="n">${pct(c.scores)}</td><td class="n">${num(c.touchdownsFor)}</td><td class="n">${num(c.touchdownsAgainst)}</td>
<td class="n">${num(c.casualtiesFor)}</td><td class="n">${num(c.casualtiesAgainst)}</td>
<td class="n">${num(c.foulsPerGame)}</td>
<td>${c.signatures.map((s) => `${esc(s.play)} ×${s.lift.toFixed(1)}`).join(", ") || "<span class=ci>none</span>"}</td>
<td>${c.verdict === "meets" ? "meets" : esc(c.misses.join("; "))}</td></tr>`;
  const standards = (
    Object.entries(STANDARDS)
  )
    .map(
      ([tier, s]) =>
        `<tr><td>Tier ${tier}</td><td class="n">${pct(s.points)}</td><td class="n">${pct(s.scores)}</td></tr>`
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Team scorecard</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0b0f1e;color:#e8e4d6;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:20px 16px;max-width:1200px}
h1{color:#e0b24a;font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8d93a8;margin:24px 0 8px}
p{color:#8d93a8}.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px;width:100%;min-width:1000px}
td,th{padding:5px 8px;border-bottom:1px solid #2a3352;text-align:left;vertical-align:top}th{color:#8d93a8;font-weight:500}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ci{color:#8d93a8;font-size:12px}
tr.below td:last-child{color:#ef8a7a}tr.ceiling td:last-child{color:#e0b24a}tr.meets td:last-child{color:#8fd19e}
</style>
<h1>Team scorecard</h1>
<p>Stage ${esc(stage)}, revision <code>${esc(revision.slice(0, 12))}</code>. ${String(below.length)} of ${String(cards.length)} rosters miss their tier's standard.${cards.some((c) => c.adjusted === null) ? " This schedule splits the rosters into groups that never meet, so no strength can be fitted and each roster is judged on raw points." : ""}</p>
<h2>Rosters</h2>
<div class="wrap"><table><tr><th>Roster</th><th class="n">Tier</th><th class="n">Games</th><th class="n">Strength, 95%</th><th class="n">Raw points</th><th class="n">Change vs frozen</th><th class="n">Scores</th><th class="n">TD for</th><th class="n">TD against</th><th class="n">Cas for</th><th class="n">Cas against</th><th class="n">Fouls</th><th>Signature plays, times the field</th><th>Standard</th></tr>
${cards.map(row).join("\n")}</table></div>
<h2>Standards</h2>
<div class="wrap"><table style="width:auto"><tr><th>Tier</th><th class="n">Points at least</th><th class="n">Scores in at least</th></tr>${standards}</table></div>
<p>Strength is the points share a roster would take from an average opponent of the same planner, so the average roster gets 50%. The lab pairs each roster with only a few others, so it is fitted from every game: a game between two rosters is taken to score about 50% plus the difference in their strengths, plus any edge one policy has over the other. Raw points is the plain share against whoever the schedule chose. Scores is the share of games with at least one touchdown. A roster over ${pct(CEILING)} is flagged so its lineup and rules are checked before the AI is changed. Per-game figures count each roster's own games. The interval refits strengths on whole schedule blocks drawn with replacement, a thousand times.</p>`;
}

function main() {
  const [labRoot, stage] = process.argv.slice(2);
  if (!labRoot || !stage)
    throw new Error(
      "Usage: scorecard.ts <lab root> <stage> [--candidate-only]"
    );
  const run = join(resolve(labRoot), stage);
  const report = join(resolve(labRoot), "reports", stage);
  const usage = JSON.parse(
    readFileSync(join(run, "usage-summary.json"), "utf8")
  ) as {
    revision: string;
    rosters: Record<string, Record<string, PlayTally>>;
  };
  const foulFile = join(run, "fouls-summary.json");
  const fouls = existsSync(foulFile)
    ? (JSON.parse(readFileSync(foulFile, "utf8")).policies as Record<
        "candidate" | "frozen",
        Record<string, FoulTally>
      >)
    : { candidate: {}, frozen: {} };
  const policies: ("candidate" | "frozen")[] = process.argv.includes(
    "--candidate-only"
  )
    ? ["candidate"]
    : ["candidate", "frozen"];
  const cards = scorecard(
    parseTeamGames(readFileSync(join(report, "team-games.csv"), "utf8")),
    usage.rosters,
    fouls,
    policies
  );
  writeFileSync(
    join(report, "scorecard.json"),
    JSON.stringify(
      {
        revision: usage.revision,
        stage,
        policies,
        standards: STANDARDS,
        ceiling: CEILING,
        cards,
      },
      null,
      2
    )
  );
  writeFileSync(
    join(report, "scorecard.html"),
    html(cards, stage, usage.revision)
  );
  console.log(
    JSON.stringify({
      rosters: cards.length,
      below: cards.filter((c) => c.verdict !== "meets").map((c) => c.roster),
    })
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
