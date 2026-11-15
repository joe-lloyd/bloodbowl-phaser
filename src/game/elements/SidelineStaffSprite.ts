import Phaser from "phaser";
import { TeamColors } from "../../types/Team";
import {
  Animation,
  Facing,
  frameName,
  hasModelArt,
  LAYERS,
  modelArt,
  preloadModels,
  textureKey,
} from "../presentation/playerArt";
import { prefersReducedMotion } from "../presentation/motion";
import type { SidelineStaffType } from "../presentation/sidelineStaff";
import { PLAYER_DEPTH } from "./PlayerSprite";

type CrewRole = SidelineStaffType | "medic";
const MODELS: Record<CrewRole, string> = {
  coach: "sideline_coach",
  cheerleader: "sideline_cheerleader",
  apothecary: "sideline_apothecary",
  fan: "sideline_fan",
  medic: "sideline_medic",
};

/** Only the crew already rendered: a model not in the manifest has no files. */
export function preloadSidelineArt(scene: Phaser.Scene): void {
  preloadModels(scene, Object.values(MODELS).filter(hasModelArt));
}

/**
 * A kit-tinted, animated miniature without a player's number or hit square.
 * Until its model is rendered it draws nothing, shadow included, so a
 * stretcher moves on its own and a terrace shows only its benches.
 */
export class SidelineStaffSprite extends Phaser.GameObjects.Container {
  private layers: Phaser.GameObjects.Sprite[] = [];
  private model: string;
  private animation: Animation;
  private facing: Facing;
  private phase: number;
  private shown = "";
  private still = prefersReducedMotion();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    role: CrewRole,
    kit: TeamColors,
    facing: Facing,
    index = 0
  ) {
    super(scene, x, y);
    this.model = MODELS[role];
    this.animation = role === "cheerleader" ? "cheer" : "idle";
    this.facing = facing;
    this.phase = index * 137;
    if (hasModelArt(this.model))
      this.add(scene.add.ellipse(0, 1, 32, 13, 0x000000, 0.25));
    const art = modelArt(this.model);
    const tints = [null, kit.primary, kit.secondary];
    for (const [i, layer] of LAYERS.entries()) {
      if (!scene.textures.exists(textureKey(this.model, layer))) continue;
      const sprite = scene.add.sprite(
        0,
        0,
        textureKey(this.model, layer),
        frameName("idle", facing, 0)
      );
      sprite.setOrigin(art.anchor[0] / art.frame, art.anchor[1] / art.frame);
      if (tints[i] !== null) sprite.setTint(tints[i]!);
      this.layers.push(sprite);
      this.add(sprite);
    }
    this.setName(`sideline:${role}:${index}`);
    this.setSize(38, 60);
    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    });
    this.tick(0);
  }

  public walk(facing: Facing): void {
    this.facing = facing;
    this.animation = "run";
  }

  public stand(): void {
    this.animation = "idle";
  }

  private tick(time: number): void {
    this.setDepth(PLAYER_DEPTH + this.y);
    const count = modelArt(this.model).animations[this.animation] ?? 1;
    const fps = this.animation === "run" ? 12 : 8;
    const step =
      this.still && this.animation !== "run"
        ? 0
        : Math.floor(((time + this.phase) / 1000) * fps);
    const name = frameName(this.animation, this.facing, step % count);
    if (name === this.shown) return;
    this.shown = name;
    for (const layer of this.layers) layer.setFrame(name);
  }
}
