import { Team, TeamColors } from "../../types/Team";

/**
 * Shirts closer than this look alike on the pitch. Measured with the
 * "redmean" colour distance, 0 to about 765: the Team Builder's Blood Red
 * and Deep Crimson are 61 apart, its Ink Blue and Text Dark 130.
 */
const CLASH = 140;

/** Shirts an away side can change into, the clearest first. */
const CHANGE_SHIRTS = [0xffffff, 0x1e3a5f, 0xd6b25e, 0x000000];

function distance(a: number, b: number): number {
  const [r1, g1, b1] = [(a >> 16) & 255, (a >> 8) & 255, a & 255];
  const [r2, g2, b2] = [(b >> 16) & 255, (b >> 8) & 255, b & 255];
  const redMean = (r1 + r2) / 2;
  return Math.sqrt(
    (2 + redMean / 256) * (r1 - r2) ** 2 +
      4 * (g1 - g2) ** 2 +
      (2 + (255 - redMean) / 256) * (b1 - b2) ** 2
  );
}

/**
 * What each side wears in a match. When the away side's shirts would look
 * like the home side's, it changes kit: into its own colours swapped if
 * that shirt stands apart from both home colours, otherwise into the first
 * change shirt that does. The teams' own colours never change.
 */
export function matchKits(
  home: TeamColors,
  away: TeamColors
): { home: TeamColors; away: TeamColors } {
  const apart = (shirt: number, from: number) => distance(shirt, from) >= CLASH;
  if (apart(away.primary, home.primary)) return { home, away };
  // The home trim shows as much as the shirt, so the change shirt must
  // stand apart from both.
  const shirt = [away.secondary, ...CHANGE_SHIRTS].find(
    (s) => apart(s, home.primary) && apart(s, home.secondary)
  );
  return {
    home,
    away:
      shirt === undefined ? away : { primary: shirt, secondary: away.primary },
  };
}

/** The kit `teamId` wears, with `teams` in team 1 (home), team 2 order. */
export function kitOf(
  teams: readonly [Team, Team],
  teamId: string
): TeamColors {
  const kits = matchKits(teams[0].colors, teams[1].colors);
  return teamId === teams[1].id ? kits.away : kits.home;
}
