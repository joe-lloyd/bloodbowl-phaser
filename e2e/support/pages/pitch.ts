/**
 * The Phaser pitch page object.
 *
 * Canvas tests go wrong when the test re-derives where a square is. This one
 * asks the running game instead: the bridge returns the square's centre in
 * Phaser design coordinates straight from the live `Pitch`, and the only
 * arithmetic here is the design-space → viewport transform that Phaser's
 * `Scale.FIT` applies to the canvas element. If the pitch ever moves, these
 * clicks move with it.
 */

import { Locator, Page, expect } from "@playwright/test";
import { GameConfig } from "../../../src/config/GameConfig";
import type { BrowserTestBridge } from "../../../src/testing/browserBridge";
import { GameBridge } from "./bridge";

export interface Square {
  x: number;
  y: number;
}

export class PitchPage {
  readonly canvas: Locator;
  private readonly bridge: GameBridge;

  constructor(private readonly page: Page) {
    this.canvas = page.locator("#game-container canvas");
    this.bridge = new GameBridge(page);
  }

  async waitForCanvas(timeout = 20_000): Promise<void> {
    await expect(this.canvas).toBeVisible({ timeout });
    await this.bridge.waitForReady(timeout);
  }

  /** The square's centre in Phaser design-space (canvas) coordinates. */
  async designPoint(square: Square): Promise<Square> {
    const point = await this.page.evaluate(
      ([gridX, gridY]) =>
        (
          window as unknown as Record<string, BrowserTestBridge>
        ).__bbTestBridge.squareToCanvas(gridX, gridY),
      [square.x, square.y] as const
    );
    if (!point) {
      throw new Error(
        `no pitch is rendered yet, so square (${square.x},${square.y}) has no position`
      );
    }
    return point;
  }

  /** The live design-space canvas size the scale manager is laying out to. */
  async canvasSize(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(() =>
      (
        window as unknown as Record<string, BrowserTestBridge>
      ).__bbTestBridge.canvasSize()
    );
  }

  /**
   * A design-space point as an offset within the canvas element.
   *
   * Phaser fits its design surface to the element, so the ratio of the
   * element's CSS box to the live design size is the scale factor. Reading
   * the design size from the running scale manager (not `GameConfig`) matters:
   * the game sizes itself to its parent, and the pitch is laid out from that
   * runtime width.
   */
  private async elementOffset(square: Square): Promise<Square> {
    const [design, size, box] = await Promise.all([
      this.designPoint(square),
      this.canvasSize(),
      this.canvas.boundingBox(),
    ]);
    if (!box) throw new Error("the game canvas has no layout box");
    return {
      x: design.x * (box.width / size.width),
      y: design.y * (box.height / size.height),
    };
  }

  /** A grid square's centre as an absolute viewport point. */
  async viewportPoint(square: Square): Promise<Square> {
    const offset = await this.elementOffset(square);
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error("the game canvas has no layout box");
    return { x: box.x + offset.x, y: box.y + offset.y };
  }

  /**
   * Click a grid square through the real canvas, as a coach would.
   *
   * The pointer is moved onto the square and given a frame first. That is not
   * ceremony: the movement controller builds its path in `pointermove` and
   * only commits it in `pointerdown`, so a click that teleports the cursor
   * lands on an empty path and does nothing at all.
   */
  async clickSquare(square: Square): Promise<void> {
    await this.hoverSquare(square);
    await this.canvas.click({ position: await this.elementOffset(square) });
  }

  /** Move the pointer over a square without clicking (hover highlights). */
  async hoverSquare(square: Square): Promise<void> {
    const point = await this.viewportPoint(square);
    await this.page.mouse.move(point.x, point.y);
    // Let Phaser process the move on its next frame.
    await this.page.waitForTimeout(50);
  }

  /** Click the square a player currently occupies, by stable reference. */
  async clickPlayer(ref: string): Promise<void> {
    await this.clickSquare(await this.squareOf(ref));
  }

  /** Where a stable player reference currently stands. */
  async squareOf(ref: string): Promise<Square> {
    const playerId = await this.bridge.resolveRef(ref);
    const snapshot = await this.bridge.snapshot();
    const player = snapshot.teams
      .flatMap((team) => team.players)
      .find((candidate) => candidate.id === playerId);
    if (!player?.position) {
      throw new Error(`${ref} is not on the pitch`);
    }
    return player.position;
  }

  /**
   * The playing surface as a viewport rectangle.
   *
   * Visual baselines clip to this rather than shooting the whole canvas: the
   * dugouts and the turn indicator below the pitch change with the drive and
   * are their own presentation contract, so including them would make every
   * pitch baseline fail for reasons that have nothing to do with the pitch.
   */
  async pitchViewportRect(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const [size, box] = await Promise.all([
      this.canvasSize(),
      this.canvas.boundingBox(),
    ]);
    if (!box) throw new Error("the game canvas has no layout box");
    const scaleX = box.width / size.width;
    const scaleY = box.height / size.height;
    const left = (size.width - GameConfig.PITCH_PIXEL_WIDTH) / 2;
    return {
      x: box.x + left * scaleX,
      y: box.y + GameConfig.TOP_UI_HEIGHT * scaleY,
      width: GameConfig.PITCH_PIXEL_WIDTH * scaleX,
      height: GameConfig.PITCH_PIXEL_HEIGHT * scaleY,
    };
  }

  /** Walk a path square by square, the way a coach clicks it out. */
  async clickPath(path: Square[]): Promise<void> {
    for (const square of path) {
      await this.clickSquare(square);
    }
  }

  /**
   * Assert the page object's mapping agrees with production geometry.
   *
   * `GameScene` centres the pitch horizontally in the *live* canvas and puts
   * it below the top dugout, and `gridToPixel` returns square centres — so
   * square (0,0) must land half a square inside that origin. A failure here
   * means the pitch layout changed and every canvas click in the suite is
   * suspect.
   */
  async assertMappingMatchesProductionGeometry(): Promise<void> {
    const size = await this.canvasSize();
    const pitchLeft = (size.width - GameConfig.PITCH_PIXEL_WIDTH) / 2;
    const pitchTop = GameConfig.TOP_UI_HEIGHT;

    const origin = await this.designPoint({ x: 0, y: 0 });
    expect(origin).toEqual({
      x: pitchLeft + GameConfig.SQUARE_SIZE / 2,
      y: pitchTop + GameConfig.SQUARE_SIZE / 2,
    });

    // …and squares are exactly one SQUARE_SIZE apart on both axes.
    const neighbour = await this.designPoint({ x: 1, y: 1 });
    expect(neighbour.x - origin.x).toBe(GameConfig.SQUARE_SIZE);
    expect(neighbour.y - origin.y).toBe(GameConfig.SQUARE_SIZE);

    // The far corner must still be inside the drawn pitch.
    const far = await this.designPoint({
      x: GameConfig.PITCH_WIDTH - 1,
      y: GameConfig.PITCH_HEIGHT - 1,
    });
    expect(far.x).toBeLessThan(pitchLeft + GameConfig.PITCH_PIXEL_WIDTH);
    expect(far.y).toBeLessThan(pitchTop + GameConfig.PITCH_PIXEL_HEIGHT);
  }
}
