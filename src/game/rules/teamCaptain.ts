import { getRosterByRosterName } from "../../data/RosterTemplates";
import { InjuryType, type Player, TraitKeyWord } from "../../types/Player";
import { SkillType, getSkill, hasSkill } from "../../types/Skills";
import { type Team, TeamSpecialRule, isLeagueMode } from "../../types/Team";
import { type TeamAllegiance, hasTeamSpecialRule } from "./teamAllegiance";
import { type EditDecision } from "./teamEditLegality";
import { isActiveTeam } from "./teamLifecycle";

export function hasTeamCaptainRule(team: TeamAllegiance): boolean {
  return hasTeamSpecialRule(team, TeamSpecialRule.TEAM_CAPTAIN);
}

export function teamCaptain(team: Pick<Team, "players">): Player | undefined {
  return team.players.find((player) => player.teamCaptain);
}

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

export function appointTeamCaptain(team: Team, chosen: Player): void {
  for (const player of team.players) {
    setTeamCaptain(team, player, player === chosen);
  }
}

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
