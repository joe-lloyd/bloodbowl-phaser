import Phaser from "phaser";
import { type Player, PlayerStatus } from "../../types/Player";
import { type TeamColors } from "../../types/Team";
import { PlayerSprite, PLAYER_DEPTH } from "./PlayerSprite";
import {
  type BoardPoint,
  type BoardProjection,
  carrierProjection,
  walkingSteps,
} from "../presentation/sidelineRoutes";
import { facingForStep } from "../presentation/playerArt";
import { SidelineStaffSprite } from "./SidelineStaffSprite";

export type PitchExit = "walk" | "knockedOut" | "injured" | "dead";

export function pitchExitFor(player: Player): PitchExit {
  switch (player.status) {
    case PlayerStatus.KO:
      return "knockedOut";
    case PlayerStatus.INJURED:
      return "injured";
    case PlayerStatus.DEAD:
      return "dead";
    case PlayerStatus.ACTIVE:
    case PlayerStatus.PRONE:
    case PlayerStatus.REMOVED:
    case PlayerStatus.RESERVE:
    case PlayerStatus.STUNNED:
      return "walk";
  }
}

const CARRY_SPEED = 280;

interface Carrier {
  prop: Phaser.GameObjects.Container;
  draw: (project: BoardProjection) => void;
}

interface PitchExitOptions {
  scene: Phaser.Scene;
  sprite: PlayerSprite;
  route: readonly BoardPoint[];
  exit: PitchExit;
  kit: TeamColors;
  signal?: AbortSignal;
}

class ExitLifetime {
  private stopped = false;
  public readonly cancelled: Promise<void>;
  public readonly cleanups: (() => void)[];
  private cleaned = false;
  private stop: () => void = () => undefined;
  private readonly options: PitchExitOptions;

  constructor(options: PitchExitOptions) {
    this.options = options;
    this.cleanups = [() => options.scene.tweens.killTweensOf(options.sprite)];
    this.cancelled = new Promise((resolve) => {
      this.stop = resolve;
    });
    options.sprite.once(Phaser.GameObjects.Events.DESTROY, this.onDestroy);
    options.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onDestroy);
    options.signal?.addEventListener("abort", this.onDestroy, { once: true });
  }

  public isStopped(): boolean {
    return this.stopped;
  }

  private clear(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.cleanups.forEach((cleanup) => {
      cleanup();
    });
  }

  private onDestroy = (): void => {
    this.stopped = true;
    this.clear();
    this.stop();
  };

  public finish = (): void => {
    const { sprite, scene, signal } = this.options;
    sprite.off(Phaser.GameObjects.Events.DESTROY, this.onDestroy);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onDestroy);
    signal?.removeEventListener("abort", this.onDestroy);
    this.clear();
  };
}

export function playPitchExit(options: PitchExitOptions): Promise<void> {
  const { route, signal } = options;
  const from = route[0];
  const to = route[route.length - 1];
  if (!from || !to || route.length < 2 || signal?.aborted)
    return Promise.resolve();
  const lifetime = new ExitLifetime(options);
  const run = runPitchExit({ options, lifetime, from, to });
  return Promise.race([run, lifetime.cancelled]).finally(lifetime.finish);
}

interface CarrierTransport {
  scene: Phaser.Scene;
  carrier: Carrier;
  medics: SidelineStaffSprite[];
  patient: PlayerSprite | null;
  stars: Phaser.GameObjects.Text | null;
  coffinOnly: boolean;
}

interface PatientJourney {
  options: PitchExitOptions;
  lifetime: ExitLifetime;
  from: BoardPoint;
  to: BoardPoint;
}

async function runPitchExit(journey: PatientJourney): Promise<void> {
  const { options, lifetime, to } = journey;
  const { sprite, route, exit } = options;
  if (exit === "walk") {
    await sprite.animateMovement(walkingSteps(route));
    return;
  }
  const transport = prepareCarrier(journey);
  await moveCarrier(transport, [...route].reverse());
  if (lifetime.isStopped()) return;
  transport.medics.forEach((medic) => {
    medic.stand();
  });
  if (exit === "dead") sprite.setVisible(false);
  await moveCarrier(
    { ...transport, patient: sprite, coffinOnly: exit === "dead" },
    route
  );
  if (lifetime.isStopped()) return;
  sprite.setPosition(to.x, to.y).setVisible(true);
}

function prepareCarrier(journey: PatientJourney): CarrierTransport {
  const { options, lifetime, from, to } = journey;
  const { scene, sprite, exit, kit } = options;
  if (exit === "injured") leaveBlood(scene, from);
  const carrier =
    exit === "dead" ? coffin(scene) : stretcher(scene, exit === "injured");
  const { prop } = carrier;
  prop.setPosition(to.x, to.y).setDepth(PLAYER_DEPTH + to.y - 1);
  const stars = exit === "knockedOut" ? seeingStars(scene, sprite) : null;
  const medics = [-1, 1].map(
    (side, index) =>
      new SidelineStaffSprite({
        scene: scene,
        x: to.x + side * 34,
        y: to.y + side * 9,
        role: "medic",
        kit: kit,
        facing: "s",
        index: index,
      })
  );
  const transport = {
    scene,
    carrier,
    medics,
    patient: null,
    stars,
    coffinOnly: false,
  };
  lifetime.cleanups.push(() => {
    destroyCarrier(transport);
  });
  return transport;
}

