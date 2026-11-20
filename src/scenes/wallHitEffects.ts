import type { GameScene } from "./GameScene";
import { GameEventNames } from "../types/events";
import { activeLayout } from "../game/variants/activeMatch";
import { ISO } from "../game/elements/GridUtils";
import { PLAYER_DEPTH } from "../game/elements/PlayerSprite";
import { prefersReducedMotion } from "../game/presentation/motion";
import {
  type WallHit,
  wallHitFromSquare,
  wallHitFromThrowIn,
} from "../game/presentation/wallHits";

const PUFFS = 7;

function playWallHit(scene: GameScene, hit: WallHit): void {
  const at = scene.pitch.getPointPosition(hit.x, hit.y);
  const y = at.y + ISO.upPerMetre * 0.8;
  const depth = PLAYER_DEPTH + at.y + 1;
  const flash = scene.add
    .ellipse(at.x, y, 46, 22, 0xfff1c8, 0.95)
    .setDepth(depth);
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: 1.8,
    duration: 420,
    onComplete: () => {
      flash.destroy();
    },
  });
  if (prefersReducedMotion()) return;
  for (let i = 0; i < PUFFS; i++) {
    const angle = (i / PUFFS) * Math.PI * 2;
    const puff = scene.add.circle(at.x, y, 9, 0xd8c8a8, 0.9).setDepth(depth);
    scene.tweens.add({
      targets: puff,
      x: at.x + Math.cos(angle) * 34,
      y: y + Math.sin(angle) * 14 - 10,
      alpha: 0,
      scale: 2.2,
      duration: 700,
      ease: "Quad.easeOut",
      onComplete: () => {
        puff.destroy();
      },
    });
  }
  scene.cameraController.shake(160, 0.004);
}

export function subscribeWallHits(scene: GameScene): void {
  const layout = activeLayout();
  if (!layout.walledSidelines) return;
  const show = (hit: WallHit | null) => {
    if (hit) playWallHit(scene, hit);
  };
  scene.subscribe(GameEventNames.BallThrownIn, ({ from }) => {
    show(wallHitFromThrowIn(layout, from));
  });
  scene.subscribe(GameEventNames.PlayerPushedIntoCrowd, ({ exitSquare }) => {
    show(wallHitFromSquare(layout, exitSquare));
  });
}
