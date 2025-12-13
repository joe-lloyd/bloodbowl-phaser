/**
 * EventBus - A lightweight event emitter for decoupling components
 * 
 * This replaces Phaser.Events.EventEmitter to remove Phaser dependencies
 * from business logic, making services pure TypeScript and easily testable.
 */

import { AllEvents } from '../types/events';

// Alias AllEvents to GameEventMap for backward compatibility/clarity in this file if needed
// or just use AllEvents directly. I will use GameEventMap alias to minimize changes to interface below.
export type GameEventMap = AllEvents;

export interface IEventBus {
    /**
     * Emit an event with optional data
     * @param event - Event name
     * @param data - Optional data to pass to listeners
     */
    emit<K extends keyof GameEventMap>(event: K, data?: GameEventMap[K]): void;

    /**
     * Register a listener for an event
     * @param event - Event name
     * @param callback - Function to call when event is emitted
     */
    on<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void;

    /**
     * Remove a listener for an event
     * @param event - Event name
     * @param callback - Function to remove
     */
    off<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void;

    /**
     * Register a one-time listener for an event
     * @param event - Event name
     * @param callback - Function to call once when event is emitted
     */
    once<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void;

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * @param event - Optional event name
     */
    removeAllListeners(event?: string): void;

    /**
     * Get count of listeners for an event
     * @param event - Event name
     */
    listenerCount(event: string): number;
}

/**
 * EventBus implementation using pure TypeScript
 * No external dependencies, fully testable
 */
export class EventBus implements IEventBus {
    private listeners: Map<string, Set<(data?: any) => void>> = new Map();
    private onceListeners: Map<string, Set<(data?: any) => void>> = new Map();

    emit<K extends keyof GameEventMap>(event: K, data?: GameEventMap[K]): void {
        // Call regular listeners
        const eventListeners = this.listeners.get(event as string);
        if (eventListeners) {
            eventListeners.forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for "${event as string}":`, error);
                }
            });
        }

        // Call and remove once listeners
        const onceListeners = this.onceListeners.get(event as string);
        if (onceListeners) {
            onceListeners.forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in once listener for "${event as string}":`, error);
                }
            });
            // Clear once listeners after calling
            this.onceListeners.delete(event as string);
        }
    }

    on<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void {
        if (!this.listeners.has(event as string)) {
            this.listeners.set(event as string, new Set());
        }
        this.listeners.get(event as string)!.add(callback as (data?: any) => void);
    }

    off<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void {
        const eventListeners = this.listeners.get(event as string);
        if (eventListeners) {
            eventListeners.delete(callback as any);
            if (eventListeners.size === 0) {
                this.listeners.delete(event as string);
            }
        }

        const onceListeners = this.onceListeners.get(event as string);
        if (onceListeners) {
            onceListeners.delete(callback as any);
            if (onceListeners.size === 0) {
                this.onceListeners.delete(event as string);
            }
        }
    }

    once<K extends keyof GameEventMap>(event: K, callback: (data: GameEventMap[K]) => void): void {
        if (!this.onceListeners.has(event as string)) {
            this.onceListeners.set(event as string, new Set());
        }
        this.onceListeners.get(event as string)!.add(callback as (data?: any) => void);
    }

    removeAllListeners(event?: string): void {
        if (event) {
            this.listeners.delete(event);
            this.onceListeners.delete(event);
        } else {
            this.listeners.clear();
            this.onceListeners.clear();
        }
    }

    listenerCount(event: string): number {
        const regular = this.listeners.get(event)?.size || 0;
        const once = this.onceListeners.get(event)?.size || 0;
        return regular + once;
    }
}
