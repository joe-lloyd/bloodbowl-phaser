import { describe, it, expect } from 'vitest';
import { TeamBuilder } from '../../utils/test-builders.js';

describe('TeamBuilder Debug', () => {
    it('should create team with correct player teamIds', () => {
        const team = new TeamBuilder()
            .withId('team-1')
            .withName('Team 1')
            .withPlayers(7)
            .build();

        console.log('Team ID:', team.id);
        console.log('Player 0 ID:', team.players[0].id);
        console.log('Player 0 teamId:', team.players[0].teamId);

        expect(team.id).toBe('team-1');
        expect(team.players[0].teamId).toBe('team-1');
        expect(team.players.length).toBe(7);
    });
});
