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

function kitAgainst(
  team: TeamColors,
  earlier: readonly TeamColors[]
): TeamColors {
  if (earlier.every((kit) => apart(team.primary, kit.primary))) return team;
  const shirt = [team.secondary, ...CHANGE_SHIRTS].find((candidate) =>
    earlier.every(
      (kit) => apart(candidate, kit.primary) && apart(candidate, kit.secondary)
    )
  );
  return shirt === undefined ? team : { primary: shirt, secondary: team.primary };
}

export function matchKits(teams: readonly TeamColors[]): TeamColors[] {
  const kits: TeamColors[] = [];
  for (const team of teams) kits.push(kitAgainst(team, kits));
  return kits;
}

export function kitOf(teams: readonly Team[], teamId: string): TeamColors {
  const kits = matchKits(teams.map((team) => team.colors));
  const index = teams.findIndex((team) => team.id === teamId);
  const kit = kits[index] ?? kits[0];
  if (!kit) throw new Error("A match needs teams before they wear kits.");
  return kit;
}