function destroyCarrier({
  scene,
  carrier,
  medics,
  stars,
}: CarrierTransport): void {
  scene.tweens.killTweensOf(carrier.prop);
  carrier.prop.destroy();
  medics.forEach((medic) => {
    medic.destroy();
  });
  if (stars) {
    scene.tweens.killTweensOf(stars);
    stars.destroy();
  }
}

function placeMedics(
  transport: CarrierTransport,
  project: BoardProjection
): void {
  const {
    carrier: { prop },
    medics,
  } = transport;
  medics.forEach((medic, index) => {
    const offset = project(index === 0 ? -48 : 48, 0);
    medic.setPosition(prop.x + offset.x, prop.y + offset.y);
  });
}

function updateCarrier(
  transport: CarrierTransport,
  project: BoardProjection
): void {
  const {
    carrier: { prop },
    patient,
    stars,
    coffinOnly,
  } = transport;
  prop.setDepth(PLAYER_DEPTH + prop.y - (coffinOnly ? 0 : 1));
  placeMedics(transport, project);
  if (patient && stars) {
    stars.setPosition(patient.x, patient.y + patient.getHeadOffset() - 4);
    stars.setDepth(PLAYER_DEPTH + patient.y + 1);
  }
}

function carrierStep(
  transport: CarrierTransport,
  segment: { from: BoardPoint; to: BoardPoint; index: number }
) {
  const { from, to, index } = segment;
  const { carrier, medics, patient } = transport;
  const project = carrierProjection(from, to);
  return {
    x: to.x,
    y: to.y,
    duration: (Math.hypot(to.x - from.x, to.y - from.y) / CARRY_SPEED) * 1000,
    delay: patient && index === 0 ? 350 : 0,
    ease: "Linear",
    onStart: () => {
      carrier.draw(project);
      placeMedics(transport, project);
      const facing = facingForStep(to.x - from.x, to.y - from.y);
      if (facing) {
        medics.forEach((medic) => {
          medic.walk(facing);
        });
        patient?.setFacing(facing);
      }
    },
    onUpdate: () => {
      updateCarrier(transport, project);
    },
  };
}

function moveCarrier(
  transport: CarrierTransport,
  route: readonly BoardPoint[]
): Promise<void> {
  const {
    scene,
    carrier: { prop },
    patient,
    coffinOnly,
  } = transport;
  const first = route[0];
  if (!first) return Promise.resolve();
  let from = first;
  const tweens = route.slice(1).map((to, index) => {
    const step = carrierStep(transport, { from, to, index });
    from = to;
    return step;
  });
  return new Promise((resolve) => {
    scene.tweens.chain({
      targets: patient && !coffinOnly ? [prop, patient] : [prop],
      tweens,
      onComplete: () => {
        resolve();
      },
    });
  });
}

function stretcher(scene: Phaser.Scene, medical: boolean): Carrier {
  const bed = scene.add.graphics().setPosition(0, -14);
  const shadow = scene.add.ellipse(0, 4, 66, 20, 0x000000, 0.35);
  return {
    prop: scene.add.container(0, 0, [shadow, bed]),
    draw: (project) => {
      bed.clear();

      bed.lineStyle(4, 0x5b3a1e, 1);
      for (const side of [-10, 10]) {
        const from = project(-44, side);
        const to = project(44, side);
        bed.lineBetween(from.x, from.y, to.x, to.y);
      }
      bed.fillStyle(medical ? 0xf3efe6 : 0x9a9488, 1);
      bed.fillPoints(
        [project(-34, -9), project(34, -9), project(34, 9), project(-34, 9)],
        true
      );
      if (medical) {
        bed.fillStyle(0xd0021b, 1);
        bed.fillPoints(
          [project(-9, -3), project(9, -3), project(9, 3), project(-9, 3)],
          true
        );
        bed.fillPoints(
          [project(-3, -9), project(3, -9), project(3, 9), project(-3, 9)],
          true
        );
      }
    },
  };
}

function coffin(scene: Phaser.Scene): Carrier {
  const box = scene.add.graphics().setPosition(0, -14);
  const shadow = scene.add.ellipse(0, 6, 70, 22, 0x000000, 0.4);
  return {
    prop: scene.add.container(0, 0, [shadow, box]),
    draw: (project) => {
      box.clear();
      const lid = (
        [
          [-38, -8],
          [-24, -13],
          [32, -13],
          [38, 0],
          [32, 13],
          [-24, 13],
        ] as const
      ).map(([x, y]) => project(x, y));
      box.fillStyle(0x4a2d16, 1);
      box.fillPoints(lid, true);
      box.lineStyle(2, 0x24150a, 1);
      box.strokePoints(lid, true);
      box.lineStyle(3, 0xd9c7a0, 1);
      const left = project(-12, 0);
      const right = project(12, 0);
      const top = project(0, -7);
      const bottom = project(0, 7);
      box.lineBetween(left.x, left.y, right.x, right.y);
      box.lineBetween(top.x, top.y, bottom.x, bottom.y);
    },
  };
}

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
    onComplete: () => {
      blood.destroy();
    },
  });
}
