import { describe, it, expect, beforeEach } from 'vitest';
import { GameService } from '../../../src/services/GameService.js';
import { IGameService } from '../../../src/services/interfaces/IGameService.js';
import { EventBus } from '../../../src/services/EventBus.js';
import { TeamBuilder } from '../../utils/test-builders.js';
import { GamePhase } from '../../../src/types/GameState.js';

describe('GameService', () => {
    let gameService: IGameService;
    let eventBus: EventBus;
    let team1: any;
    let team2: any;

    beforeEach(() => {
        eventBus = new EventBus();

        team1 = new TeamBuilder()
            .withId('team-1')
            .withName('Team 1')
            .withPlayers(7)
            .build();

        team2 = new TeamBuilder()
            .withId('team-2')
            .withName('Team 2')
            .withPlayers(7)
            .build();

        gameService = new GameService(eventBus, team1, team2);
    });

    describe('Initialization', () => {
        it('should start in SETUP phase', () => {
            expect(gameService.getPhase()).toBe(GamePhase.SETUP);
        });

        it('should have no active team initially', () => {
            expect(gameService.getActiveTeamId()).toBeNull();
        });

        it('should have zero score for both teams', () => {
            expect(gameService.getScore('team-1')).toBe(0);
            expect(gameService.getScore('team-2')).toBe(0);
        });

        it('should have turn number 0 for both teams', () => {
            expect(gameService.getTurnNumber('team-1')).toBe(0);
            expect(gameService.getTurnNumber('team-2')).toBe(0);
        });
    });

    describe('Setup Phase', () => {
        it('should allow placing players during setup', () => {
            const playerId = team1.players[0].id;
            const result = gameService.placePlayer(playerId, 2, 5);
            gameService.placePlayer(team1.players[i].id, i, 5);
        }

            // Try to place an 8th (should fail since we only have 7)
            const result = gameService.placePlayer(team1.players[0].id, 0, 6);
        expect(result).toBe(true); // Moving existing player should work
    });

    it('should allow removing placed players', () => {
        const playerId = team1.players[0].id;
        gameService.placePlayer(playerId, 2, 5);

        gameService.removePlayer(playerId);

        // Should be able to place again at different position
        const result = gameService.placePlayer(playerId, 3, 5);
        expect(result).toBe(true);
    });

    it('should allow swapping player positions', () => {
        const player1Id = team1.players[0].id;
        const player2Id = team1.players[1].id;

        gameService.placePlayer(player1Id, 2, 5);
        gameService.placePlayer(player2Id, 3, 5);

        const result = gameService.swapPlayers(player1Id, player2Id);
        expect(result).toBe(true);
    });

    it('should track setup completion', () => {
        // Place all 7 players
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team1.players[i].id, i, 5);
        }

        expect(gameService.isSetupComplete('team-1')).toBe(true);
    });

    it('should transition to KICKOFF when both teams confirm setup', () => {
        // Setup team 1
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team1.players[i].id, i, 5);
        }
        gameService.confirmSetup('team-1');

        expect(gameService.getPhase()).toBe(GamePhase.SETUP);

        // Setup team 2
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team2.players[i].id, 14 + i, 5);
        }
        gameService.confirmSetup('team-2');

        expect(gameService.getPhase()).toBe(GamePhase.KICKOFF);
    });
});

describe('Turn Management', () => {
    beforeEach(() => {
        // Setup both teams
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team1.players[i].id, i, 5);
            gameService.placePlayer(team2.players[i].id, 14 + i, 5);
        }
        gameService.confirmSetup('team-1');
        gameService.confirmSetup('team-2');
        gameService.startGame('team-1'); // Team 1 kicks, Team 2 receives
    });

    it('should start turn for receiving team', () => {
        expect(gameService.getActiveTeamId()).toBe('team-2');
        expect(gameService.getTurnNumber('team-2')).toBe(1);
    });

    it('should track player actions', () => {
        const playerId = team2.players[0].id;

        expect(gameService.hasPlayerActed(playerId)).toBe(false);

        gameService.playerAction(playerId);

        expect(gameService.hasPlayerActed(playerId)).toBe(true);
    });

    it('should not allow same player to act twice', () => {
        const playerId = team2.players[0].id;

        const firstAction = gameService.playerAction(playerId);
        expect(firstAction).toBe(true);

        const secondAction = gameService.playerAction(playerId);
        expect(secondAction).toBe(false);
    });

    it('should switch teams on end turn', () => {
        expect(gameService.getActiveTeamId()).toBe('team-2');

        gameService.endTurn();

        expect(gameService.getActiveTeamId()).toBe('team-1');
        expect(gameService.getTurnNumber('team-1')).toBe(1);
    });

    it('should end half after 6 turns per team', () => {
        // Play 6 turns for each team (12 total)
        for (let i = 0; i < 12; i++) {
            gameService.endTurn();
        }

        expect(gameService.getPhase()).toBe(GamePhase.HALFTIME);
    });
});

describe('Score Management', () => {
    it('should add touchdowns correctly', () => {
        gameService.addTouchdown('team-1');
        expect(gameService.getScore('team-1')).toBe(1);

        gameService.addTouchdown('team-1');
        expect(gameService.getScore('team-1')).toBe(2);

        gameService.addTouchdown('team-2');
        expect(gameService.getScore('team-2')).toBe(1);
    });
});

describe('Event Emission', () => {
    it('should emit events on phase transitions', () => {
        let phaseChanged = false;
        eventBus.on('phaseChanged', () => {
            phaseChanged = true;
        });

        // Setup and confirm
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team1.players[i].id, i, 5);
            gameService.placePlayer(team2.players[i].id, 14 + i, 5);
        }
        gameService.confirmSetup('team-1');
        gameService.confirmSetup('team-2');

        expect(phaseChanged).toBe(true);
    });

    it('should emit events on turn start', () => {
        let turnStarted = false;
        let turnData: any = null;

        eventBus.on('turnStarted', (data) => {
            turnStarted = true;
            turnData = data;
        });

        // Setup and start game
        for (let i = 0; i < 7; i++) {
            gameService.placePlayer(team1.players[i].id, i, 5);
            gameService.placePlayer(team2.players[i].id, 14 + i, 5);
        }
        gameService.confirmSetup('team-1');
        gameService.confirmSetup('team-2');
        gameService.startGame('team-1');

        expect(turnStarted).toBe(true);
        expect(turnData).toBeDefined();
        expect(turnData.teamId).toBe('team-2');
    });
});
});
