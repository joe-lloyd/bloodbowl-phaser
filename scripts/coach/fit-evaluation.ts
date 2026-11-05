/**
 * Writes src/simulation/ai/evaluationWeights.ts: a linear position score
 * fitted to the touchdowns each side went on to score, from the rows that
 * scripts/coach/positions.ts writes.
 *
 *     pnpm exec tsx scripts/coach/fit-evaluation.ts positions-*.jsonl > weights.ts
 *
 * Every fifth seed is held out. stderr compares the new fit with the
 * committed one on those games; copy weights.ts over the committed file
 * only when the new fit ranks them better, then bench Hard against main.
 */

import fs from "node:fs";
import {
  EvaluationWeights,
  FEATURES,
  Feature,
} from "../../src/simulation/ai/evaluate";
import { EVALUATION_WEIGHTS } from "../../src/simulation/ai/evaluationWeights";

/** Ridge penalty; the bias is left unpenalised. */
const LAMBDA = 1;

interface Row {
  seed: number;
  y: number;
  f: Record<Feature, number>;
}

/** Every row of the given files, refusing one without every feature. */
function readRows(files: string[]): Row[] {
  return files.flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line, i) => {
        const row = JSON.parse(line) as Partial<Row>;
        const missing = FEATURES.find((n) => typeof row.f?.[n] !== "number");
        if (
          typeof row.seed !== "number" ||
          typeof row.y !== "number" ||
          missing
        )
          throw new Error(
            `${file}:${i + 1}: not a position row${missing ? ` (no ${missing})` : ""}; collect again after changing the features`
          );
        return row as Row;
      })
  );
}

const vector = (row: Row) => [1, ...FEATURES.map((n) => row.f[n])];

/** Ridge regression by the normal equations and Gauss-Jordan elimination. */
function fit(xs: number[][], ys: number[]): number[] {
  const k = xs[0].length;
  const a = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  xs.forEach((x, n) => {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) a[i][j] += x[i] * x[j];
      a[i][k] += x[i] * ys[n];
    }
  });
  for (let i = 1; i < k; i++) a[i][i] += LAMBDA;
  for (let c = 0; c < k; c++) {
    let pivot = c;
    for (let r = c + 1; r < k; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < k; r++) {
      if (r === c || a[c][c] === 0) continue;
      const m = a[r][c] / a[c][c];
      for (let j = c; j <= k; j++) a[r][j] -= m * a[c][j];
    }
  }
  return a.map((row, i) => row[k] / row[i]);
}

/** The touchdown difference still to come, as weights `w` see a row. */
const predict = (w: EvaluationWeights, row: Row) =>
  FEATURES.reduce((sum, n) => sum + w[n] * row.f[n], w.bias);

/** Share of the outcome's variance the prediction explains. */
function r2(predicted: number[], rows: Row[]): number {
  const mean = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  const total = rows.reduce((s, r) => s + (r.y - mean) ** 2, 0);
  const left = rows.reduce((s, r, i) => s + (r.y - predicted[i]) ** 2, 0);
  return 1 - left / total;
}

/**
 * How often, of two positions from the same game that went on differently,
 * the one valued higher went on better. The search only ever compares.
 */
function ranked(predicted: number[], rows: Row[]): number {
  const bySeed = new Map<number, number[]>();
  rows.forEach((r, i) =>
    bySeed.set(r.seed, [...(bySeed.get(r.seed) ?? []), i])
  );
  let right = 0;
  let pairs = 0;
  for (const game of bySeed.values())
    for (let a = 0; a < game.length; a++)
      for (let b = a + 1; b < game.length; b++) {
        const [i, j] = [game[a], game[b]];
        if (rows[i].y === rows[j].y) continue;
        pairs++;
        if ((predicted[i] - predicted[j]) * (rows[i].y - rows[j].y) > 0)
          right++;
      }
  return right / pairs;
}

/** Fit, report on the held-out games, and print the weights file. */
function main() {
  const files = process.argv.slice(2);
  if (files.length === 0)
    throw new Error("usage: fit-evaluation.ts <positions.jsonl>...");
  const rows = readRows(files);
  const held = (r: Row) => r.seed % 5 === 0;
  const train = rows.filter((r) => !held(r));
  const test = rows.filter(held);
  const solved = fit(
    train.map(vector),
    train.map((r) => r.y)
  );
  const weights = Object.fromEntries([
    ["bias", solved[0]],
    ...FEATURES.map((n, i) => [n, solved[i + 1]]),
  ]) as EvaluationWeights;

  const report = (name: string, w: EvaluationWeights) => {
    const predicted = test.map((r) => predict(w, r));
    return `${name}: R2 ${r2(predicted, test).toFixed(3)}, pairs ranked right ${ranked(predicted, test).toFixed(3)}`;
  };
  process.stderr.write(
    `${train.length} positions to fit, ${test.length} held out\n` +
      `${report("new fit  ", weights)}\n${report("committed", EVALUATION_WEIGHTS)}\n`
  );

  const lines = (["bias", ...FEATURES] as const).map(
    (n) => `  ${n}: ${Number(weights[n].toPrecision(4))},`
  );
  process.stdout.write(
    `// Written by scripts/coach/fit-evaluation.ts from ${rows.length} positions of\n` +
      `// planner self-play. Refit rather than edit.\n\n` +
      `import type { EvaluationWeights } from "./evaluate";\n\n` +
      `export const EVALUATION_WEIGHTS: EvaluationWeights = {\n${lines.join("\n")}\n};\n`
  );
}

main();
