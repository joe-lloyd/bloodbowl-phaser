import Phaser from "phaser";
import { Player, PlayerStatus } from "../../types/Player";
import { TeamColors } from "../../types/Team";
import { PlayerSprite, PLAYER_DEPTH } from "./PlayerSprite";
import { BoardPoint, walkingSteps } from "../presentation/sidelineRoutes";
import { facingForStep } from "../presentation/playerArt";
import { SidelineStaffSprite } from "./SidelineStaffSprite";

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
 * A walk follows the touchline route. A medical crew comes from the box
 * along its reverse, collects the patient, and retraces its steps.
 */
export function playPitchExit(
  scene: Phaser.Scene,
  sprite: PlayerSprite,
  route: readonly BoardPoint[],
  exit: PitchExit,
  kit: TeamColors,
  signal?: AbortSignal
): Promise<void> {
  if (route.length < 2 || signal?.aborted) return Promise.resolve();
  const cleanups: (() => void)[] = [() => scene.tweens.killTweensOf(sprite)];
  let cleaned = false;
  const clear = () => {
    if (cleaned) return;
    cleaned = true;
    cleanups.forEach((cleanup) => cleanup());
  };
  let stopped = false;
  let stop: () => void = () => {};
  const cancelled = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const onDestroy = () => {
    stopped = true;
    clear();
    stop();
  };
  sprite.once(Phaser.GameObjects.Events.DESTROY, onDestroy);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onDestroy);
  signal?.addEventListener("abort", onDestroy, { once: true });

  const run = async () => {
    if (exit === "walk") {
      await sprite.animateMovement(walkingSteps(route));
      return;
    }
    if (exit === "injured") leaveBlood(scene, route[0]);
    const prop =
      exit === "dead" ? coffin(scene) : stretcher(scene, exit === "injured");
    const to = route[route.length - 1];
    prop.setPosition(to.x, to.y).setDepth(PLAYER_DEPTH + to.y - 1);
    const stars = exit === "knockedOut" ? seeingStars(scene, sprite) : null;
    const medics = [-1, 1].map(
      (side, index) =>
        new SidelineStaffSprite(
          scene,
          to.x + side * 34,
          to.y + side * 9,
          "medic",
          kit,
          "s",
          index
        )
    );
    cleanups.push(() => {
      scene.tweens.killTweensOf(prop);
      prop.destroy();
      medics.forEach((medic) => medic.destroy());
      if (stars) {
        scene.tweens.killTweensOf(stars);
        stars.destroy();
      }
    });
    // The patient stays where they fell until the empty stretcher arrives.
    await moveCarrier(scene, prop, medics, [...route].reverse());
    if (stopped) return;
    medics.forEach((medic) => medic.stand());
    if (exit === "dead") sprite.setVisible(false);
    await moveCarrier(
      scene,
      prop,
      medics,
      route,
      sprite,
      stars,
      exit === "dead"
    );
    if (stopped) return;
    sprite.setPosition(to.x, to.y).setVisible(true);
  };

  return Promise.race([run(), cancelled]).finally(() => {
    sprite.off(Phaser.GameObjects.Events.DESTROY, onDestroy);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onDestroy);
    signal?.removeEventListener("abort", onDestroy);
    clear();
  });
}

function moveCarrier(
  scene: Phaser.Scene,
  prop: Phaser.GameObjects.Container,
  medics: SidelineStaffSprite[],
  route: readonly BoardPoint[],
  patient?: PlayerSprite,
  stars?: Phaser.GameObjects.Text | null,
  coffinOnly = false
): Promise<void> {
  return new Promise((resolve) => {
    scene.tweens.chain({
      targets: patient && !coffinOnly ? [prop, patient] : [prop],
      tweens: route.slice(1).map((to, i) => ({
        x: to.x,
        y: to.y,
        duration:
          (Math.hypot(to.x - route[i].x, to.y - route[i].y) / CARRY_SPEED) *
          1000,
        // Pause at the pickup, while the patient is put on the stretcher.
        delay: patient && i === 0 ? 350 : 0,
        ease: "Linear",
        onStart: () => {
          const facing = facingForStep(to.x - route[i].x, to.y - route[i].y);
          if (facing) medics.forEach((medic) => medic.walk(facing));
        },
        onUpdate: () => {
          prop.setDepth(PLAYER_DEPTH + prop.y - (coffinOnly ? 0 : 1));
          medics.forEach((medic, index) => {
            const side = index === 0 ? -1 : 1;
            medic.setPosition(prop.x + side * 34, prop.y + side * 9);
          });
          if (patient && stars) {
            stars.setPosition(
              patient.x,
              patient.y + patient.getHeadOffset() - 4
            );
            stars.setDepth(PLAYER_DEPTH + patient.y + 1);
          }
        },
      })),
      onComplete: () => resolve(),
    });
  });
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
