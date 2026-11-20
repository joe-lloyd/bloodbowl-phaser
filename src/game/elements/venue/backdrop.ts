import type Phaser from "phaser";
import { activeLayout } from "../../variants/activeMatch";
import {
  dugoutGateX,
  venueDugouts,
  type VenueDugouts,
} from "../../presentation/venueSidelines";
import { preloadStadium, Stadium } from "../Stadium";
import { PaintedVenue } from "./PaintedVenue";
import type { VenueGates } from "./paintVenue";
import type { TeamColours } from "./markings";

export interface VenueBackdrop {
  readonly dugouts: VenueDugouts;
  readonly gates: VenueGates;
  readonly origin: { x: number; y: number };
  readonly width: number;
  readonly height: number;
  destroy(): void;
}

export function preloadVenue(scene: Phaser.Scene): void {
  if (activeLayout().venue === "stadium") preloadStadium(scene);
}

export function createVenueBackdrop(
  scene: Phaser.Scene,
  colours: TeamColours
): VenueBackdrop {
  const layout = activeLayout();
  if (layout.venue === "stadium") return new Stadium(scene, colours);
  const dugouts = venueDugouts(layout);
  const gates = layout.walledSidelines
    ? { home: dugoutGateX(dugouts.home), away: dugoutGateX(dugouts.away) }
    : {};
  return new PaintedVenue(scene, { layout, colours, dugouts, gates });
}
