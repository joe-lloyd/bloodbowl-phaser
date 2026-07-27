/**
 * Player lifecycle fixtures: deterministic rookies, SPP-earners,
 * multi-advancement veterans, injured players, and one advancement-capped
 * Legend — all progressed through the normal progression services
 * (applyAdvancement), so SPP spending, value increases, and skill legality
 * are enforced by the same code user flows use.
 *
 * Career statistics are synthesized canonically from the player's earned
 * SPP (MVP 4, TD 3, casualty/interception 2, completion 1), so the stored
 * stat lines always reproduce the stored progression totals:
 *   careerStats.sppEarned === unspentSpp + Σ advancement sppCost
 */

import { RosterName, Team, calculateTeamValue } from "../types/Team";
import {
  InjuryType,
  Player,
  PlayerCareerStats,
  PlayerStats,
  PositionKeyWord,
} from "../types/Player";
import {
  AdvancementChoice,
  applyAdvancement,
  eligibleSkills,
} from "../game/progression/progression";

/** Pick a skill by index from the player's currently eligible list. */
interface SkillPick {
  access: "primary" | "secondary";
  /** Index into eligibleSkills(player, categories) at application time. */
  index: number;
}

interface CharacteristicPick {
  stat: keyof PlayerStats;
}

export interface PlayerDecorationPlan {
  /** Decorate the first rostered player carrying this positional keyword. */
  keyword: PositionKeyWord;
  matches: number;
  /** SPP left unspent after advancements (default 0). */
  unspentSpp?: number;
  advancements?: (SkillPick | CharacteristicPick)[];
  injuries?: InjuryType[];
}

export interface TeamDecorationPlan {
  rosterName: RosterName;
  /** Optional staff/fan purchases (10k each, debited from the treasury). */
  staff?: { coaches?: number; cheerleaders?: number; dedicatedFans?: number };
  players: PlayerDecorationPlan[];
}

function isSkillPick(
  pick: SkillPick | CharacteristicPick
): pick is SkillPick {
  return (pick as SkillPick).access !== undefined;
}

function toAdvancementChoice(
  player: Player,
  pick: SkillPick | CharacteristicPick
): AdvancementChoice {
  if (!isSkillPick(pick)) {
    // A D8 roll of 8 offers every characteristic (subject to the per-stat
    // caps), so the choice is always present unless the stat is maxed.
    return { kind: "characteristic", roll: 8, stat: pick.stat };
  }
  const categories = pick.access === "primary" ? player.primary : player.secondary;
  const eligible = eligibleSkills(player, categories ?? []);
  const skill = eligible[pick.index];
  if (!skill) {
    throw new Error(
      `decoration: no eligible ${pick.access} skill at index ${pick.index} ` +
        `for ${player.positionName}`
    );
  }
  return {
    kind: pick.access === "primary" ? "chosen-primary" : "chosen-secondary",
    skill,
  };
}

/** Canonical career line whose SPP table value reproduces `sppEarned`. */
export function careerStatsFor(
  sppEarned: number,
  matches: number
): PlayerCareerStats {
  let remaining = sppEarned;
  const mvps = Math.min(Math.floor(matches / 2), Math.floor(remaining / 4));
  remaining -= mvps * 4;
  const touchdowns = Math.floor(remaining / 3);
  remaining -= touchdowns * 3;
  const casualties = Math.floor(remaining / 2);
  remaining -= casualties * 2;
  const completions = remaining; // 1 SPP each
  return {
    matches,
    completions,
    interceptions: 0,
    casualties,
    touchdowns,
    mvps,
    // Informational-only counters carry no SPP; seed fixtures pick
    // plausible values that need not reconcile against sppEarned.
    kills: 0,
    squaresMoved: 0,
    passesAttempted: completions,
    sppEarned,
  };
}

const STAT_DECREASE_INJURIES: Partial<Record<InjuryType, keyof PlayerStats>> = {
  [InjuryType.STAT_DECREASE_MA]: "MA",
  [InjuryType.STAT_DECREASE_ST]: "ST",
  [InjuryType.STAT_DECREASE_AG]: "AG",
  [InjuryType.STAT_DECREASE_AV]: "AV",
};

