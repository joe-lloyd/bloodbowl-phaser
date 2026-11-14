/**
 * Team Captain (2025 rulebook p.155, with the May 2026 errata). When
 * drafting, a team with this special rule may name any player except a Big
 * Guy as its Team Captain, who gains Pro without raising their value. While
 * the Captain is on the pitch, every Team Re-roll the team uses rolls a D6,
 * and on a natural 6 it is free (skills/rerolls.ts). At the start of each
 * Drive the Captain must be set up if able (SetupManager). Should the
 * Captain leave the roster, the team may appoint a new one in the Pre-game
 * Sequence of its next League Fixture (AppointTeamCaptainOperation).
 *
 * The title lives on the player, as the Veteran's does, so saves, the
 * online lobby and match snapshots carry it with the roster.
 */

import { getRosterByRosterName } from "../../data/RosterTemplates";
import { InjuryType, Player, TraitKeyWord } from "../../types/Player";
import { SkillType, getSkill, hasSkill } from "../../types/Skills";
import { Team, TeamSpecialRule, isLeagueMode } from "../../types/Team";
import { TeamAllegiance, hasTeamSpecialRule } from "./teamAllegiance";
import { EditDecision } from "./teamEditLegality";
import { isActiveTeam } from "./teamLifecycle";

export function hasTeamCaptainRule(team: TeamAllegiance): boolean {
  return hasTeamSpecialRule(team, TeamSpecialRule.TEAM_CAPTAIN);
}

export function teamCaptain(team: Pick<Team, "players">): Player | undefined {
  return team.players.find((player) => player.teamCaptain);
}

/** Any player on the roster may lead it, except a Big Guy. */
export function mayCaptain(player: Player): boolean {
  return (
    (player.playerKind ?? "roster") === "roster" &&
    !player.keywords.includes(TraitKeyWord.BIG_GUY)
  );
}

function hasNativePro(team: Team, player: Player): boolean {
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === player.positionName
  );
  return (
    (!!template && hasSkill(template.skills, SkillType.PRO)) ||
    (player.advancements ?? []).some(
      (advance) => advance.name === SkillType.PRO
    )
  );
}

function setTeamCaptain(team: Team, player: Player, captain: boolean): void {
  if (!!player.teamCaptain === captain) return;
  if (captain) {
    player.teamCaptain = true;
    if (!hasSkill(player.skills, SkillType.PRO)) {
      player.skills.push(getSkill(SkillType.PRO));
    }
  } else {
    delete player.teamCaptain;
    if (!hasNativePro(team, player)) {
      player.skills = player.skills.filter(
        (skill) => skill.type !== SkillType.PRO
      );
    }
  }
}

/** Give the title to `chosen` alone, taking it and its Pro off anyone else. */
export function appointTeamCaptain(team: Team, chosen: Player): void {
  team.players.forEach((player) =>
    setTeamCaptain(team, player, player === chosen)
  );
}

/**
 * Make `playerId` the Team Captain while drafting. Refused for a roster
 * without the rule, for a Big Guy, and once the team has played.
 */
export function chooseTeamCaptain(team: Team, playerId: string): EditDecision {
  if (!hasTeamCaptainRule(team)) {
    return {
      allowed: false,
      reason: `${team.rosterName} teams do not have the Team Captain rule.`,
    };
  }
  if (isActiveTeam(team)) {
    return {
      allowed: false,
      reason:
        "The Team Captain is named when drafting. A new one is appointed only before the next league fixture after the Captain leaves.",
    };
  }
  const chosen = team.players.find((player) => player.id === playerId);
  if (!chosen || !mayCaptain(chosen)) {
    return {
      allowed: false,
      reason: "A Big Guy cannot be the Team Captain.",
    };
  }
  appointTeamCaptain(team, chosen);
  return { allowed: true };
}

/**
 * Who the team may appoint in the Pre-game Sequence of a League Fixture:
 * every eligible player still on the roster, when an active league team
 * with the rule has no Captain. Empty otherwise.
 */
export function captainVacancyCandidates(team: Team): Player[] {
  if (
    !hasTeamCaptainRule(team) ||
    !isActiveTeam(team) ||
    !isLeagueMode(team.advancementMode) ||
    teamCaptain(team)
  ) {
    return [];
  }
  return team.players.filter(
    (player) => mayCaptain(player) && !player.injuries.includes(InjuryType.DEAD)
  );
}
