
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameService } from '../../../src/services/GameService';
import { IEventBus } from '../../../src/services/EventBus';
import { Team } from '../../../src/types/Team';

describe('GameService Setup Flow', () => {
    let gameService: GameService;
    let eventBus: IEventBus;
    let team1: Team;
    let team2: Team;

    beforeEach(() => {
        eventBus = {
            emit: vi.fn(),
            on: vi.fn(),
            off: vi.fn()
        };
        team1 = { id: 'team1', name: 'Team 1', players: [], colors: { primary: 0x0000ff, secondary: 0xffffff } } as any;
        team2 = { id: 'team2', name: 'Team 2', players: [], colors: { primary: 0xff0000, secondary: 0x000000 } } as any;

        gameService = new GameService(eventBus, team1, team2);
    });

    it('should set active team on startSetup', () => {
        gameService.startSetup('team1');
        expect(gameService.getActiveTeamId()).toBe('team1');
        expect(gameService.getSetupZone('team1')).toEqual({ minX: 0, maxX: 6, minY: 0, maxY: 10 });
    });

    it('should return correct setup zone based on active team', () => {
        gameService.startSetup('team1');
        // Mimic SetupUIController logic: query zone for active team
        let activeId = gameService.getActiveTeamId();
        let zone = gameService.getSetupZone(activeId!);

        expect(zone?.minX).toBe(0); // Team 1 is Left

        // Manually switch phase/team (simulating GameScene logic)
        // BUG REPRODUCTION: If we can't switch active team, UI stays on Team 1

        // We expect a method to exist or be added, e.g., setActiveTeam
        // For now, let's assume we invoke startSetup again or a new method
        // If we call startSetup('team2'), it should switch
        gameService.startSetup('team2');

        activeId = gameService.getActiveTeamId();
        expect(activeId).toBe('team2');

        zone = gameService.getSetupZone(activeId!);
        expect(zone?.minX).toBe(13); // Team 2 is Right
    });
});
