/**
 * Audits dice logs: are the faces fair, does every roll take fresh numbers
 * from the generator, and do re-rolls repeat the dice they replace more
 * often than chance?
 *
 *   pnpm dice:audit <logs.json>...
 *
 * Each file holds one dice log or a list of them, as fetch.ts and
 * simulate.ts write, or as a browser's localStorage holds them.
 */
import { readFileSync } from "node:fs";
import { DiceLog, DiceLogEntry } from "../../src/game/persistence/DiceLog";

type Roll = Extract<DiceLogEntry, { kind: "roll" }>;
type Reroll = Extract<DiceLogEntry, { kind: "reroll" }>;

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: pnpm dice:audit <logs.json>...");
  process.exit(1);
}

const logs: DiceLog[] = files.flatMap((file) => {
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(data) ? data : [data];
});

const rolls = (log: DiceLog) =>
  log.entries.filter((e): e is Roll => e.kind === "roll");
const rerolls = (log: DiceLog) =>
  log.entries.filter((e): e is Reroll => e.kind === "reroll");

/** Chi-squared of observed counts against expected shares. */
function chiSquared(counts: Map<string, number>, shares: Map<string, number>) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  let chi = 0;
  for (const [face, share] of shares) {
    const expected = total * share;
    chi += ((counts.get(face) ?? 0) - expected) ** 2 / expected;
  }
  return { total, chi };
}

/** The 5% critical value for 4 and 5 degrees of freedom. */
const CRITICAL: Record<number, number> = { 4: 9.49, 5: 11.07 };

function verdict(total: number, chi: number, df: number): string {
  if (total === 0) return "no dice to judge";
  return chi <= CRITICAL[df] ? "fair" : "CHECK: unlikely by chance (5% level)";
}

// --- Each throw once ------------------------------------------------------

/**
 * Both coaches of an online match log the same throws, and a resumed match
 * can arrive in overlapping pieces. The generator's state after a throw,
 * under the match's seed, names that throw: the statistics count it once.
 * A re-roll is named by the throw just before it and its place after that
 * throw, so a re-roll only one copy holds still counts.
 */
const seen = new Set<string>();
const seenRerolls = new Set<string>();
const throws: Roll[] = [];
const rerollsOnce: { log: DiceLog; reroll: Reroll }[] = [];
let duplicates = 0;
for (const log of logs) {
  let lastKey: string | null = null;
  let rerollsSince = 0;
  for (const entry of log.entries) {
    if (entry.kind === "reroll") {
      const key = lastKey === null ? null : `${lastKey}#${rerollsSince++}`;
      if (key === null || !seenRerolls.has(key)) {
        rerollsOnce.push({ log, reroll: entry });
      }
      if (key) seenRerolls.add(key);
      continue;
    }
    lastKey = entry.rng === null ? null : `${log.seed}:${entry.rng}`;
    rerollsSince = 0;
    if (lastKey === null || !seen.has(lastKey)) throws.push(entry);
    else duplicates++;
    if (lastKey) seen.add(lastKey);
  }
}

// --- Faces ---------------------------------------------------------------

const d6 = new Map<string, number>();
const block = new Map<string, number>();
for (const roll of throws) {
  // No die was thrown, so it says nothing about the dice
  if (roll.automatic) continue;
  const values = Array.isArray(roll.value) ? roll.value : [roll.value];
  const counts = /^\d+d6$/.test(roll.diceType)
    ? d6
    : roll.diceType.endsWith("D Block")
      ? block
      : null;
  if (!counts) continue;
  for (const value of values) {
    counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  }
}
const sixth = 1 / 6;
const d6Shares = new Map(["1", "2", "3", "4", "5", "6"].map((f) => [f, sixth]));
const blockShares = new Map([
  ["skull", sixth],
  ["both-down", sixth],
  ["push", 2 * sixth],
  ["pow-dodge", sixth],
  ["pow", sixth],
]);

// --- Fresh numbers -------------------------------------------------------

/**
 * The generator's state only ever moves forward, so a roll whose state is
 * not past the one before it took numbers already used.
 */
const rewinds: string[] = [];
for (const log of logs) {
  let last: Roll | null = null;
  for (const roll of rolls(log)) {
    if (last?.rng != null && roll.rng != null && roll.rng <= last.rng) {
      rewinds.push(
        `${log.id} #${roll.seq} ${roll.rollType}: generator went back ` +
          `from ${last.rng} to ${roll.rng} (after #${last.seq} ${last.rollType})`
      );
    }
    if (roll.rng != null) last = roll;
  }
}

// --- Re-rolls ------------------------------------------------------------

/** Each block die face's chance, by the label a re-roll names it with. */
const LABEL_CHANCE: Record<string, number> = {
  "Attacker Down": sixth,
  "Both Down": sixth,
  Push: 2 * sixth,
  "POW!/Dodge": sixth,
  "POW!": sixth,
};
const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));

/** Chance a fresh roll matches `faces` exactly, die for die. */
const exactChance = (faces: string[]) =>
  faces.reduce((p, f) => p * (LABEL_CHANCE[f] ?? sixth), 1);

