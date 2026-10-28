/**
 * Match styles. A style is a pre-rendered stadium, a matching render of
 * every player model, and a set of colours for what Phaser draws on top.
 * Both styles share one camera and one board geometry, so a style changes
 * only how the match looks, never where anything is.
 *
 * The id is still called a pitch theme because saves and online lobbies
 * already store it under that name. Ids from before the stadium styles
 * (classic, mud, astro, wasteland) resolve to the default.
 */
export const PITCH_THEME_IDS = ["bloodbowl", "neon"] as const;

export type PitchThemeId = (typeof PITCH_THEME_IDS)[number];

export interface PitchTheme {
  id: PitchThemeId;
  name: string;
  description: string;
  /** Folder under public/ for the stadium backdrop and its meta.json. */
  stadiumPath: string;
  /** Folder under public/ for the player atlases rendered in this style. */
  spritePath: string;
  /** Glow over the whole match through a bloom post-effect. */
  bloom: boolean;
  /** Canvas colour around the stadium. */
  background: number;
  /** Squares the selected player can reach, and the Rush squares past them. */
  reach: { move: number; rush: number };
  /** Picker swatches: ground, stands and trim. */
  swatch: { ground: string; stands: string; trim: string };
}

export const PITCH_THEMES: readonly PitchTheme[] = [
  {
    id: "bloodbowl",
    name: "Blood Bowl",
    description:
      "A timber and stone ground on a sunny afternoon, team flags over the stands.",
    stadiumPath: "/stadium/bloodbowl",
    spritePath: "/sprites/bloodbowl",
    bloom: false,
    background: 0x0b0805,
    reach: { move: 0xfff2c8, rush: 0xffc23a },
    swatch: { ground: "#3f7a2a", stands: "#5b4632", trim: "#d9b45a" },
  },
  {
    id: "neon",
    name: "Neon",
    description:
      "A night-club arena: black turf, glowing lines and a crowd lit in team colours.",
    stadiumPath: "/stadium/neon",
    spritePath: "/sprites/neon",
    bloom: true,
    background: 0x04030a,
    reach: { move: 0x3dff9a, rush: 0xffb81e },
    swatch: { ground: "#141a18", stands: "#1d1626", trim: "#ff2a9d" },
  },
] as const;

export const DEFAULT_PITCH_THEME_ID: PitchThemeId = "bloodbowl";

export function isPitchThemeId(value: unknown): value is PitchThemeId {
  return (
    typeof value === "string" &&
    (PITCH_THEME_IDS as readonly string[]).includes(value)
  );
}

export function resolvePitchTheme(id?: string | null): PitchTheme {
  return (
    PITCH_THEMES.find((theme) => theme.id === id) ??
    PITCH_THEMES.find((theme) => theme.id === DEFAULT_PITCH_THEME_ID)!
  );
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
