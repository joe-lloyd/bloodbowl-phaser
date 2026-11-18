/**
 * One row per roster: how it fares against the field, whether it scores, how
 * it hurts and fouls, and which plays set it apart. Each roster is held to the
 * standard of its tier, so the team-by-team work has a yardstick.
 *
 * Reads a stage after report.py, usage.ts and fouls.ts have run on it, and
 * writes scorecard.json and scorecard.html next to the stage's report.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { RosterName } from "../../../src/types/Team";
import type { Tally as PlayTally } from "./usage";

type Tier = 1 | 2 | 3 | 4;

/**
 * Points share against the field of the same planner, and the share of games
 * with at least one touchdown. The field averages 50%, so a tier-one team
 * should beat it. Above the ceiling, a roster is checked for a lineup or rules
 * fault before the AI is blamed for anything.
 */
export const STANDARDS: Record<Tier, { points: number; scores: number }> = {
  1: { points: 0.5, scores: 0.55 },
  2: { points: 0.45, scores: 0.5 },
  3: { points: 0.38, scores: 0.4 },
  4: { points: 0.28, scores: 0.35 },
};
export const CEILING = 0.75;

const ROSTERS = new Set<string>(Object.values(RosterName));
const isRosterName = (name: string): name is RosterName => ROSTERS.has(name);
function tierOf(roster: string): Tier {
  if (!isRosterName(roster)) throw new Error(`Unknown roster ${roster}`);
  const tier = getRosterByRosterName(roster).tier;
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4)
    throw new Error(`${roster} has tier ${tier}`);
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
  const [head, ...lines] = text.trim().split("\n");
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
      throw new Error(`Unknown policy ${policy}`);
    return {
      game: f[c.game],
      block: f[c.block],
      policy,
      roster: f[c.roster],
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

export interface Signature {
  play: string;
  perGame: number;
  /** Times as often as the field makes this play. */
  lift: number;
  /** Share of uses after which the team scored that turn or the next. */
  scored: number;
}

export interface RosterCard {
  roster: string;
  tier: Tier;
  games: number;
  /** Raw points share, against whoever the schedule paired it with. */
  points: number;
  /**
   * Points share against an average opponent: the lab pairs each roster
   * with a handful of others, so raw points carry schedule luck.
   */
  adjusted: number;
  pointsCi: [number, number];
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
  /** The policy playing `roster`; its opponent plays the other one. */
  policy: "candidate" | "frozen";
  points: number;
}

/**
 * Each roster's strength s, the least-squares fit of
 * points = 0.5 + s(roster) - s(opponent) ± edge, with strengths averaging
 * zero. The edge is what the candidate policy gains over the frozen one, so
 * a candidate that wins both legs of a pairing leaves both rosters level.
 */
export function strengths(games: FitGame[]): {
  strength: Map<string, number>;
  edge: number;
} {
  const rosters = [
    ...new Set(games.flatMap((g) => [g.roster, g.opponent])),
  ].sort();
  const index = new Map(rosters.map((r, i) => [r, i]));
  const n = rosters.length + 1;
  const a = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b = new Array<number>(n).fill(0);
  const add = (terms: [number, number][], y: number) => {
    for (const [i, xi] of terms) {
      b[i] += xi * y;
      for (const [j, xj] of terms) a[i][j] += xi * xj;
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
  // Strengths are only known up to a shift: pin their sum to zero.
  add(
    rosters.map((_, i): [number, number] => [i, 1]),
    0
  );
  const x = solve(a, b);
  return {
    strength: new Map(rosters.map((r, i) => [r, x[i]])),
    edge: x[n - 1],
  };
}

/** Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) eliminate(m, col);
  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

/** Pivot on `col` and clear it from every other row. */
function eliminate(m: number[][], col: number): void {
  let pivot = col;
  for (let r = col + 1; r < m.length; r++)
    if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
  [m[col], m[pivot]] = [m[pivot], m[col]];
  if (Math.abs(m[col][col]) < 1e-12) return;
  for (let r = 0; r < m.length; r++) {
    if (r === col) continue;
    const f = m[r][col] / m[col][col];
    for (let k = col; k < m[r].length; k++) m[r][k] -= f * m[col][k];
  }
}

/**
 * A 95% interval for each roster's strength: refit on whole schedule
 * blocks drawn with replacement, so the opponents' uncertainty counts too.
 */
export function strengthIntervals(
  games: (FitGame & { block: string })[],
  draws = 1000
): Map<string, [number, number]> {
  const blocks = new Map<string, FitGame[]>();
  for (const g of games)
    blocks.set(g.block, [...(blocks.get(g.block) ?? []), g]);
  const groups = [...blocks.values()];
  let seed = 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const samples = new Map<string, number[]>();
  for (let d = 0; d < draws; d++) {
    const drawn = groups.flatMap(
      () => groups[Math.floor(random() * groups.length)]
    );
    for (const [r, s] of strengths(drawn).strength)
      if (drawn.some((g) => g.roster === r))
        samples.set(r, [...(samples.get(r) ?? []), s]);
  }
  const at = (xs: number[], q: number) => xs[Math.floor(q * (xs.length - 1))];
  return new Map(
    [...samples].map(([r, xs]) => {
      xs.sort((p, q) => p - q);
      return [r, [0.5 + at(xs, 0.025), 0.5 + at(xs, 0.975)]];
    })
  );
}

/** Plays that show what a roster does more than the field does. */
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
      lift: t.plays / ownTotal / (field[play].plays / fieldTotal),
      scored: (t.scoredThisTurn + t.scoredNextTurn) / t.plays,
    }))
    .filter((s) => s.lift >= 1.25)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 3);
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
  const fitted = strengths(fitGames).strength;
  const intervals = strengthIntervals(fitGames);
  const rosters = [...new Set(counted.map((r) => r.roster))];
  return rosters
    .map((roster): RosterCard => {
      const rows = counted.filter((r) => r.roster === roster);
      const opponents = rows.map(opponentOf);
      const games = rows.length;
      const points = mean(rows.map((r) => r.points));
      const adjusted = 0.5 + fitted.get(roster)!;
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
      const foulGroups = policies.flatMap((p) =>
        Object.entries(fouls[p]).filter(([key]) =>
          key.startsWith(roster + " / ")
        )
      );
      const foulCount = foulGroups.reduce((a, [, t]) => a + t.fouls, 0);
      const byFouler = new Map<string, number>();
      for (const [key, t] of foulGroups) {
        const position = key.slice(roster.length + 3);
        byFouler.set(position, (byFouler.get(position) ?? 0) + t.fouls);
      }
      const topFouler =
        [...byFouler].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const tier = tierOf(roster);
      const scores = rows.filter((r) => r.touchdowns > 0).length / games;
      const standard = STANDARDS[tier];
      const misses = [
        adjusted < standard.points
          ? `points ${pct(adjusted)} under ${pct(standard.points)}`
          : "",
        scores < standard.scores
          ? `scores in ${pct(scores)} of games, under ${pct(standard.scores)}`
          : "",
      ].filter(Boolean);
      return {
        roster,
        tier,
        games,
        points,
        adjusted,
        pointsCi: intervals.get(roster)!,
        wins: rows.filter((r) => r.points === 1).length,
        draws: rows.filter((r) => r.points === 0.5).length,
        losses: rows.filter((r) => r.points === 0).length,
        touchdownsFor: mean(rows.map((r) => r.touchdowns)),
        touchdownsAgainst: mean(opponents.map((r) => r.touchdowns)),
        scores,
        casualtiesFor: mean(rows.map((r) => r.casualties)),
        casualtiesAgainst: mean(opponents.map((r) => r.casualties)),
        turnovers: mean(rows.map((r) => r.turnovers)),
        foulsPerGame: foulCount / games,
        sentOff:
          foulCount &&
          foulGroups.reduce((a, [, t]) => a + t.sentOff, 0) / foulCount,
        topFouler,
        signatures: signaturesOf(own, field, games),
        verdict:
          adjusted > CEILING ? "ceiling" : misses.length ? "below" : "meets",
        misses:
          adjusted > CEILING
            ? [`points ${pct(adjusted)} over the ${pct(CEILING)} ceiling`]
            : misses,
      };
    })
    .sort((a, b) => a.tier - b.tier || b.adjusted - a.adjusted);
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const num = (x: number) => x.toFixed(2);
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`
  );

function html(cards: RosterCard[], stage: string, revision: string): string {
  const below = cards.filter((c) => c.verdict !== "meets");
  const row = (c: RosterCard) => `<tr class="${c.verdict}">
