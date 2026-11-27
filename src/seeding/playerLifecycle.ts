import { RosterName, type Team, calculateTeamValue } from "../types/Team";
import {
  ASSISTANT_COACH_COST,
  CHEERLEADER_COST,
  DEDICATED_FAN_COST,
} from "../game/rules/sevensPrices";
import {
  InjuryType,
  type Player,
  type PlayerCareerStats,
  type PlayerStats,
  PositionKeyWord,
} from "../types/Player";
import {
  type AdvancementChoice,
  applyAdvancement,
  eligibleSkills,
} from "../game/progression/progression";
import {
  allocateMatchedPlaySkill,
  createPendingSkillSelection,
  eligibleSkillSelectionPlayers,
} from "../game/progression/advancementModes";
import { getRosterByRosterName } from "../data/RosterTemplates";

interface SkillPick {
  access: "primary" | "secondary";

  index: number;
}

interface CharacteristicPick {
  stat: keyof PlayerStats;
}

interface PlayerDecorationPlan {
  keyword: PositionKeyWord;
  matches: number;

  unspentSpp?: number;
  advancements?: (SkillPick | CharacteristicPick)[];
  injuries?: InjuryType[];
}

interface TeamDecorationPlan {
  rosterName: RosterName;

  staff?: { coaches?: number; cheerleaders?: number; dedicatedFans?: number };
  players: PlayerDecorationPlan[];
}

function isSkillPick(pick: SkillPick | CharacteristicPick): pick is SkillPick {
  return (pick as SkillPick).access !== undefined;
}

function toAdvancementChoice(
  player: Player,
  pick: SkillPick | CharacteristicPick
): AdvancementChoice {
  if (!isSkillPick(pick)) {
    return { kind: "characteristic", roll: 8, stat: pick.stat };
  }
  const categories =
    pick.access === "primary" ? player.primary : player.secondary;
  const eligible = eligibleSkills(player, categories ?? []);
  const skill = eligible[pick.index];
  if (!skill) {
    throw new Error(
      `decoration: no eligible ${pick.access} skill at index ${String(pick.index)} ` +
        `for ${player.positionName}`
    );
  }
  return {
    kind: pick.access === "primary" ? "chosen-primary" : "chosen-secondary",
    skill,
  };
}

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
  const completions = remaining;
  return {
    matches,
    completions,
    interceptions: 0,
    casualties,
    touchdowns,
    mvps,

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
  const surplus = 1000;
  player.spp = surplus;
  const advancementPicks = plan.advancements ?? [];
  for (const pick of advancementPicks) {
    applyAdvancement(player, toAdvancementChoice(player, pick));
  }
  const spent = surplus - player.spp;
  const unspent = plan.unspentSpp ?? 0;
  player.spp = unspent;

  const injuryList = plan.injuries ?? [];
  for (const injury of injuryList) {
    player.injuries.push(injury);
    const stat = STAT_DECREASE_INJURIES[injury];
    if (!stat) continue;
    const direction = stat === "AG" || stat === "PA" ? 1 : -1;
    player.stats[stat] += direction;
  }

  const earned = spent + unspent;
  if (earned > 0 || plan.matches > 0) {
    player.careerStats = careerStatsFor(earned, plan.matches);
  }
}

const TEAM_DECORATIONS: TeamDecorationPlan[] = [
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

const MATCHED_PLAY_DEMO_MATCHES = 3;

function decorateMatchedPlayDemo(team: Team): void {
  const recipient = team.players.find(
    (player) => (player.primary ?? []).length > 0
  );
  if (!recipient) return;
  const [category] = recipient.primary ?? [];
  if (!category) return;
  const skill = eligibleSkills(recipient, [category])[0];
  if (!skill) return;

  const roster = getRosterByRosterName(team.rosterName);
  allocateMatchedPlaySkill(team, roster, recipient, skill, "primary");
  recipient.careerStats = careerStatsFor(0, MATCHED_PLAY_DEMO_MATCHES);
  team.teamValue = calculateTeamValue(team);
}

function decorateSkillSelectionDemo(team: Team): void {
  const eligible = eligibleSkillSelectionPlayers(team);
  if (eligible.length === 0) return;
  createPendingSkillSelection(team, "seed-demo-match", eligible);
}

export function decorateSeedTeams(teams: Team[]): void {
  const byRoster = new Map(teams.map((team) => [team.rosterName, team]));

  for (const plan of TEAM_DECORATIONS) {
    const team = byRoster.get(plan.rosterName);
    if (!team) continue;

    for (const playerPlan of plan.players) {
      const player = team.players.find(
        (candidate) =>
          candidate.keywords.includes(playerPlan.keyword) &&
          !candidate.careerStats
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
        (plan.staff.coaches ?? 0) * ASSISTANT_COACH_COST +
        (plan.staff.cheerleaders ?? 0) * CHEERLEADER_COST +
        (plan.staff.dedicatedFans ?? 0) * DEDICATED_FAN_COST;
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

  const matchedPlayTeam = teams.find(
    (team) => team.advancementMode === "matched-play"
  );
  if (matchedPlayTeam) decorateMatchedPlayDemo(matchedPlayTeam);

  const skillSelectionTeam = teams.find(
    (team) => team.advancementMode === "sevens-skill-selection"
  );
  if (skillSelectionTeam) decorateSkillSelectionDemo(skillSelectionTeam);
}
