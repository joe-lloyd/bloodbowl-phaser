import {
  InjuryType,
  type Player,
  PlayerStatus,
  PositionKeyWord,
  createPlayer,
} from "../../types/Player";
import { type Team, isLeagueMode, isPendingRecruit } from "../../types/Team";
import { SkillType, getSkill } from "../../types/Skills";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { movePlayerToBox } from "./playerLocation";
import { MAX_DEDICATED_FANS, MIN_DEDICATED_FANS } from "./sevensPrices";
import { uniquePlayerId } from "./playerSlots";

const JOURNEYMEN_FILL_TO = 7;

export interface GameReadiness {
  leagueFixture?: boolean;
  competition?: boolean;
}

export function readyForLeagueGame(
  team: Team,
  { leagueFixture = false, competition = leagueFixture }: GameReadiness = {}
): void {
  if (!isLeagueMode(team.advancementMode)) return;
  if (competition) sitOutInjured(team);
  if (leagueFixture) takeOnJourneymen(team);
}

function sitOutInjured(team: Team): void {
  for (const player of team.players) {
    if (player.injuries.includes(InjuryType.DEAD)) {
      movePlayerToBox(player, { box: "casualty", dead: true });
    } else if (player.injuries.includes(InjuryType.MISS_NEXT_GAME)) {
      player.injuries = player.injuries.filter(
        (injury) => injury !== InjuryType.MISS_NEXT_GAME
      );
      movePlayerToBox(player, { box: "casualty" });
    }
  }
}

function takeOnJourneymen(team: Team): void {
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return;
  let available = team.players.filter(
    (player) =>
      player.status === PlayerStatus.RESERVE &&
      !isPendingRecruit(team, player.id)
  ).length;
  while (available < JOURNEYMEN_FILL_TO) {
    const number = nextFreeNumber(team);
    const journeyman = createPlayer(
      template,
      team.id,
      number,
      `Journeyman #${String(number)}`
    );

    journeyman.id = uniquePlayerId(
      team,
      `${team.id}-journeyman-${String(number)}`
    );
    journeyman.playerKind = "journeyman";
    journeyman.skills = [
      ...journeyman.skills.filter((skill) => skill.type !== SkillType.LONER),
      getSkill(SkillType.LONER, "5+"),
    ];
    team.players.push(journeyman);
    available++;
  }
}

function nextFreeNumber(team: Team): number {
  const used = new Set(team.players.map((player) => player.number));
  let number = 1;
  while (used.has(number)) number++;
  return number;
}

export type GameOutcome = "win" | "draw" | "loss";

export function updateDedicatedFans(
  team: Team,
  outcome: GameOutcome,
  rollD6: () => number
): void {
  if (!isLeagueMode(team.advancementMode)) return;
  let fans = team.dedicatedFans;
  switch (outcome) {
    case "win":
      if (rollD6() >= fans) fans++;
      break;
    case "loss":
      if (rollD6() < fans) fans--;
      break;
    case "draw":
      break;
  }
  team.dedicatedFans = Math.min(
    MAX_DEDICATED_FANS,
    Math.max(MIN_DEDICATED_FANS, fans)
  );
}

export function staysOnRoster(team: Team, player: Player): boolean {
  if (player.playerKind === "journeyman")
    return isPendingRecruit(team, player.id);
  return !isDeadLeaguePlayer(team, player);
}

export function isDeadLeaguePlayer(team: Team, player: Player): boolean {
  return (
    isLeagueMode(team.advancementMode) &&
    player.injuries.includes(InjuryType.DEAD)
  );
}
