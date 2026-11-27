import type Phaser from "phaser";
import { activeLayout } from "../../variants/activeMatch";
import type { PitchLayout } from "../../variants/pitchLayouts";
import { venueArtPath } from "../../presentation/matchStyle";
import type { Facing } from "../../presentation/playerArt";
import {
  ARENA_SEATS,
  type ArenaSeat,
  arenaDugouts,
  dugoutGateX,
} from "../../presentation/venueSidelines";
import {
  type DugoutSquares,
  preloadStadium,
  Stadium,
  type StadiumMeta,
} from "../Stadium";

export interface Bench {
  readonly squares: DugoutSquares;
  readonly facing: Facing;
  readonly gateX?: number;
  readonly terrace: boolean;
}

export interface VenueBackdrop {
  readonly benches: readonly Bench[];
  readonly origin: { x: number; y: number };
  readonly width: number;
  readonly height: number;
  destroy(): void;
}

const PAIR_LAYERS = ["home", "away"] as const;

const ARENA_FACINGS: Readonly<Record<ArenaSeat, Facing>> = {
  north: "w",
  east: "n",
  south: "e",
  west: "s",
};

const seatLayers = (layout: PitchLayout): readonly string[] =>
  layout.frames.length === ARENA_SEATS.length ? ARENA_SEATS : PAIR_LAYERS;

export function preloadVenue(scene: Phaser.Scene): void {
  const layout = activeLayout();
  preloadStadium(scene, venueArtPath(layout.venue), seatLayers(layout));
}

function benchesOf(
  layout: PitchLayout,
  dugouts: StadiumMeta["dugouts"]
): readonly Bench[] {
  if (!("home" in dugouts)) {
    const corners = arenaDugouts(layout);
    return ARENA_SEATS.map((seat) => ({
      squares: corners[seat],
      facing: ARENA_FACINGS[seat],
      terrace: false,
    }));
  }
  const bench = (squares: DugoutSquares, facing: Facing): Bench => ({
    squares,
    facing,
    terrace: true,
    ...(layout.walledSidelines && { gateX: dugoutGateX(squares) }),
  });
  return [bench(dugouts.home, "s"), bench(dugouts.away, "n")];
}

export function createVenueBackdrop(
  scene: Phaser.Scene,
  seatColours: readonly number[]
): VenueBackdrop {
  const layout = activeLayout();
  const art = new Stadium(
    scene,
    venueArtPath(layout.venue),
    seatLayers(layout).map((name, index) => ({
      name,
      tint: seatColours[index] ?? 0xffffff,
    }))
  );
  return {
    benches: benchesOf(layout, art.dugouts),
    origin: art.origin,
    width: art.width,
    height: art.height,
    destroy: () => {
      art.destroy();
    },
  };
}
