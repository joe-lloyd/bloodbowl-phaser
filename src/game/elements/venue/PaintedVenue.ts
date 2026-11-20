import Phaser from "phaser";
import type { VenueDugouts } from "../../presentation/venueSidelines";
import {
  paintVenue,
  venueCanvas,
  type VenueGates,
  type VenuePlan,
} from "./paintVenue";

export class PaintedVenue {
  public readonly dugouts: VenueDugouts;
  public readonly gates: VenueGates;
  public readonly origin: { x: number; y: number };
  public readonly width: number;
  public readonly height: number;
  private image: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, plan: VenuePlan) {
    this.dugouts = plan.dugouts;
    this.gates = plan.gates;
    const size = venueCanvas(plan.layout);
    this.origin = size.origin;
    this.width = size.width;
    this.height = size.height;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas to paint the venue on");
    const seed = new Phaser.Math.RandomDataGenerator([plan.layout.venue]);
    paintVenue({ ctx, origin: size.origin, random: () => seed.frac() }, plan);
    const texture = scene.textures.addCanvas(
      `venue:${plan.layout.venue}-${Phaser.Math.RND.uuid()}`,
      canvas
    );
    if (!texture) return;
    this.image = scene.add.image(0, 0, texture).setOrigin(0).setDepth(0);
  }

  public destroy(): void {
    const texture = this.image?.texture;
    this.image?.destroy();
    this.image = null;
    texture?.destroy();
  }
}
