/**
 * Player test fixtures - Pre-configured players for testing
 */

import { Player, PositionKeyWord, PlayerStatus } from '../../src/types/Player.js';
import { PlayerBuilder } from '../utils/test-builders';

/**
 * Create a basic test player with default values
 */
export function createTestPlayer(overrides?: Partial<Player>): Player {
    const player = new PlayerBuilder().build();
    return { ...player, ...overrides };
}

/**
 * Create a Lineman (basic player)
 */
export function createLineman(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withPosition(PositionKeyWord.LINEMAN)
        .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
        .withCost(50000)
        .build();
}

/**
 * Create a Blitzer (fast, good at blocking)
 */
export function createBlitzer(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withPosition(PositionKeyWord.BLITZER)
        .withStats({ MA: 7, ST: 3, AG: 3, PA: 4, AV: 9 })
        .withCost(85000)
        .build();
}

/**
 * Create a Catcher (very fast, agile)
 */
export function createCatcher(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withPosition(PositionKeyWord.CATCHER)
        .withStats({ MA: 8, ST: 2, AG: 2, PA: 5, AV: 8 })
        .withCost(65000)
        .build();
}

/**
 * Create a Thrower (good passer)
 */
export function createThrower(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withPosition(PositionKeyWord.THROWER)
        .withStats({ MA: 6, ST: 3, AG: 3, PA: 2, AV: 9 })
        .withCost(80000)
        .build();
}

/**
 * Create a player on the pitch at a specific position
 */
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

/**
 * Create a knocked down (prone) player
 */
export function createPronePlayer(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withStatus(PlayerStatus.PRONE)
        .build();
}

/**
 * Create a stunned player
 */
export function createStunnedPlayer(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withStatus(PlayerStatus.STUNNED)
        .build();
}

/**
 * Create a KO'd player
 */
export function createKOPlayer(teamId: string = 'test-team', number: number = 1): Player {
    return new PlayerBuilder()
        .withTeamId(teamId)
        .withNumber(number)
        .withStatus(PlayerStatus.KO)
        .build();
}
