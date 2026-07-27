/**
 * Visual-regression support.
 *
 * Screenshots are a presentation contract, not a gameplay assertion: every
 * visual case asserts the semantic state first and only then compares
 * pixels. That ordering matters — a diff that fails for the right reason
 * tells you the look changed, while a diff that fails because the game is in
 * a different state tells you nothing.
 *
 * Stability comes from three things, all applied here:
 *   1. animation is stopped, not waited on;
 *   2. the viewport, device scale and fonts are pinned (viewport and scale
 *      in playwright.config.ts, fonts by disabling web-font swap);
 *   3. only documented volatile regions are masked.
 */

import { Locator, Page, expect } from "@playwright/test";

/**
 * Freeze everything that moves.
 *
 * Phaser's tween manager drives the piece slides, dice spins and pulsing
 * setup-zone highlight; CSS animations drive the HUD's fades. Both are
 * stopped rather than waited out, because "wait long enough" is how visual
 * suites become flaky.
 */
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
      // Complete, then kill. Killing alone is not deterministic: a looping
      // or yoyo tween (the bobbing loose ball, the pulsing setup zone) stops
      // wherever it happened to be, so two runs rest at different offsets.
      // `complete()` snaps each target to the tween's end value first, which
      // is the same every time.
      for (const tween of scene.tweens?.getTweens?.() ?? []) {
        try {
          tween.complete();
        } catch {
          // A tween already finishing is fine; killAll below cleans up.
        }
      }
      scene.tweens?.killAll();
    }
    // …then stop the loop entirely. Killing tweens once is not enough on its
    // own: a scene that starts a new tween on its next update (idle bobs,
    // pulsing highlights) would begin moving again between the two
    // screenshots Playwright takes to check for stability.
    game?.loop?.sleep();
  });

  // One frame for the kill and the sleep to take effect.
  await page.waitForTimeout(150);
}

/**
 * Regions whose content legitimately changes between runs and must be
 * masked. Kept short and documented on purpose: masking is how a visual
 * suite stops noticing real regressions.
 */
export function volatileRegions(page: Page): Locator[] {
  return [
    // The sandbox panel shows the run's seed, which differs per variant.
    page.getByTestId("sandbox-scenario-info"),
  ];
}

export interface VisualCheckpointOptions {
  /** Extra regions to mask beyond the documented volatile ones. */
  mask?: Locator[];
  /** Allowed proportion of differing pixels (default: exact). */
  maxDiffPixelRatio?: number;
  /** Restrict the capture to a rectangle (page target only). */
  clip?: { x: number; y: number; width: number; height: number };
}

/**
 * Compare a stable checkpoint with its committed baseline.
 *
 * `name` is the baseline file name and must be stable across runs — it is
 * how a reviewer finds the approved image. Baselines are only written by
 * `pnpm e2e:update-snapshots`; a normal run that differs fails and keeps the
 * actual/diff artifacts.
 */
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
