import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { DiceRoll, DiceThrow } from "./diceScene";
import { d16Geometry, d16Labelling } from "./d16";
import { faceMaterial } from "./diceFaces";
import { labelling, simulate, upFace } from "./dicePhysics";
import { clack, loadClacks } from "./diceSound";
import { createStage, faceForward, liftEase } from "./diceStage";
import { indexed } from "./diceValues";
import type { Stage } from "./diceStage";

type Control = Pick<DiceThrow, "mark" | "stop" | "hurry">;
type Simulation = ReturnType<typeof simulate>;
type Pose = Pick<THREE.Object3D, "position" | "quaternion">;

function snapshot(mesh: THREE.Mesh): Pose {
  return {
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
  };
}

function createDice(input: {
  roll: DiceRoll;
  sim: Simulation;
  stage: Stage;
  geometry: THREE.BufferGeometry;
}) {
  const { roll, sim, stage, geometry } = input;
  return roll.values.map((value, i) => {
    const up = indexed(sim.ups, i);
    const labels =
      roll.kind === "d16" ? d16Labelling(up, value) : labelling(up, value);
    const mesh = new THREE.Mesh(
      geometry,
      labels.map((v) => faceMaterial(roll, v))
    );
    mesh.castShadow = true;
    mesh.userData["labels"] = labels;
    stage.scene.add(mesh);
    const spread = (i - (roll.values.length - 1) / 2) * 1.35;
    const position = stage.camera.position
      .clone()
      .lerp(stage.lookAt, 0.63)
      .add(new THREE.Vector3(spread, 0, 0));
    return {
      mesh,
      labels,
      lifted: { position, quaternion: new THREE.Quaternion() },
      settled: snapshot(mesh),
    };
  });
}

function scaleTarget(marked: number | null, index: number): number {
  if (marked === null) return 1;
  return marked === index ? 1.2 : 0.75;
}

class DiceAnimation implements Control {
  private readonly input;
  private readonly sim;
  private readonly stage;
  private readonly geometry;
  private readonly dice;
  private readonly raycaster = new THREE.Raycaster();
  private running = true;
  private markedIndex: number | null = null;
  private liftedAt: number | null = null;
  private rate = 1;
  private tumbleMs = 0;
  private lastFrame = 0;
  private played = 0;

  constructor(input: {
    host: HTMLElement;
    roll: DiceRoll;
    sound: boolean;
    pick: (index: number) => void;
    resolve: (values: number[]) => void;
  }) {
    this.input = input;
    this.sim = simulate(input.roll.values.length, input.roll.kind);
    if (input.sound) void loadClacks();
    this.stage = createStage(input.host, input.roll.values.length);
    this.geometry =
      input.roll.kind === "d16"
        ? d16Geometry()
        : new RoundedBoxGeometry(1, 1, 1, 4, 0.12);
    this.dice = createDice({
      ...input,
      sim: this.sim,
      stage: this.stage,
      geometry: this.geometry,
    });
    this.stage.gl.domElement.addEventListener(
      "pointerdown",
      this.onPointerDown
    );
    this.stage.gl.domElement.addEventListener(
      "pointermove",
      this.onPointerMove
    );
  }

  private forward(die: (typeof this.dice)[number]): THREE.Quaternion {
    return faceForward({
      mesh: die.mesh,
      kind: this.input.roll.kind,
      camera: this.stage.camera,
      at: die.lifted.position,
    });
  }

  private render(): void {
    this.stage.gl.render(this.stage.scene, this.stage.camera);
  }

  private applyFrame(frame: Simulation["frames"][number]): void {
    this.dice.forEach(({ mesh }, index) => {
      const [x, y, z, qx, qy, qz, qw] = indexed(frame, index);
      mesh.position.set(x, y, z);
      mesh.quaternion.set(qx, qy, qz, qw);
    });
  }

  private showResult(): void {
    this.applyFrame(indexed(this.sim.frames, this.sim.frames.length - 1));
    this.dice.forEach((die) => {
      die.mesh.quaternion.copy(this.forward(die));
      die.mesh.position.copy(die.lifted.position);
    });
    this.render();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.liftedAt === null) this.showResult();
    const element = this.stage.gl.domElement;
    element.removeEventListener("pointerdown", this.onPointerDown);
    element.removeEventListener("pointermove", this.onPointerMove);
    element.style.cursor = "";
    this.geometry.dispose();
    this.input.resolve(this.input.roll.values);
  }

  mark(index: number | null): void {
    this.markedIndex = index;
  }

  hurry(): void {
    const left = (this.sim.frames.length / 60) * 1000 - this.tumbleMs;
    this.rate = Math.max(this.rate, 2.2, left / 700);
  }

  private dieAt(event: PointerEvent): number {
    if (this.liftedAt === null) return -1;
    const box = this.stage.gl.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1
    );
    this.raycaster.setFromCamera(pointer, this.stage.camera);
    const hit = this.raycaster.intersectObjects(
      this.dice.map((die) => die.mesh)
    )[0];
    return hit ? this.dice.findIndex((die) => die.mesh === hit.object) : -1;
  }

  private onPointerDown = (event: PointerEvent): void => {
    const index = this.dieAt(event);
    if (index >= 0) this.input.pick(index);
  };

  private onPointerMove = (event: PointerEvent): void => {
    this.stage.gl.domElement.style.cursor =
      this.dieAt(event) >= 0 ? "pointer" : "";
  };

  private playImpacts(frame: number): void {
    for (
      let impact = this.sim.impacts[this.played];
      impact && impact.frame <= frame;
      impact = this.sim.impacts[this.played]
    ) {
      if (this.input.sound) clack(impact.strength);
      this.played++;
    }
  }

  private settle(): void {
    this.dice.forEach((die) => {
      die.settled = snapshot(die.mesh);
      die.lifted.quaternion = this.forward(die);
    });
    this.liftedAt = performance.now();
    this.input.resolve(
      this.dice.map(({ mesh, labels }) =>
        indexed(labels, upFace(mesh.quaternion, this.input.roll.kind).face)
      )
    );
  }

  private tumble(): void {
    const frame = Math.min(
      this.sim.frames.length - 1,
      Math.floor((this.tumbleMs / 1000) * 60)
    );
    this.playImpacts(frame);
    this.applyFrame(indexed(this.sim.frames, frame));
    if (frame === this.sim.frames.length - 1) this.settle();
  }

  private lift(liftedAt: number): void {
    const ease = liftEase(performance.now() - liftedAt);
    this.dice.forEach(({ mesh, settled, lifted }, index) => {
      mesh.position.lerpVectors(settled.position, lifted.position, ease);
      mesh.quaternion.slerpQuaternions(
        settled.quaternion,
        lifted.quaternion,
        ease
      );
      const target = scaleTarget(this.markedIndex, index);
      mesh.scale.setScalar(mesh.scale.x + (target - mesh.scale.x) * 0.2);
    });
  }

  start(): void {
    this.lastFrame = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (!this.running) return;
    const now = performance.now();
    this.tumbleMs += (now - this.lastFrame) * this.rate;
    this.lastFrame = now;
    if (this.liftedAt === null) this.tumble();
    else this.lift(this.liftedAt);
    this.render();
    requestAnimationFrame(this.tick);
  };
}

export function throwDice(input: {
  host: HTMLElement;
  roll: DiceRoll;
  sound: boolean;
  pick: (index: number) => void;
  ready: (control: Control) => void;
}): Promise<number[]> {
  return new Promise((resolve) => {
    const animation = new DiceAnimation({ ...input, resolve });
    input.ready(animation);
    animation.start();
  });
}
