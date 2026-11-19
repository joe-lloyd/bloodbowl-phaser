import { type Locator, type Page, expect } from "@playwright/test";

export async function freezeAnimation(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      /* The caret blinks; it is not part of any presentation contract. */
      * { caret-color: transparent !important; }
    `,
  });

  await page.evaluate(() => {
    const game = (
      window as unknown as {
        game?: {
          loop?: { sleep(): void };
          scene?: {
            getScenes?: (active: boolean) => {
              tweens?: {
                killAll(): void;
                getTweens?: () => { complete(): void }[];
              };
            }[];
          };
        };
      }
    ).game;
    for (const scene of game?.scene?.getScenes?.(true) ?? []) {
      for (const tween of scene.tweens?.getTweens?.() ?? []) {
        try {
          tween.complete();
        } catch {}
      }
      scene.tweens?.killAll();
    }

    game?.loop?.sleep();
  });

  await page.waitForTimeout(150);
}

export function volatileRegions(page: Page): Locator[] {
  return [page.getByTestId("sandbox-scenario-info")];
}

export interface VisualCheckpointOptions {
  mask?: Locator[];

  maxDiffPixelRatio?: number;

  clip?: { x: number; y: number; width: number; height: number };
}

export async function expectVisualCheckpoint(
  page: Page,
  name: string,
  target: Locator | Page = page,
  options: VisualCheckpointOptions = {}
): Promise<void> {
  await freezeAnimation(page);
  await expect(target).toHaveScreenshot(`${name}.png`, {
    mask: [...volatileRegions(page), ...(options.mask ?? [])],
    animations: "disabled",
    caret: "hide",
    ...(options.clip ? { clip: options.clip } : {}),
    ...(options.maxDiffPixelRatio !== undefined
      ? { maxDiffPixelRatio: options.maxDiffPixelRatio }
      : {}),
  });
}
