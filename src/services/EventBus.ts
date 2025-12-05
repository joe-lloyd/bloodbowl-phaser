/**
 * EventBus - A lightweight event emitter for decoupling components
 * 
 * This replaces Phaser.Events.EventEmitter to remove Phaser dependencies
 * from business logic, making services pure TypeScript and easily testable.
 */

export interface IEventBus {
    /**
     * Emit an event with optional data
     * @param event - Event name
     * @param data - Optional data to pass to listeners
     */
    emit(event: string, data?: any): void;

    /**
     * Register a listener for an event
     * @param event - Event name
     * @param callback - Function to call when event is emitted
     */
    on(event: string, callback: (data?: any) => void): void;

    /**
     * Remove a listener for an event
     * @param event - Event name
     * @param callback - Function to remove
     */
    off(event: string, callback: (data?: any) => void): void;

    /**
     * Register a one-time listener for an event
     * @param event - Event name
     * @param callback - Function to call once when event is emitted
     */
    once(event: string, callback: (data?: any) => void): void;

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

    emit(event: string, data?: any): void {
        // Call regular listeners
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    // Log error but don't stop other callbacks
                    console.error(`Error in event listener for "${event}":`, error);
                }
            });
        }

        // Call and remove once listeners
        const onceListeners = this.onceListeners.get(event);
        if (onceListeners) {
            onceListeners.forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in once listener for "${event}":`, error);
                }
            });
            // Clear once listeners after calling
            this.onceListeners.delete(event);
        }
    }

    on(event: string, callback: (data?: any) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
    }

    off(event: string, callback: (data?: any) => void): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.delete(callback);

            // Clean up empty sets
            if (eventListeners.size === 0) {
                this.listeners.delete(event);
            }
        }

        // Also check once listeners
        const onceListeners = this.onceListeners.get(event);
        if (onceListeners) {
            onceListeners.delete(callback);

            if (onceListeners.size === 0) {
                this.onceListeners.delete(event);
            }
        }
    }

    once(event: string, callback: (data?: any) => void): void {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }
        this.onceListeners.get(event)!.add(callback);
    }

    /**
     * Remove all listeners for an event (or all events if no event specified)
     * Useful for cleanup
     */
    removeAllListeners(event?: string): void {
        if (event) {
            this.listeners.delete(event);
            this.onceListeners.delete(event);
        } else {
            this.listeners.clear();
            this.onceListeners.clear();
        }
    }

    /**
     * Get count of listeners for an event
     * Useful for debugging
     */
    listenerCount(event: string): number {
        const regular = this.listeners.get(event)?.size || 0;
        const once = this.onceListeners.get(event)?.size || 0;
        return regular + once;
    }
}
