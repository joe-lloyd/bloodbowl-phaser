/**
 * Keeps the match HUD on the Stadium Broadcast kit. Every floating panel
 * takes its type sizes, faces and colours from the hud-* tokens in
 * tailwind.config.js and the primitives in HudKit.tsx. A raw size or hex
 * colour is how a header ends up with four different type sizes.
 *
 * If this fails, use the token: text-hud-xs to text-hud-4xl, font-hud-
 * display, font-hud-label or font-hud-body, and the hud colours. If no
 * token fits, add one to tailwind.config.js. Add to ALLOWED only with a
 * reason a reviewer would accept.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const HUD_DIR = join(ROOT, "src/ui/components/hud");
/** The online overlays that float over the match. */
const HUD_PAGES = [
  "TurnClock.tsx",
  "WaitingBanner.tsx",
  "ConnectionBanner.tsx",
  "OnlinePlayPage.tsx",
  "OnlineCoinFlip.tsx",
].map((file) => join(ROOT, "src/ui/pages", file));

type Rule = { name: string; pattern: RegExp };

const RULES: Rule[] = [
  { name: "arbitrary px text size", pattern: /\btext-\[\d+(?:\.\d+)?px\]/g },
  {
    name: "default Tailwind text size",
    pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
  },
  {
    name: "non-hud font family",
    pattern: /(?<![\w-])font-(?:mono|serif|sans)\b|font-\[|fontFamily/g,
  },
  { name: "raw hex colour", pattern: /#[0-9a-fA-F]{3,8}\b/g },
];

/**
 * Justified exceptions, as "file: match". Keep each one commented.
 */
const ALLOWED = new Set([
  // Display-face drop shadows are pure black. Tailwind has no text-shadow
  // token to name it.
  "src/ui/components/hud/Announcer.tsx: #000",
  "src/ui/components/hud/LoadingScreen.tsx: #000",
  // The scenario case panel is an authoring tool. Its fields hold player
  // references and checkpoint ids that people compare character by
  // character.
  "src/ui/components/hud/ScenarioCasePanel.tsx: font-mono",
]);

type Finding = { file: string; line: number; rule: string; match: string };

function scan(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  source.split("\n").forEach((text, index) => {
    for (const rule of RULES) {
      for (const match of text.matchAll(rule.pattern)) {
        findings.push({
          file,
          line: index + 1,
          rule: rule.name,
          match: match[0],
        });
      }
    }
  });
  return findings;
}

const hudFiles = () => [
  ...readdirSync(HUD_DIR)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => join(HUD_DIR, name)),
  ...HUD_PAGES,
];

describe("HUD design tokens", () => {
  it("flags each kind of drift", () => {
    const sample = [
      '<p className="text-[12px] text-sm font-mono text-[#ff8a8a]">',
      '<p className="text-hud-sm font-hud-label text-hud-bad-soft">',
    ].join("\n");
    expect(
      scan("x.tsx", sample).map(({ line, rule, match }) => [line, rule, match])
    ).toEqual([
      [1, "arbitrary px text size", "text-[12px]"],
      [1, "default Tailwind text size", "text-sm"],
      [1, "non-hud font family", "font-mono"],
      [1, "raw hex colour", "#ff8a8a"],
    ]);
  });

  it("finds no raw sizes, foreign fonts or hex colours in the HUD", () => {
    const files = hudFiles();
    expect(files.length).toBeGreaterThan(40);
    const drift = files
      .flatMap((path) => scan(relative(ROOT, path), readFileSync(path, "utf8")))
      .filter(({ file, match }) => !ALLOWED.has(`${file}: ${match}`))
      .map(
        ({ file, line, rule, match }) => `${file}:${line} ${rule}: ${match}`
      );
    expect(drift).toEqual([]);
  });
});
