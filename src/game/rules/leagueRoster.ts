/**
 * League roster carry-over between games (docs/SEVENS_RULES.md I4, I5, L2)
 * and the post-game Dedicated Fans roll (D7).
 *
 * The Sevens injury tables record Seriously Hurt as Miss Next Game and Dead
 * on the player. Before a league game the player due to miss it sits in the
 * Casualty box and the record is struck, so the team saved after the game
 * has them back. A dead player leaves the Team Draft List when the team is
 * next loaded. A team left short of 7 players takes on Journeymen, who leave
 * again after the game: there is no post-game hiring yet.
 */

import {
  InjuryType,
  Player,
  PlayerStatus,
  PositionKeyWord,
  createPlayer,
} from "../../types/Player";
import { Team, isLeagueMode } from "../../types/Team";
import { SkillType, getSkill } from "../../types/Skills";
import { getRosterByRosterName } from "../../data/RosterTemplates";
import { movePlayerToBox } from "./playerLocation";
import { MAX_DEDICATED_FANS, MIN_DEDICATED_FANS } from "./sevensPrices";

/** L2: Journeymen fill a league team up to this many available players. */
export const JOURNEYMEN_FILL_TO = 7;

/**
 * Ready a league team at the start of a game, after every player has been
 * put in the Reserves: a dead player goes to the Casualty box, a Miss Next
 * Game player serves the game there, and Journeymen make up the numbers.
 */
export function readyForLeagueGame(team: Team): void {
  if (!isLeagueMode(team.advancementMode)) return;
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
  takeOnJourneymen(team);
}

/**
 * L2: while the team cannot field 7 players, add a Lineman Journeyman with
 * Loner (5+) to the Reserves. The roster's first Lineman position is used.
 */
function takeOnJourneymen(team: Team): void {
  const template = getRosterByRosterName(team.rosterName).playerTemplates.find(
    (candidate) => candidate.keywords.includes(PositionKeyWord.LINEMAN)
  );
  if (!template) return;
  let available = team.players.filter(
    (player) => player.status === PlayerStatus.RESERVE
  ).length;
  while (available < JOURNEYMEN_FILL_TO) {
    const number = nextFreeNumber(team);
    const journeyman = createPlayer(
      template,
      team.id,
      number,
      `Journeyman #${number}`
    );
    journeyman.id = `${team.id}-journeyman-${number}`;
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

/**
 * Update Dedicated Fans in the post-game sequence (2025 rulebook p.99): a
 * win adds one on a D6 at or over the current fans, a loss takes one away
 * on a D6 under them, and a draw changes nothing. Sevens keeps league fans
 * between 1 and 5 (D7). Matched Play has no post-game, so nothing is rolled.
 */
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

/**
 * Whether a stored player is still on the Team Draft List: Journeymen leave
 * after the game they played, and a dead league player is removed.
 */
export function staysOnRoster(team: Team, player: Player): boolean {
  if (player.playerKind === "journeyman") return false;
  return !(
    isLeagueMode(team.advancementMode) &&
    player.injuries.includes(InjuryType.DEAD)
  );
}