function decoratePlayer(player: Player, plan: PlayerDecorationPlan): void {
  // Advancements run through the normal progression service with a
  // temporary SPP surplus; spending is measured, then the fixture's
  // intended unspent balance is stored.
  const surplus = 1_000;
  player.spp = surplus;
  for (const pick of plan.advancements ?? []) {
    applyAdvancement(player, toAdvancementChoice(player, pick));
  }
  const spent = surplus - player.spp;
  const unspent = plan.unspentSpp ?? 0;
  player.spp = unspent;

  for (const injury of plan.injuries ?? []) {
    player.injuries.push(injury);
    const stat = STAT_DECREASE_INJURIES[injury];
    if (stat) {
      // AG/PA are inverted scales: "worse" is the higher number.
      const direction = stat === "AG" || stat === "PA" ? 1 : -1;
      player.stats[stat] += direction;
    }
  }

  const earned = spent + unspent;
  if (earned > 0 || plan.matches > 0) {
    player.careerStats = careerStatsFor(earned, plan.matches);
  }
}

/**
 * The lifecycle catalog: rookies everywhere else; here a capped Legend
 * (Orc Blitzer), a multi-advancement Thrower, an SPP-earning Catcher, an
 * injured Lineman, and a stat-decreased Runner.
 */
export const TEAM_DECORATIONS: TeamDecorationPlan[] = [
  {
    rosterName: RosterName.HUMAN,
    staff: { coaches: 1, cheerleaders: 1, dedicatedFans: 1 },
    players: [
      {
        keyword: PositionKeyWord.THROWER,
        matches: 6,
        unspentSpp: 4,
        advancements: [
          { access: "primary", index: 0 },
          { access: "primary", index: 1 },
          { stat: "MA" },
        ],
      },
      {
        keyword: PositionKeyWord.CATCHER,
        matches: 3,
        unspentSpp: 9,
      },
      {
        keyword: PositionKeyWord.LINEMAN,
        matches: 2,
        injuries: [InjuryType.MISS_NEXT_GAME],
      },
    ],
  },
  {
    rosterName: RosterName.ORC,
    staff: { coaches: 1, cheerleaders: 1, dedicatedFans: 1 },
    players: [
      {
        keyword: PositionKeyWord.BLITZER,
        matches: 10,
        advancements: [
          { access: "primary", index: 0 },
          { access: "primary", index: 1 },
          { access: "secondary", index: 0 },
          { stat: "MA" },
          { stat: "AV" },
          { access: "primary", index: 2 },
        ],
      },
    ],
  },
  {
    rosterName: RosterName.DWARF,
    staff: { coaches: 1, cheerleaders: 1, dedicatedFans: 1 },
    players: [
      {
        keyword: PositionKeyWord.RUNNER,
        matches: 4,
        unspentSpp: 2,
        advancements: [{ access: "primary", index: 0 }],
        injuries: [InjuryType.STAT_DECREASE_MA],
      },
    ],
  },
  {
    rosterName: RosterName.SKAVEN,
    staff: { coaches: 1, cheerleaders: 1, dedicatedFans: 1 },
    players: [
      {
        keyword: PositionKeyWord.RUNNER,
        matches: 5,
        advancements: [
          { access: "primary", index: 0 },
          { access: "primary", index: 1 },
        ],
      },
    ],
  },
];

const STAFF_UNIT_COST = 10_000;

/**
 * Apply the decoration plans to the built seed teams (mutates in place).
 * Staff purchases are debited from the treasury at the standard 10k price;
 * team value and career touchdown/casualty totals are re-derived last.
 */
export function decorateSeedTeams(teams: Team[]): void {
  const byRoster = new Map(teams.map((team) => [team.rosterName, team]));

  for (const plan of TEAM_DECORATIONS) {
    const team = byRoster.get(plan.rosterName);
    if (!team) continue;

    for (const playerPlan of plan.players) {
      const player = team.players.find(
        (candidate) =>
          candidate.keywords.includes(playerPlan.keyword) && !candidate.careerStats
      );
      if (!player) {
        throw new Error(
          `decoration: no undecorated ${playerPlan.keyword} on ${plan.rosterName}`
        );
      }
      decoratePlayer(player, playerPlan);
    }

    if (plan.staff) {
      const staffCost =
        ((plan.staff.coaches ?? 0) +
          (plan.staff.cheerleaders ?? 0) +
          (plan.staff.dedicatedFans ?? 0)) *
        STAFF_UNIT_COST;
      if (team.treasury >= staffCost) {
        team.coaches += plan.staff.coaches ?? 0;
        team.cheerleaders += plan.staff.cheerleaders ?? 0;
        team.dedicatedFans += plan.staff.dedicatedFans ?? 0;
        team.treasury -= staffCost;
      }
    }

    team.teamValue = calculateTeamValue(team);
    team.touchdowns = team.players.reduce(
      (sum, player) => sum + (player.careerStats?.touchdowns ?? 0),
      0
    );
    team.casualties = team.players.reduce(
      (sum, player) => sum + (player.careerStats?.casualties ?? 0),
      0
    );
  }
}
