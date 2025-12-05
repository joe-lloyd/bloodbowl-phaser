import { describe, it, expect } from 'vitest';
import { TeamBuilder, PlayerBuilder, GameStateBuilder } from '../../utils/test-builders.js';
import { TeamRace } from '../../../src/types/Team.js';
import { PlayerPosition, PlayerStatus } from '../../../src/types/Player.js';
import { GamePhase } from '../../../src/types/GameState.js';
import { createOrcTeam, createHumanTeam, createTestTeam } from '../../fixtures/teams.js';
import { createLineman, createBlitzer, createCatcher } from '../../fixtures/players.js';

describe('Test Builders', () => {
    describe('TeamBuilder', () => {
        it('should create a team with default values', () => {
            const team = new TeamBuilder().build();

            expect(team.name).toBe('Test Team');
            expect(team.race).toBe(TeamRace.HUMAN);
            expect(team.players).toHaveLength(0);
        });

        it('should create a team with custom values', () => {
            const team = new TeamBuilder()
                .withName('Custom Team')
                .withRace(TeamRace.ORC)
                .withPlayers(7)
                .withTreasury(100000)
                .withRerolls(3)
                .build();

            expect(team.name).toBe('Custom Team');
            expect(team.race).toBe(TeamRace.ORC);
            expect(team.players).toHaveLength(7);
            expect(team.treasury).toBe(100000);
            expect(team.rerolls).toBe(3);
        });

        it('should support method chaining', () => {
            const team = new TeamBuilder()
                .withName('Chained Team')
                .withRace(TeamRace.DWARF)
                .withApothecary(true)
                .withStats(5, 2, 1)
                .build();

            expect(team.name).toBe('Chained Team');
            expect(team.apothecary).toBe(true);
            expect(team.wins).toBe(5);
            expect(team.losses).toBe(2);
            expect(team.draws).toBe(1);
        });
    });

    describe('PlayerBuilder', () => {
        it('should create a player with default values', () => {
            const player = new PlayerBuilder().build();

            expect(player.position).toBe(PlayerPosition.LINEMAN);
            expect(player.number).toBe(1);
            expect(player.status).toBe(PlayerStatus.RESERVE);
        });

        it('should create a player with custom stats', () => {
            const player = new PlayerBuilder()
                .withPosition(PlayerPosition.BLITZER)
                .withStats({ MA: 7, ST: 4, AG: 2, PA: 5, AV: 10 })
                .withNumber(5)
                .withName('Big Hitter')
                .build();

            expect(player.position).toBe(PlayerPosition.BLITZER);
            expect(player.stats.MA).toBe(7);
            expect(player.stats.ST).toBe(4);
            expect(player.number).toBe(5);
            expect(player.name).toBe('Big Hitter');
        });

        it('should create a player on the pitch', () => {
            const player = new PlayerBuilder()
                .withStatus(PlayerStatus.ACTIVE)
                .withGridPosition(5, 5)
                .build();

            expect(player.status).toBe(PlayerStatus.ACTIVE);
            expect(player.gridPosition).toEqual({ x: 5, y: 5 });
        });
    });

    describe('GameStateBuilder', () => {
        it('should create a game state with default values', () => {
            const state = new GameStateBuilder().build();

            expect(state.phase).toBe(GamePhase.SETUP);
            expect(state.activeTeamId).toBeNull();
            expect(state.turn.turnNumber).toBe(0);
        });

        it('should create a game state in play phase', () => {
            const state = new GameStateBuilder()
                .inPhase(GamePhase.PLAY)
                .withActiveTeam('team-1')
                .withTurnNumber(3)
                .withBlitzUsed()
                .build();

            expect(state.phase).toBe(GamePhase.PLAY);
            expect(state.activeTeamId).toBe('team-1');
            expect(state.turn.turnNumber).toBe(3);
            expect(state.turn.hasBlitzed).toBe(true);
        });

        it('should track activated players', () => {
            const state = new GameStateBuilder()
                .withActivatedPlayers('player-1', 'player-2', 'player-3')
                .build();

            expect(state.turn.activatedPlayerIds.size).toBe(3);
            expect(state.turn.activatedPlayerIds.has('player-1')).toBe(true);
        });
    });
});

describe('Test Fixtures', () => {
    describe('Team Fixtures', () => {
        it('should create a test team', () => {
            const team = createTestTeam('Test', TeamRace.HUMAN);

            expect(team.name).toBe('Test');
            expect(team.race).toBe(TeamRace.HUMAN);
            expect(team.players).toHaveLength(7);
        });

        it('should create an Orc team with proper roster', () => {
            const team = createOrcTeam();

            expect(team.name).toBe('Da Boyz');
            expect(team.race).toBe(TeamRace.ORC);
            expect(team.players).toHaveLength(7);

            // Check roster composition
            const linemen = team.players.filter(p => p.position === PlayerPosition.LINEMAN);
            const blitzers = team.players.filter(p => p.position === PlayerPosition.BLITZER);
            const throwers = team.players.filter(p => p.position === PlayerPosition.THROWER);

            expect(linemen).toHaveLength(4);
            expect(blitzers).toHaveLength(2);
            expect(throwers).toHaveLength(1);
        });

        it('should create a Human team with proper roster', () => {
            const team = createHumanTeam();

            expect(team.name).toBe('Reikland Reavers');
            expect(team.race).toBe(TeamRace.HUMAN);
            expect(team.players).toHaveLength(7);

            // Check roster composition
            const linemen = team.players.filter(p => p.position === PlayerPosition.LINEMAN);
            const blitzers = team.players.filter(p => p.position === PlayerPosition.BLITZER);
            const catchers = team.players.filter(p => p.position === PlayerPosition.CATCHER);
            const throwers = team.players.filter(p => p.position === PlayerPosition.THROWER);

            expect(linemen).toHaveLength(4);
            expect(blitzers).toHaveLength(1);
            expect(catchers).toHaveLength(1);
            expect(throwers).toHaveLength(1);
        });
    });

    describe('Player Fixtures', () => {
        it('should create different player positions', () => {
            const lineman = createLineman();
            const blitzer = createBlitzer();
            const catcher = createCatcher();

            expect(lineman.position).toBe(PlayerPosition.LINEMAN);
            expect(blitzer.position).toBe(PlayerPosition.BLITZER);
            expect(catcher.position).toBe(PlayerPosition.CATCHER);

            // Verify stats are different
            expect(blitzer.stats.MA).toBeGreaterThan(lineman.stats.MA);
            expect(catcher.stats.MA).toBeGreaterThan(blitzer.stats.MA);
        });
    });
});
