import {
  type Player,
  PositionKeyWord,
  PlayerStatus,
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
    .withCost(50000)
    .build();
}

export function createBlitzer(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.BLITZER)
    .withStats({ MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 })
    .withCost(85000)
    .build();
}

export function createCatcher(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.CATCHER)
    .withStats({ MA: 8, ST: 2, AG: 2, PA: 5, AV: 8 })
    .withCost(65000)
    .build();
}

export function createThrower(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withPosition(PositionKeyWord.THROWER)
    .withStats({ MA: 6, ST: 3, AG: 3, PA: 2, AV: 9 })
    .withCost(80000)
    .build();
}

export function createPlayerOnPitch(
  teamId: string,
  number: number,
  x: number,
  y: number
): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withStatus(PlayerStatus.ACTIVE)
    .withGridPosition(x, y)
    .build();
}

export function createPronePlayer(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withStatus(PlayerStatus.PRONE)
    .build();
}

export function createStunnedPlayer(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withStatus(PlayerStatus.STUNNED)
    .build();
}

export function createKOPlayer(teamId = "test-team", number = 1): Player {
  return new PlayerBuilder()
    .withTeamId(teamId)
    .withNumber(number)
    .withStatus(PlayerStatus.KO)
    .build();
}
