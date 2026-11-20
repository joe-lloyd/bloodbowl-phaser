import type Phaser from "phaser";
import { activeLayout } from "../../variants/activeMatch";
import type { Venue } from "../../variants/pitchLayouts";
import { MATCH_STYLE } from "../../presentation/matchStyle";
import {
  dugoutGateX,
  type VenueDugouts,
} from "../../presentation/venueSidelines";
import { preloadStadium, Stadium, type TeamColours } from "../Stadium";

interface VenueGates {
  home?: number;
  away?: number;
}

export interface VenueBackdrop {
  readonly dugouts: VenueDugouts;
  readonly gates: VenueGates;
  readonly origin: { x: number; y: number };
  readonly width: number;
  readonly height: number;
  destroy(): void;
}

function venueArtPath(venue: Venue): string {
  return venue === "stadium"
    ? MATCH_STYLE.stadiumPath
    : `${MATCH_STYLE.venuePath}/${venue}`;
}

export function preloadVenue(scene: Phaser.Scene): void {
  preloadStadium(scene, venueArtPath(activeLayout().venue));
}

export function createVenueBackdrop(
  scene: Phaser.Scene,
  colours: TeamColours
): VenueBackdrop {
  const layout = activeLayout();
  const art = new Stadium(scene, venueArtPath(layout.venue), colours);
  const { dugouts } = art;
  const gates = layout.walledSidelines
    ? { home: dugoutGateX(dugouts.home), away: dugoutGateX(dugouts.away) }
    : {};
  return {
    dugouts,
    gates,
    origin: art.origin,
    width: art.width,
    height: art.height,
    destroy: () => {
      art.destroy();
    },
  };
}
