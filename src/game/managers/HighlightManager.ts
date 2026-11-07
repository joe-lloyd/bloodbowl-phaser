import { Pitch, SquareMarker } from "../elements/Pitch";

/**
 * HighlightManager - tracks the push-direction squares it draws, so one call
 * clears them along with the pitch's own highlights, path and hover.
 */
export class HighlightManager {
  private pushSquares: SquareMarker[] = [];

  constructor(private pitch: Pitch) {}

  /**
   * Add a push direction highlight (yellow squares for block push selection)
   */
  public addPushHighlight(
    gridX: number,
    gridY: number,
    color: number = 0xffff00
  ): SquareMarker {
    const square = this.pitch.highlightSquare(gridX, gridY, color);
    this.pushSquares.push(square);
    return square;
  }

  /**
   * Clear the push squares and the pitch-managed highlights (tackle zones,
   * overlays, path, hover).
   */
  public clearAllHighlights(): void {
    this.clearPushSquares();
    this.pitch.clearHighlights();
    this.pitch.clearPath();
    this.pitch.clearHover();
  }

  /**
   * Cleanup on scene destruction
   */
  public destroy(): void {
    this.clearPushSquares();
  }

  private clearPushSquares(): void {
    // A square the scene already tore down has no scene left to leave.
    for (const square of this.pushSquares) if (square.scene) square.destroy();
    this.pushSquares = [];
  }
}