/** Chance a fresh roll shows the same faces in any order. */
function anyOrderChance(faces: string[]): number {
  const counts = new Map<string, number>();
  faces.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1));
  const orders =
    factorial(faces.length) /
    [...counts.values()].reduce((p, c) => p * factorial(c), 1);
  return orders * exactChance(faces);
}

/** Block dice name their faces; D6 rolls are numbers. */
const isFaces = (dice: Reroll["before"]): dice is string[] =>
  Array.isArray(dice) && dice.every((d) => typeof d === "string");

const sameAnyOrder = (a: string[], b: string[]) =>
  [...a].sort().join() === [...b].sort().join();

interface Tally {
  count: number;
  observed: number;
  expected: number;
  variance: number;
}
const tally = (): Tally => ({
  count: 0,
  observed: 0,
  expected: 0,
  variance: 0,
});
function add(t: Tally, hit: boolean, chance: number) {
  t.count++;
  if (hit) t.observed++;
  t.expected += chance;
  t.variance += chance * (1 - chance);
}
function line(label: string, t: Tally): string {
  if (t.count === 0) return `  ${label}: none`;
  const z =
    t.variance > 0 ? (t.observed - t.expected) / Math.sqrt(t.variance) : 0;
  const flag = Math.abs(z) > 3 ? "  CHECK" : "";
  return (
    `  ${label}: ${t.observed} of ${t.count}, chance gives ` +
    `${t.expected.toFixed(1)} (z ${z.toFixed(2)})${flag}`
  );
}

/** The tally for `n` dice, made on first use. */
function tallyFor(byDice: Map<number, Tally>, n: number): Tally {
  const found = byDice.get(n) ?? tally();
  byDice.set(n, found);
  return found;
}

const blockExact = new Map<number, Tally>();
const blockAnyOrder = new Map<number, Tally>();
const d6Repeat = tally();
const repeated: string[] = [];
for (const { log, reroll: r } of rerollsOnce) {
  if (r.repeated) {
    repeated.push(
      `${log.id} #${r.seq} half ${r.half} turn ${r.turn}: ` +
        `${r.source}${r.skill ? ` (${r.skill})` : ""} ${r.rollKind} ` +
        `${JSON.stringify(r.before)} again`
    );
  }
  const { before, after } = r;
  if (isFaces(before) && isFaces(after)) {
    const n = before.length;
    // Pro, Brawler and Hatred re-roll one die, so only whole-roll re-rolls compare
    if (r.source !== "team" && r.source !== "veteran") continue;
    add(tallyFor(blockExact, n), r.repeated, exactChance(before));
    add(
      tallyFor(blockAnyOrder, n),
      sameAnyOrder(before, after),
      anyOrderChance(before)
    );
  } else {
    // A D6 roll, or several D6 such as an Armour Roll: each die 1 in 6
    const dice = Array.isArray(before) ? before.length : 1;
    add(d6Repeat, r.repeated, sixth ** dice);
  }
}

// --- Report --------------------------------------------------------------

console.log(`Dice audit: ${logs.length} match logs\n`);
for (const log of logs) {
  const started = new Date(log.startedAt).toISOString().slice(0, 16);
  const teams = log.teams.map((t) => `${t.name} (${t.roster})`).join(" v ");
  const flagged = rerolls(log).filter((r) => r.repeated).length;
  console.log(
    `  ${started} ${log.mode} ${teams}: ${rolls(log).length} rolls, ` +
      `${rerolls(log).length} re-rolls, ${flagged} repeated  [${log.id}]`
  );
}

const d6Chi = chiSquared(d6, d6Shares);
const blockChi = chiSquared(block, blockShares);
console.log(
  duplicates > 0
    ? `\n${duplicates} throws appear in more than one log, such as both ` +
        `coaches' copies of an online match; each is counted once below.`
    : ""
);
console.log(`\nFaces`);
console.log(
  `  D6: ${d6Chi.total} dice, ${[...d6Shares.keys()].map((f) => `${f}:${d6.get(f) ?? 0}`).join(" ")}` +
    `, chi² ${d6Chi.chi.toFixed(2)}: ${verdict(d6Chi.total, d6Chi.chi, 5)}`
);
console.log(
  `  Block: ${blockChi.total} dice, ${[...blockShares.keys()].map((f) => `${f}:${block.get(f) ?? 0}`).join(" ")}` +
    `, chi² ${blockChi.chi.toFixed(2)}: ${verdict(blockChi.total, blockChi.chi, 4)}`
);

console.log(`\nFresh numbers`);
console.log(
  rewinds.length === 0
    ? `  Every roll took numbers the generator had not used before.`
    : `  CHECK: ${rewinds.length} rolls reused numbers:\n    ${rewinds.join("\n    ")}`
);

console.log(`\nRe-rolls that came up the same as the roll they replaced`);
for (const n of [...blockExact.keys()].sort()) {
  console.log(
    line(`${n}-dice block, same faces same order`, tallyFor(blockExact, n))
  );
  console.log(
    line(`${n}-dice block, same faces any order`, tallyFor(blockAnyOrder, n))
  );
}
console.log(line(`D6 re-roll, same dice`, d6Repeat));
if (repeated.length > 0 && repeated.length <= 50) {
  console.log(`\nEvery repeated re-roll`);
  repeated.forEach((r) => console.log(`  ${r}`));
}
