import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const UI_DIR = join(ROOT, "src/ui");
const SHARED = "src/ui/components/componentWarehouse/";

interface Rule {
  name: string;
  pattern: RegExp;
  sharedMay?: boolean;
}

const RULES: Rule[] = [
  {
    name: "arbitrary text size",
    pattern: /\btext-\[(?:\d+(?:\.\d+)?(?:px|rem)|clamp)[^\]]*\]/g,
  },
  {
    name: "default Tailwind text size",
    pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
  },
  {
    name: "non-hud font family",
    pattern: /(?<![\w-])font-(?:mono|serif|sans)\b|font-\[|fontFamily/g,
  },
  { name: "raw hex colour", pattern: /#[0-9a-fA-F]{3,8}\b/g },
  {
    name: "Tailwind palette colour",
    pattern:
      /(?<![\w-])(?:text|bg|border)-(?:red|green|blue|yellow|gray|amber|orange|purple)-\d+/g,
  },
  {
    name: "hand-made heading, use Title",
    pattern: /<h[1-6]\s+className/g,
    sharedMay: true,
  },
  {
    name: "hand-made title, use Title",
    pattern:
      /font-hud-display text-hud-(?:lg|xl|2xl|3xl|4xl) uppercase (?:tracking-\[[^\]]*\] )?text-hud-bone/g,
    sharedMay: true,
  },
  {
    name: "field with its own height",
    pattern: /hud-field[^"`]*min-h-\[[^\]]*\]/g,
  },
  {
    name: "button with its own fill, use a variant",
    pattern: /<HudButton\b[^<>]*className="[^"]*\bbg-hud-\w+/g,
  },
  {
    name: "hand-made panel, use Panel",
    pattern: /(?<![\w-])hud-slab(?![\w/-])/g,
    sharedMay: true,
  },
];

const MATCH_CHROME = [
  "hud/ActionPlanCard",
  "hud/DiceTray",
  "hud/FormationPicker",
  "hud/FullscreenButton",
  "hud/GameHUD",
  "hud/MatchOptionsMenu",
  "hud/MatchStrip",
  "hud/MovePlanBar",
  "hud/PhoneDice",
  "hud/PlayerInfoPanel",
  "hud/RefusalNotice",
  "hud/ScoreBoard",
  "shared/RollTray",
].map((name) => `src/ui/components/${name}.tsx: hud-slab`);

const ALLOWED = new Set([
  ...MATCH_CHROME,
  "src/ui/pages/TurnClock.tsx: hud-slab",
  "src/ui/pages/WaitingBanner.tsx: hud-slab",
  "src/ui/pages/GamePage.tsx: #000000",
  "src/ui/components/hud/Announcer.tsx: #000",
  "src/ui/components/hud/LoadingScreen.tsx: #000",
  "src/ui/components/hud/ScenarioCasePanel.tsx: font-mono",
  "src/ui/components/hud/DiceLog.tsx: hud-field flex-1 !min-h-[32px]",
  "src/ui/components/hud/TurnoverOverlay.tsx: <h1 className",
  "src/ui/components/hud/TurnoverOverlay.tsx: text-[clamp(64px,10vw,120px)]",
  "src/ui/components/componentWarehouse/HudBits.tsx: #ffe9a8",
  "src/ui/components/componentWarehouse/HudBits.tsx: #8a6a22",
]);

interface Finding {
  file: string;
  line: number;
  rule: string;
  match: string;
}

function scan(file: string, source: string): Finding[] {
  return RULES.filter(
    (rule) => !rule.sharedMay || !file.startsWith(SHARED)
  ).flatMap((rule) =>
    [...source.matchAll(rule.pattern)].map((match) => ({
      file,
      line: source.slice(0, match.index).split("\n").length,
      rule: rule.name,
      match: match[0].replace(/\s+/g, " "),
    }))
  );
}

const uiFiles = () =>
  readdirSync(UI_DIR, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(UI_DIR, name));

describe("the design rules", () => {
  it("flags each kind of drift", () => {
    const sample = [
      '<p className="text-[12px] text-sm font-mono text-[#ff8a8a] bg-red-500">',
      '<p className="text-hud-sm font-hud-label text-hud-bad-soft">',
      '<h2\n  className="text-hud-lg">Mine</h2>',
      '<span className="font-hud-display text-hud-xl uppercase text-hud-bone">',
      '<input className="hud-field min-h-[30px]" />',
      '<HudButton className="bg-hud-gold">Go</HudButton>',
      '<div className="hud-slab p-2">',
    ].join("\n");
    expect(
      scan("x.tsx", sample)
        .map(({ line, rule, match }) => [line, rule, match])
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    ).toEqual([
      [1, "arbitrary text size", "text-[12px]"],
      [1, "default Tailwind text size", "text-sm"],
      [1, "non-hud font family", "font-mono"],
      [1, "raw hex colour", "#ff8a8a"],
      [1, "Tailwind palette colour", "bg-red-500"],
      [3, "hand-made heading, use Title", "<h2 className"],
      [
        5,
        "hand-made title, use Title",
        "font-hud-display text-hud-xl uppercase text-hud-bone",
      ],
      [6, "field with its own height", "hud-field min-h-[30px]"],
      [
        7,
        "button with its own fill, use a variant",
        '<HudButton className="bg-hud-gold',
      ],
      [8, "hand-made panel, use Panel", "hud-slab"],
    ]);
  });

  it("finds no screen with its own version of a shared rule", () => {
    const files = uiFiles();
    expect(files.length).toBeGreaterThan(100);
    const drift = files
      .flatMap((path) => scan(relative(ROOT, path), readFileSync(path, "utf8")))
      .filter(({ file, match }) => !ALLOWED.has(`${file}: ${match}`))
      .map(
        ({ file, line, rule, match }) =>
          `${file}:${String(line)} ${rule}: ${match}`
      );
    expect(drift).toEqual([]);
  });
});
