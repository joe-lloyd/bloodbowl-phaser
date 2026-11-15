import Phaser from "phaser";
import { Player, PlayerStatus } from "../../types/Player";
import { PlayerSprite } from "./PlayerSprite";

/**
 * How a player leaves the pitch for a dugout box, so the coach can tell a
 * KO from a casualty at a glance:
 * - walk: sent off, or into the Reserves. They walk to the box.
 * - knockedOut: carried on a plain stretcher, seeing stars.
 * - injured: carried on a stretcher with a red cross, leaving blood behind.
 * - dead: carried off in a coffin.
 */
export type PitchExit = "walk" | "knockedOut" | "injured" | "dead";

export function pitchExitFor(player: Player): PitchExit {
  switch (player.status) {
    case PlayerStatus.KO:
      return "knockedOut";
    case PlayerStatus.INJURED:
      return "injured";
    case PlayerStatus.DEAD:
      return "dead";
    default:
      return "walk";
  }
}

/** World pixels a stretcher crew covers each second. */
const CARRY_SPEED = 280;

/**
 * Carry `sprite` from where it stands to `to`, dressed for `exit`.
 * Resolves once it has arrived; the props it brought are gone by then.
 */
export function playPitchExit(
  scene: Phaser.Scene,
  sprite: PlayerSprite,
  to: { x: number; y: number },
  exit: PitchExit
): Promise<void> {
  const from = { x: sprite.x, y: sprite.y };
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = Phaser.Math.Clamp(
    (distance / CARRY_SPEED) * 1000,
    1200,
    2600
  );

  // Torn down mid-exit, by a reload or the scene ending: the exit stops
  // with the sprite, props and all, instead of tweening something gone
  const cleanups: (() => void)[] = [() => scene.tweens.killTweensOf(sprite)];
  const onDestroy = () => cleanups.forEach((cleanup) => cleanup());
  sprite.once(Phaser.GameObjects.Events.DESTROY, onDestroy);
  const finished = () => {
    sprite.off(Phaser.GameObjects.Events.DESTROY, onDestroy);
  };

  if (exit === "walk") return walk(sprite, from, to).then(finished);

  if (exit === "injured") leaveBlood(scene, from);
  const prop =
    exit === "dead" ? coffin(scene) : stretcher(scene, exit === "injured");
  prop.setPosition(from.x, from.y).setDepth(sprite.depth - 1);
  if (exit === "dead") {
    sprite.setVisible(false);
    prop.setDepth(sprite.depth);
  }
  const stars = exit === "knockedOut" ? seeingStars(scene, sprite) : null;
  const clearProps = () => {
    scene.tweens.killTweensOf(prop);
    prop.destroy();
    if (stars) {
      // The twinkle repeats forever; it goes with the stars
      scene.tweens.killTweensOf(stars);
      stars.destroy();
    }
  };
  cleanups.push(clearProps);

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: exit === "dead" ? [prop] : [sprite, prop],
      x: to.x,
      y: to.y,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        stars?.setPosition(sprite.x, sprite.y + sprite.getHeadOffset() - 4);
        if (exit !== "dead") prop.setDepth(sprite.depth - 1);
      },
      onComplete: () => {
        finished();
        clearProps();
        // The coffin went alone; the player it carried arrives with it
        sprite.setPosition(to.x, to.y);
        sprite.setVisible(true);
        resolve();
      },
    });
  });
}

/** A sent-off player walks to the box, a square at a time. */
function walk(
  sprite: PlayerSprite,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  const steps = Math.max(
    1,
    Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 48)
  );
  const path = Array.from({ length: steps }, (_, i) => ({
    x: from.x + ((to.x - from.x) * (i + 1)) / steps,
    y: from.y + ((to.y - from.y) * (i + 1)) / steps,
  }));
  return sprite.animateMovement(path);
}

/** Two poles and a canvas bed, under a player lying on it. */
function stretcher(
  scene: Phaser.Scene,
  medical: boolean
): Phaser.GameObjects.Container {
  const bed = scene.add.graphics();
  // The canvas: grey for a KO, white with a red cross for a casualty
  bed.fillStyle(0x000000, 0.35);
  bed.fillEllipse(0, 4, 66, 20);
  bed.lineStyle(4, 0x5b3a1e, 1);
  bed.lineBetween(-36, -4, 32, 10);
  bed.lineBetween(-32, -12, 36, 2);
  bed.fillStyle(medical ? 0xf3efe6 : 0x9a9488, 1);
  bed.fillPoints(
    [
      new Phaser.Math.Vector2(-26, -9),
      new Phaser.Math.Vector2(28, 1),
      new Phaser.Math.Vector2(24, 8),
      new Phaser.Math.Vector2(-30, -2),
    ],
    true
  );
  if (medical) {
    bed.fillStyle(0xd0021b, 1);
    bed.fillRect(-2, -6, 4, 12);
    bed.fillRect(-7, -2, 14, 4);
  }
  return scene.add.container(0, 0, [bed]);
}

/** A plain wooden coffin with a cross on the lid. */
function coffin(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const box = scene.add.graphics();
  box.fillStyle(0x000000, 0.4);
  box.fillEllipse(0, 6, 70, 22);
  const lid = [
    [-34, -2],
    [-20, -14],
    [30, -4],
    [34, 2],
    [20, 12],
    [-28, 4],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y - 10));
  box.fillStyle(0x4a2d16, 1);
  box.fillPoints(lid, true);
  box.lineStyle(2, 0x24150a, 1);
  box.strokePoints(lid, true);
  box.lineStyle(3, 0xd9c7a0, 1);
  box.lineBetween(-8, -16, 12, -8);
  box.lineBetween(-6, -8, 4, -16);
  return scene.add.container(0, 0, [box]);
}

/** Stars circling the head of a player who has been knocked out. */
function seeingStars(
  scene: Phaser.Scene,
  sprite: PlayerSprite
): Phaser.GameObjects.Text {
  const stars = scene.add
    .text(sprite.x, sprite.y + sprite.getHeadOffset() - 4, "★ ✦ ★", {
      fontSize: "13px",
      color: "#ffd84a",
      stroke: "#000000",
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setDepth(sprite.depth + 1);
  scene.tweens.add({
    targets: stars,
    angle: { from: -12, to: 12 },
    duration: 300,
    yoyo: true,
    repeat: -1,
  });
  return stars;
}

/** A splash of blood where a casualty fell, gone after a few seconds. */
function leaveBlood(scene: Phaser.Scene, at: { x: number; y: number }): void {
  const blood = scene.add.graphics().setDepth(6);
  blood.fillStyle(0x8a0b0b, 0.85);
  blood.fillEllipse(at.x, at.y, 34, 13);
  blood.fillEllipse(at.x + 16, at.y + 4, 10, 5);
  blood.fillEllipse(at.x - 15, at.y - 3, 8, 4);
  scene.tweens.add({
    targets: blood,
    alpha: 0,
    delay: 3500,
    duration: 1200,
    onComplete: () => blood.destroy(),
  });
}
