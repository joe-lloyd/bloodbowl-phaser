import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderSetupBaseline } from "./setupVisualBaseline";

describe("fixed-viewport Sevens setup visual baselines", () => {
  it.each([
    [true, "team1-valid-setup.svg"],
    [false, "team2-valid-setup.svg"],
  ])("matches the valid final setup for team side %s", (isTeam1, file) => {
    const expected = readFileSync(
      resolve(process.cwd(), "__tests__", "headless", "screenshots", file),
      "utf8"
    ).trim();
    expect(renderSetupBaseline(isTeam1)).toBe(expected);
    expect(expected).toContain('width="1200" height="660"');
    expect(expected.match(/<circle /g)).toHaveLength(7);
  });
});
