import type { Pitch } from "../elements/Pitch";

export interface HighlightMarker {
  readonly scene?: unknown;
  destroy(): void;
  setName(name: string): HighlightMarker;
}

export type HighlightPitch = Pick<Pitch, "clearHighlights" | "clearPath" | "clearHover"> & {
  highlightSquare(...args: Parameters<Pitch["highlightSquare"]>): HighlightMarker;
};

export class HighlightManager {
  private pushSquares: HighlightMarker[] = [];

  private pitch: HighlightPitch;
  constructor(pitch: HighlightPitch) {
    this.pitch = pitch;
  }

  public addPushHighlight(
    gridX: number,
    gridY: number,
    color = 0xffff00
  ): HighlightMarker {
    const square = this.pitch.highlightSquare({ x: gridX, y: gridY }, color, {
      crowd: true,
    });
    this.pushSquares.push(square);
    return square;
  }

  public clearAllHighlights(): void {
    this.clearPushSquares();
    this.pitch.clearHighlights();
    this.pitch.clearPath();
    this.pitch.clearHover();
  }

  public destroy(): void {
    this.clearPushSquares();
  }

  private clearPushSquares(): void {
    for (const square of this.pushSquares) if (square.scene) square.destroy();
    this.pushSquares = [];
  }
}
