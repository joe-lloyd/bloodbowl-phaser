import Phaser from 'phaser';
import { Pitch } from '../elements/Pitch';

/**
 * HighlightManager - Centralized management of all pitch highlights
 * 
 * Responsibilities:
 * - Track all active highlights (push, movement, selection, etc.)
 * - Provide unified cleanup methods
 * - Ensure proper lifecycle management
 * - Prevent highlight leaks between scenes/scenarios
 */

export enum HighlightType {
    PUSH = 'push',
    MOVEMENT = 'movement',
    SELECTION = 'selection',
    CUSTOM = 'custom'
}

interface TrackedHighlight {
    type: HighlightType;
    rectangle: Phaser.GameObjects.Rectangle;
    metadata?: any;
}

export class HighlightManager {
    private pitch: Pitch;
    private highlights: Map<string, TrackedHighlight[]> = new Map();

    constructor(pitch: Pitch) {
        this.pitch = pitch;

        // Initialize highlight type collections
        Object.values(HighlightType).forEach(type => {
            this.highlights.set(type, []);
        });
    }

    /**
     * Add a push direction highlight (yellow squares for block push selection)
     */
    public addPushHighlight(
        gridX: number,
        gridY: number,
        color: number = 0xFFFF00,
        metadata?: any
    ): Phaser.GameObjects.Rectangle {
        const rectangle = this.pitch.highlightSquare(gridX, gridY, color);

        this.highlights.get(HighlightType.PUSH)?.push({
            type: HighlightType.PUSH,
            rectangle,
            metadata: { gridX, gridY, ...metadata }
        });

        return rectangle;
    }

    /**
     * Add a movement highlight
     */
    public addMovementHighlight(
        gridX: number,
        gridY: number,
        color: number = 0x00FF00,
        metadata?: any
    ): Phaser.GameObjects.Rectangle {
        const rectangle = this.pitch.highlightSquare(gridX, gridY, color);

        this.highlights.get(HighlightType.MOVEMENT)?.push({
            type: HighlightType.MOVEMENT,
            rectangle,
            metadata: { gridX, gridY, ...metadata }
        });

        return rectangle;
    }

    /**
     * Add a selection highlight
     */
    public addSelectionHighlight(
        gridX: number,
        gridY: number,
        color: number = 0xFFFFFF,
        metadata?: any
    ): Phaser.GameObjects.Rectangle {
        const rectangle = this.pitch.highlightSquare(gridX, gridY, color);

        this.highlights.get(HighlightType.SELECTION)?.push({
            type: HighlightType.SELECTION,
            rectangle,
            metadata: { gridX, gridY, ...metadata }
        });

        return rectangle;
    }

    /**
     * Add a custom highlight with specified type
     */
    public addCustomHighlight(
        gridX: number,
        gridY: number,
        color: number,
        metadata?: any
    ): Phaser.GameObjects.Rectangle {
        const rectangle = this.pitch.highlightSquare(gridX, gridY, color);

        this.highlights.get(HighlightType.CUSTOM)?.push({
            type: HighlightType.CUSTOM,
            rectangle,
            metadata: { gridX, gridY, ...metadata }
        });

        return rectangle;
    }

    /**
     * Clear push highlights only
     */
    public clearPushHighlights(): void {
        this.clearHighlightsByType(HighlightType.PUSH);
    }

    /**
     * Clear movement highlights only
     */
    public clearMovementHighlights(): void {
        this.clearHighlightsByType(HighlightType.MOVEMENT);
    }

    /**
     * Clear selection highlights only
     */
    public clearSelectionHighlights(): void {
        this.clearHighlightsByType(HighlightType.SELECTION);
    }

    /**
     * Clear custom highlights only
     */
    public clearCustomHighlights(): void {
        this.clearHighlightsByType(HighlightType.CUSTOM);
    }

    /**
     * Clear highlights of a specific type
     */
    private clearHighlightsByType(type: HighlightType): void {
        const typeHighlights = this.highlights.get(type);
        if (!typeHighlights) return;

        typeHighlights.forEach(highlight => {
            // Only destroy if it still exists and hasn't been destroyed
            if (highlight.rectangle && highlight.rectangle.scene) {
                highlight.rectangle.destroy();
            }
        });

        // Clear the array
        this.highlights.set(type, []);
    }

    /**
     * Clear all managed highlights
     */
    public clearAll(): void {
        Object.values(HighlightType).forEach(type => {
            this.clearHighlightsByType(type);
        });
    }

    /**
     * Clear all highlights and also clear pitch-managed highlights
     * This is the comprehensive cleanup method
     */
    public clearAllHighlights(): void {
        // First clear all manager-tracked highlights
        this.clearAll();

        // Then clear pitch-managed highlights (tackle zones, overlays, etc.)
        this.pitch.clearHighlights();
        this.pitch.clearPath();
        this.pitch.clearHover();
    }

    /**
     * Get count of active highlights by type
     */
    public getHighlightCount(type: HighlightType): number {
        return this.highlights.get(type)?.length || 0;
    }

    /**
     * Get total count of all active highlights
     */
    public getTotalHighlightCount(): number {
        let total = 0;
        this.highlights.forEach(highlights => {
            total += highlights.length;
        });
        return total;
    }

    /**
     * Check if there are any active highlights of a specific type
     */
    public hasHighlights(type: HighlightType): boolean {
        return this.getHighlightCount(type) > 0;
    }

    /**
     * Cleanup on scene destruction
     */
    public destroy(): void {
        this.clearAll();
        this.highlights.clear();
    }
}
