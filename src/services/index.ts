/**
 * Service exports for easy importing throughout the app
 * Provides centralized access to core services
 */

export { EventBus, type IEventBus } from './EventBus';
export { GameService } from './GameService';
export { type IGameService } from './interfaces/IGameService';

// Re-export event types for convenience
export type { AllEvents, GameEvents, UIEvents, StateEvents, EventHandler } from '../types/events';