<td>${esc(c.roster)}</td><td class="n">${c.tier}</td><td class="n">${c.games}</td>
<td class="n">${pct(c.adjusted)} <span class="ci">${pct(c.pointsCi[0])}–${pct(c.pointsCi[1])}</span></td><td class="n">${pct(c.points)}</td>
<td class="n">${pct(c.scores)}</td><td class="n">${num(c.touchdownsFor)}</td><td class="n">${num(c.touchdownsAgainst)}</td>
<td class="n">${num(c.casualtiesFor)}</td><td class="n">${num(c.casualtiesAgainst)}</td>
<td class="n">${num(c.foulsPerGame)}</td>
<td>${c.signatures.map((s) => `${esc(s.play)} ×${s.lift.toFixed(1)}`).join(", ") || "<span class=ci>none</span>"}</td>
<td>${c.verdict === "meets" ? "meets" : esc(c.misses.join("; "))}</td></tr>`;
  const standards = (
    Object.entries(STANDARDS) as [string, { points: number; scores: number }][]
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
p{color:#8d93a8}.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px;width:100%}
td,th{padding:5px 8px;border-bottom:1px solid #2a3352;text-align:left;vertical-align:top}th{color:#8d93a8;font-weight:500}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.ci{color:#8d93a8;font-size:12px}
tr.below td:last-child{color:#ef8a7a}tr.ceiling td:last-child{color:#e0b24a}tr.meets td:last-child{color:#8fd19e}
</style>
<h1>Team scorecard</h1>
<p>Stage ${esc(stage)}, revision <code>${esc(revision.slice(0, 12))}</code>. ${below.length} of ${cards.length} rosters miss their tier's standard.</p>
<h2>Rosters</h2>
<div class="wrap"><table><tr><th>Roster</th><th class="n">Tier</th><th class="n">Games</th><th class="n">Strength, 95%</th><th class="n">Raw points</th><th class="n">Scores</th><th class="n">TD for</th><th class="n">TD against</th><th class="n">Cas for</th><th class="n">Cas against</th><th class="n">Fouls</th><th>Signature plays, times the field</th><th>Standard</th></tr>
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
