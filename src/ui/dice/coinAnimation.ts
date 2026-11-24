import * as THREE from "three";
import type { CoinToss, DiceTeam, DiceThrow } from "./diceScene";
import { coinTexture } from "./diceFaces";
import { clack, loadClacks } from "./diceSound";
import { createStage, drawStage, faceCamera, liftEase } from "./diceStage";

const COIN = { radius: 1.05, thickness: 0.12 };
const FLIP_MS = 1500;
const SETTLE_MS = 380;
type Control = Pick<DiceThrow, "mark" | "stop" | "hurry">;

function coinFace(team: DiceTeam): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    map: coinTexture(team),
    metalness: 0.35,
    roughness: 0.4,
    clearcoat: 0.6,
  });
}

function createCoin(toss: CoinToss): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    COIN.radius,
    COIN.radius,
    COIN.thickness,
    64
  );
  const edge = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.85,
    roughness: 0.3,
  });
  const coin = new THREE.Mesh(geometry, [
    edge,
    coinFace(toss.faces[0]),
    coinFace(toss.faces[1]),
  ]);
  coin.castShadow = true;
  return coin;
}

class CoinAnimation implements Control {
  private readonly stage;
  private readonly coin;
  private readonly spin;
  private readonly rest = COIN.thickness / 2;
  private readonly from = new THREE.Vector3(-2.6, this.rest, 0.4);
  private readonly to = new THREE.Vector3(0, this.rest, 0);
  private readonly liftedAt;
  private readonly liftedTurn;
  private readonly input;
  private startedAt = 0;
  private running = true;
  private landed = false;
  private restTurn: THREE.Quaternion | null = null;

  constructor(input: {
    host: HTMLElement;
    toss: CoinToss;
    sound: boolean;
    resolve: (values: number[]) => void;
  }) {
    this.input = input;
    if (input.sound) void loadClacks();
    this.stage = createStage(input.host);
    this.coin = createCoin(input.toss);
    this.stage.scene.add(this.coin);
    this.spin = Math.PI * (input.toss.side === 1 ? 10 : 11);
    this.liftedAt = this.stage.camera.position
      .clone()
      .lerp(this.stage.lookAt, 0.5);
    this.liftedTurn = faceCamera({
      camera: this.stage.camera,
      at: this.liftedAt,
      local: new THREE.Vector3(0, input.toss.side === 1 ? 1 : -1, 0),
      side: new THREE.Vector3(input.toss.side === 1 ? 1 : -1, 0, 0),
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.coin.geometry.dispose();
    this.input.resolve([this.input.toss.side]);
  }

  mark(): void {
    return;
  }
  hurry(): void {
    return;
  }

  private flip(elapsed: number): void {
    const t = elapsed / FLIP_MS;
    this.coin.position.lerpVectors(this.from, this.to, t);
    this.coin.position.y = this.rest + 2.4 * 4 * t * (1 - t);
    this.coin.rotation.set(0, 0, this.spin * t);
  }

  private settle(elapsed: number): void {
    if (!this.landed) {
      this.landed = true;
      if (this.input.sound) clack(0.7);
    }
    const u = (elapsed - FLIP_MS) / SETTLE_MS;
    this.coin.position.copy(this.to);
    this.coin.rotation.set(
      0.22 * (1 - u) ** 2 * Math.sin(u * 22),
      0,
      this.spin + 0.18 * (1 - u) ** 2 * Math.cos(u * 22)
    );
  }

  private lift(elapsed: number): void {
    if (!this.restTurn) {
      this.coin.position.copy(this.to);
      this.coin.rotation.set(0, 0, this.spin);
      this.restTurn = this.coin.quaternion.clone();
      this.coin.castShadow = false;
      this.input.resolve([this.input.toss.side]);
    }
    const ease = liftEase(elapsed - FLIP_MS - SETTLE_MS);
    this.coin.position.lerpVectors(this.to, this.liftedAt, ease);
    this.coin.quaternion.slerpQuaternions(this.restTurn, this.liftedTurn, ease);
  }

  start(): void {
    this.startedAt = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (!this.running) return;
    const elapsed = performance.now() - this.startedAt;
    if (elapsed < FLIP_MS) this.flip(elapsed);
    else if (elapsed < FLIP_MS + SETTLE_MS) this.settle(elapsed);
    else this.lift(elapsed);
    drawStage(this.stage);
    requestAnimationFrame(this.tick);
  };
}

export function throwCoin(input: {
  host: HTMLElement;
  toss: CoinToss;
  sound: boolean;
  ready: (control: Control) => void;
}): Promise<number[]> {
  return new Promise((resolve) => {
    const animation = new CoinAnimation({ ...input, resolve });
    input.ready(animation);
    animation.start();
  });
}
