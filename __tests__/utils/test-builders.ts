/**
 * Test builders for creating test data with fluent API
 * Following the Builder pattern for easy, readable test setup
 */

import { Team, TeamRace, TeamColors, createTeam } from '../../src/types/Team.js';
import { Player, PlayerTemplate, PlayerPosition, PlayerStatus, PlayerStats, createPlayer } from '../../src/types/Player.js';
import { GameState, GamePhase, TurnData } from '../../src/types/GameState.js';

/**
 * TeamBuilder - Fluent API for creating test teams
 * 
 * @example
 * const team = new TeamBuilder()
 *   .withName('Test Orcs')
 *   .withRace(TeamRace.ORC)
 *   .withPlayers(7)
 *   .build();
 */
export class TeamBuilder {
    private team: Team;

    constructor() {
        // Start with default team
        this.team = createTeam(
            'Test Team',
            TeamRace.HUMAN,
            { primary: 0x0000FF, secondary: 0xFFFFFF },
            50000
        );
    }

    withName(name: string): TeamBuilder {
        this.team.name = name;
        return this;
    }

    withRace(race: TeamRace): TeamBuilder {
        this.team.race = race;
        return this;
    }

    withColors(primary: number, secondary: number): TeamBuilder {
        this.team.colors = { primary, secondary };
        return this;
    }

    withId(id: string): TeamBuilder {
        this.team.id = id;
        return this;
    }

    withPlayers(count: number): TeamBuilder {
        this.team.players = [];
        for (let i = 0; i < count; i++) {
            const player = new PlayerBuilder()
                .withTeamId(this.team.id)
                .withNumber(i + 1)
                .build();
            this.team.players.push(player);
        }
        return this;
    }

    withCustomPlayers(players: Player[]): TeamBuilder {
        this.team.players = players;
        return this;
    }

    withTreasury(amount: number): TeamBuilder {
        this.team.treasury = amount;
        return this;
    }

    withRerolls(count: number): TeamBuilder {
        this.team.rerolls = count;
        return this;
    }

    withApothecary(has: boolean = true): TeamBuilder {
        this.team.apothecary = has;
        return this;
    }

    withStats(wins: number, losses: number, draws: number): TeamBuilder {
        this.team.wins = wins;
        this.team.losses = losses;
        this.team.draws = draws;
        return this;
    }

    build(): Team {
        return { ...this.team };
    }
}

/**
 * PlayerBuilder - Fluent API for creating test players
 * 
 * @example
 * const player = new PlayerBuilder()
 *   .withPosition(PlayerPosition.BLITZER)
 *   .withStats({ MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 })
 *   .build();
 */
export class PlayerBuilder {
    private template: PlayerTemplate;
    private teamId: string;
    private number: number;
    private name?: string;
    private status: PlayerStatus;
    private gridPosition?: { x: number; y: number };

    constructor() {
        // Default lineman template
        this.template = {
            position: PlayerPosition.LINEMAN,
            cost: 50000,
            stats: {
                MA: 6,
                ST: 3,
                AG: 3,
                PA: 4,
                AV: 9,
            },
            skills: [],
        };
        this.teamId = 'test-team';
        this.number = 1;
        this.status = PlayerStatus.RESERVE;
    }

    withPosition(position: PlayerPosition): PlayerBuilder {
        this.template.position = position;
        return this;
    }

    withStats(stats: Partial<PlayerStats>): PlayerBuilder {
        this.template.stats = { ...this.template.stats, ...stats };
        return this;
    }

    withCost(cost: number): PlayerBuilder {
        this.template.cost = cost;
        return this;
    }

    withTeamId(teamId: string): PlayerBuilder {
        this.teamId = teamId;
        return this;
    }

    withNumber(number: number): PlayerBuilder {
        this.number = number;
        return this;
    }

    withName(name: string): PlayerBuilder {
        this.name = name;
        return this;
    }

    withStatus(status: PlayerStatus): PlayerBuilder {
        this.status = status;
        return this;
    }

    withGridPosition(x: number, y: number): PlayerBuilder {
        this.gridPosition = { x, y };
        return this;
    }

    build(): Player {
        const player = createPlayer(this.template, this.teamId, this.number, this.name);
        player.status = this.status;
        if (this.gridPosition) {
            player.gridPosition = this.gridPosition;
        }
        return player;
    }
}

/**
 * GameStateBuilder - Fluent API for creating test game states
 * 
 * @example
 * const gameState = new GameStateBuilder()
 *   .inPhase(GamePhase.PLAY)
 *   .withActiveTeam('team-1')
 *   .build();
 */
export class GameStateBuilder {
    private state: GameState;

    constructor() {
        this.state = {
            phase: GamePhase.SETUP,
            activeTeamId: null,
            turn: {
                teamId: '',
                turnNumber: 0,
                isHalf2: false,
                activatedPlayerIds: new Set(),
                hasBlitzed: false,
                hasPassed: false,
                hasHandedOff: false,
                hasFouled: false,
            },
            score: {},
        };
    }

    inPhase(phase: GamePhase): GameStateBuilder {
        this.state.phase = phase;
        return this;
    }

    withActiveTeam(teamId: string): GameStateBuilder {
        this.state.activeTeamId = teamId;
        this.state.turn.teamId = teamId;
        return this;
    }

    withTurnNumber(turnNumber: number): GameStateBuilder {
        this.state.turn.turnNumber = turnNumber;
        return this;
    }

    inHalf2(): GameStateBuilder {
        this.state.turn.isHalf2 = true;
        return this;
    }

    withActivatedPlayers(...playerIds: string[]): GameStateBuilder {
        this.state.turn.activatedPlayerIds = new Set(playerIds);
        return this;
    }

    withBlitzUsed(): GameStateBuilder {
        this.state.turn.hasBlitzed = true;
        return this;
    }

    withPassUsed(): GameStateBuilder {
        this.state.turn.hasPassed = true;
        return this;
    }

    withHandOffUsed(): GameStateBuilder {
        this.state.turn.hasHandedOff = true;
        return this;
    }

    withFoulUsed(): GameStateBuilder {
        this.state.turn.hasFouled = true;
        return this;
    }

    withScore(team1Id: string, team1Score: number, team2Id: string, team2Score: number): GameStateBuilder {
        this.state.score = {
            [team1Id]: team1Score,
            [team2Id]: team2Score,
        };
        return this;
    }

    build(): GameState {
        return { ...this.state };
    }
}
