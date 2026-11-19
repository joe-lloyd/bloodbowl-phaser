import { fixtureValue } from "../../../src/testing/fixtureValue";
import { type Locator, type Page, expect } from "@playwright/test";
import type { BrowserTestBridge } from "../../../src/testing/browserBridge";
import { GameBridge } from "./bridge";

export interface Square {
  x: number;
  y: number;
}

interface Projection {
  design: Square;
  viewport: Square;
}

export class PitchPage {
  readonly canvas: Locator;
  private readonly bridge: GameBridge;

  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
    this.canvas = page.locator("#game-container canvas");
    this.bridge = new GameBridge(page);
  }

  async waitForCanvas(timeout = 20_000): Promise<void> {
    await expect(this.canvas).toBeVisible({ timeout });
    await this.bridge.waitForReady(timeout);
  }

  async waitForCameraToSettle(timeout = 15_000): Promise<void> {
    await this.settledProjection(null, timeout);
  }

  private async settledProjection(
    square: Square | null,
    timeout = 15_000
  ): Promise<Projection | null> {
    const handle = await this.page.waitForFunction(
      (square) =>
        new Promise<{ projection: Projection | null }>((resolve) => {
          const bridge = (
            window as unknown as { __bbTestBridge: BrowserTestBridge }
          ).__bbTestBridge;
          let previous = "";
          const check = () => {
            const panels = document.querySelectorAll(
              "[data-hud-frame], [data-hud-panels]"
            );
            const transitioning = Array.from(panels).some((panel) =>
              panel
                .getAnimations({ subtree: true })
                .some(
                  (animation) =>
                    animation instanceof CSSTransition &&
                    animation.playState === "running"
                )
            );
            const layout = Array.from(panels).flatMap((panel) =>
              [panel, ...panel.children].map((element) => {
                const { left, top, width, height } =
                  element.getBoundingClientRect();
                return { left, top, width, height };
              })
            );
            const state = JSON.stringify({
              camera: bridge.cameraState(),
              layout,
            });
            if (
              !transitioning &&
              !bridge.cameraMoving() &&
              state === previous
            ) {
              const design =
                square && bridge.squareToCanvas(square.x, square.y);
              const canvas = document.querySelector("#game-container canvas");
              const box = canvas?.getBoundingClientRect();
              const size = bridge.canvasSize();

              resolve({
                projection:
                  design && box
                    ? {
                        design,
                        viewport: {
                          x: box.left + (design.x * box.width) / size.width,
                          y: box.top + (design.y * box.height) / size.height,
                        },
                      }
                    : null,
              });
              return;
            }
            previous = transitioning || bridge.cameraMoving() ? "" : state;
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
      square,
      { timeout }
    );
    const { projection } = await handle.jsonValue();
    await handle.dispose();
    return projection;
  }

  async designPoint(square: Square): Promise<Square> {
    const projection = await this.settledProjection(square);
    if (!projection) {
      throw new Error(
        `no pitch is rendered yet, so square (${String(square.x)},${String(square.y)}) has no position`
      );
    }
    return projection.design;
  }

  async canvasSize(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(() =>
      fixtureValue((window as unknown as Record<string, BrowserTestBridge>)[
        "__bbTestBridge"
      ]).canvasSize()
    );
  }

  async viewportPoint(square: Square): Promise<Square> {
    const projection = await this.settledProjection(square);
    if (!projection) throw new Error("the pitch has no canvas projection");
    return projection.viewport;
  }

  async clickSquare(square: Square): Promise<void> {
    await this.hoverSquare(square);
    const point = await this.viewportPoint(square);
    await this.page.mouse.click(point.x, point.y);
  }

  async hoverSquare(square: Square): Promise<void> {
    const point = await this.viewportPoint(square);
    await this.page.mouse.move(point.x, point.y);

    await this.page.waitForTimeout(50);
  }

  async clickPlayer(ref: string): Promise<void> {
    await this.clickSquare(await this.squareOf(ref));
  }

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

    const halfW = fixtureValue(corners[4]).x - fixtureValue(corners[0]).x;
    const halfH = fixtureValue(corners[4]).y - fixtureValue(corners[0]).y;
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

  async clickPath(path: Square[]): Promise<void> {
    for (const square of path) {
      await this.clickSquare(square);
    }
  }

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
