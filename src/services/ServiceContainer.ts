/**
 * ServiceContainer - Dependency Injection Container
 * 
 * Manages service instances and provides access to them throughout the application.
 * Uses singleton pattern to ensure single source of truth for game state.
 */

import { IEventBus } from './EventBus.js';
import { GameService } from './GameService.js';
import { IGameService } from './interfaces/IGameService.js';
import { SoundManager } from './SoundManager.js';
import { Team } from '@/types/Team';

export class ServiceContainer {
    private static instance: ServiceContainer | null = null;

    public readonly eventBus: IEventBus;
    public readonly gameService: IGameService;
    public readonly soundManager: SoundManager;

    private constructor(eventBus: IEventBus, team1: Team, team2: Team) {
        // Use shared EventBus
        this.eventBus = eventBus;

        // Create Services
        this.soundManager = new SoundManager();
        this.gameService = new GameService(this.eventBus, team1, team2);
    }

    /**
     * Initialize the service container with teams
     * Must be called before getInstance()
     */
    static initialize(eventBus: IEventBus, team1: Team, team2: Team): ServiceContainer {
        ServiceContainer.instance = new ServiceContainer(eventBus, team1, team2);
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
