/**
 * ServiceContainer - Dependency Injection Container
 * 
 * Manages service instances and provides access to them throughout the application.
 * Uses singleton pattern to ensure single source of truth for game state.
 */

import { EventBus, IEventBus } from './EventBus.js';
import { GameService } from './GameService.js';
import { IGameService } from './interfaces/IGameService.js';
import { Team } from '@/types/Team';

export class ServiceContainer {
    private static instance: ServiceContainer | null = null;

    public readonly eventBus: IEventBus;
    public readonly gameService: IGameService;

    private constructor(team1: Team, team2: Team) {
        // Create EventBus first
        this.eventBus = new EventBus();

        // Create GameService with EventBus and teams
        this.gameService = new GameService(this.eventBus, team1, team2);
    }

    /**
     * Initialize the service container with teams
     * Must be called before getInstance()
     */
    static initialize(team1: Team, team2: Team): ServiceContainer {
        ServiceContainer.instance = new ServiceContainer(team1, team2);
        return ServiceContainer.instance;
    }

    /**
     * Get the singleton instance
     * Throws error if not initialized
     */
    static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            throw new Error('ServiceContainer not initialized. Call initialize() first.');
        }
        return ServiceContainer.instance;
    }

    /**
     * Check if container is initialized
     */
    static isInitialized(): boolean {
        return ServiceContainer.instance !== null;
    }

    /**
     * Reset the container (useful for testing)
     */
    static reset(): void {
        ServiceContainer.instance = null;
    }
}
