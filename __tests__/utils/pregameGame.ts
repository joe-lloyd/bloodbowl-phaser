import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { GameService } from "../../src/services/GameService";
import { createLineupTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import {
  DEFAULT_GAME_TYPE,
  type GameType,
} from "../../src/game/variants/gameTypes";
import { startingFormat } from "../../src/game/variants/startingFormat";
import { Inducement } from "../../src/types/Inducements";

export function pregameGame(
  draft = false,
  gameType: GameType = DEFAULT_GAME_TYPE
) {
  const team1 = stabilizeIds(
    createLineupTeam(RosterName.HUMAN, "Home", 1),
    "team1"
  );
  const team2 = stabilizeIds(
    createLineupTeam(RosterName.HUMAN, "Away", 2),
    "team2"
  );
  team1.advancementMode = draft ? "matched-play" : "advanced-league";
  team2.advancementMode = "advanced-league";
  team2.rerolls += 3;
  if (draft)
    team1.draftInducements = [
      { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 1 },
    ];
  return new HeadlessGame({
    teams: [team1, team2],
    seed: 23,
    initialState: GameService.createMatchState({ teams: [team1, team2], startingPhase: GamePhase.SETUP, startingSubPhase: SubPhase.INTRO, fixture: { pregameInducements: true }, ...startingFormat({ gameType }) }
    ),
  });
}
