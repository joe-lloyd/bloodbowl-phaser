/**
 * The Phaser pitch page object.
 *
 * Canvas tests go wrong when the test re-derives where a square is. This one
 * asks the running game instead: the bridge returns the square's centre in
 * canvas coordinates straight from the live `Pitch` and match camera, and the
 * only arithmetic here is the canvas → viewport transform. The camera moves
 * on its own (it closes in on a selected player), so every lookup first waits
 * for it to come to rest. If the pitch or the camera moves, clicks follow.
 */

import { Locator, Page, expect } from "@playwright/test";
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

  /** Wait until the match camera has stopped panning and zooming. */
  async waitForCameraToSettle(timeout = 15_000): Promise<void> {
    await this.page.waitForFunction(
      () =>
        !(
          window as unknown as Record<string, BrowserTestBridge>
        ).__bbTestBridge.cameraMoving(),
      undefined,
      { timeout }
    );
  }

  /** The square's centre in canvas coordinates, once the camera is still. */
  async designPoint(square: Square): Promise<Square> {
    await this.waitForCameraToSettle();
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
   * The playing surface as a viewport rectangle: the box around the four
   * corner squares, out to their far corners.
   *
   * Visual baselines clip to this rather than shooting the whole canvas: the
   * dugouts and the HUD change with the drive and are their own presentation
   * contract, so including them would make every pitch baseline fail for
   * reasons that have nothing to do with the pitch.
   */
  async pitchViewportRect(): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const corners = await Promise.all(
      [
        { x: 0, y: 0 },
        { x: 19, y: 0 },
        { x: 0, y: 10 },
        { x: 19, y: 10 },
        { x: 1, y: 0 },
      ].map((square) => this.viewportPoint(square))
    );
    // Half a diamond, from the spacing of two neighbouring centres.
    const halfW = corners[4].x - corners[0].x;
    const halfH = corners[4].y - corners[0].y;
    const xs = corners.slice(0, 4).map((p) => p.x);
    const ys = corners.slice(0, 4).map((p) => p.y);
    const x = Math.min(...xs) - halfW;
    const y = Math.min(...ys) - halfH;
    return {
      x,
      y,
      width: Math.max(...xs) + halfW - x,
      height: Math.max(...ys) + halfH - y,
    };
  }

  /** Walk a path square by square, the way a coach clicks it out. */
  async clickPath(path: Square[]): Promise<void> {
    for (const square of path) {
      await this.clickSquare(square);
    }
  }

  /**
   * Assert the page object's mapping agrees with production geometry: the
   * board is isometric, so stepping along grid x moves down-right and along
   * grid y down-left by the same amount, each step twice as wide as it is
   * tall. A failure here means the projection changed and every canvas click
   * in the suite is suspect.
   */
  async assertMappingMatchesProductionGeometry(): Promise<void> {
    const origin = await this.designPoint({ x: 0, y: 0 });
    const alongX = await this.designPoint({ x: 1, y: 0 });
    const alongY = await this.designPoint({ x: 0, y: 1 });
    const dx = { x: alongX.x - origin.x, y: alongX.y - origin.y };
    const dy = { x: alongY.x - origin.x, y: alongY.y - origin.y };
    expect(dx.x).toBeGreaterThan(0);
    expect(dy.x).toBeCloseTo(-dx.x, 3);
    expect(dy.y).toBeCloseTo(dx.y, 3);
    expect(dx.x / dx.y).toBeCloseTo(2, 2);
  }
}
