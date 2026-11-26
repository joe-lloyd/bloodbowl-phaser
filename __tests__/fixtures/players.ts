import {
  type Player,
  PositionKeyWord,
} from "../../src/types/Player.js";
import { PlayerBuilder } from "../utils/test-builders";

export function createTestPlayer(overrides?: Partial<Player>): Player {
  const player = new PlayerBuilder().build();
  return { ...player, ...overrides };
}

export function createLineman(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.LINEMAN)
    .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
    .withCost(50_000)
    .build();
}

export function createBlitzer(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.BLITZER)
    .withStats({ MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 })
    .withCost(85_000)
    .build();
}

export function createCatcher(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.CATCHER)
    .withStats({ MA: 8, ST: 2, AG: 2, PA: 5, AV: 8 })
    .withCost(65_000)
    .build();
}
