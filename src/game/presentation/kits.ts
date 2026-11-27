import { type Team, type TeamColors } from "../../types/Team";

const CLASH = 140;

const CHANGE_SHIRTS = [0xffffff, 0x1e3a5f, 0xd6b25e, 0x000000];

export function colorDistance(a: number, b: number): number {
  const [r1, g1, b1] = [(a >> 16) & 255, (a >> 8) & 255, a & 255];
  const [r2, g2, b2] = [(b >> 16) & 255, (b >> 8) & 255, b & 255];
  const redMean = (r1 + r2) / 2;
  return Math.sqrt(
    (2 + redMean / 256) * (r1 - r2) ** 2 +
      4 * (g1 - g2) ** 2 +
      (2 + (255 - redMean) / 256) * (b1 - b2) ** 2
  );
}

const apart = (shirt: number, from: number) => colorDistance(shirt, from) >= CLASH;

export function matchKits(
  home: TeamColors,
  away: TeamColors
): { home: TeamColors; away: TeamColors } {
  if (apart(away.primary, home.primary)) return { home, away };

  const shirt = [away.secondary, ...CHANGE_SHIRTS].find(
    (s) => apart(s, home.primary) && apart(s, home.secondary)
  );
  return {
    home,
    away:
      shirt === undefined ? away : { primary: shirt, secondary: away.primary },
  };
}

export function kitOf(
  teams: readonly [Team, Team],
  teamId: string
): TeamColors {
  const kits = matchKits(teams[0].colors, teams[1].colors);
  return teamId === teams[1].id ? kits.away : kits.home;
}
