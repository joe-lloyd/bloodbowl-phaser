import type { PitchLayout } from "../../variants/pitchLayouts";
import type { VenueDugouts } from "../../presentation/venueSidelines";
import { MATCH_STYLE } from "../../presentation/matchStyle";
import { ISO } from "../GridUtils";
import {
  cssColour,
  type GroundRect,
  type IsoCanvas,
  onScreen,
} from "./isoCanvas";
import {
  type DugoutFloor,
  paintDugout,
  paintMarkings,
  type TeamColours,
} from "./markings";
import { obstacleBlocks, paintPit, paintStalls } from "./obstacles";
import { paintPitchGrid, paintSurface, pavedSurface } from "./surfaces";
import {
  paintBarricade,
  paintChannel,
  paintCrowd,
  paintHouses,
  paintLamps,
  paintPalm,
  paintSea,
  paintSewerArches,
  paintVignette,
} from "./surroundings";
import { BRICK_WALL, paintWall, STONE_WALL } from "./walls";

export interface VenueGates {
  home?: number;
  away?: number;
}

export interface VenuePlan {
  layout: PitchLayout;
  colours: TeamColours;
  dugouts: VenueDugouts;
  gates: VenueGates;
}

const MARGIN = { ends: 6, far: 8, near: 6, sky: 260 } as const;
const BACKLINE = { y0: -7.6, y1: -4.7 } as const;

export interface VenueCanvas {
  width: number;
  height: number;
  origin: { x: number; y: number };
}

export function venueCanvas(
  layout: Pick<PitchLayout, "cols" | "rows">
): VenueCanvas {
  const left = (-MARGIN.ends - layout.rows - MARGIN.near) * ISO.gx.x;
  const right = (layout.cols + MARGIN.ends + MARGIN.far) * ISO.gx.x;
  const top = (-MARGIN.ends - MARGIN.far) * ISO.gx.y - MARGIN.sky;
  const bottom =
    (layout.cols + layout.rows + MARGIN.ends + MARGIN.near) * ISO.gx.y;
  return {
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
    origin: { x: -left, y: -top },
  };
}

function groundArea(layout: PitchLayout): GroundRect {
  return {
    x0: -MARGIN.ends,
    y0: -MARGIN.far,
    x1: layout.cols + MARGIN.ends,
    y1: layout.rows + MARGIN.near,
  };
}

const FLOORS: Record<"cobbles" | "sand" | "sewer", DugoutFloor> = {
  cobbles: { base: "#3a3029", stripe: null },
  sand: { base: "#7d3a2c", stripe: "rgba(232, 220, 190, 0.32)" },
  sewer: { base: "#2b312a", stripe: null },
};

function paintGround(iso: IsoCanvas, plan: VenuePlan): void {
  const { layout } = plan;
  const surface = pavedSurface(layout.surface);
  const area = groundArea(layout);
  paintSurface(iso, surface, { rect: area, dim: 0.5 });
  if (surface === "sand") paintSea(iso, { ...area, y1: BACKLINE.y1 + 0.3 });
  if (surface === "sewer") {
    paintChannel(iso, { ...area, y0: BACKLINE.y1, y1: BACKLINE.y1 + 0.7 });
    paintChannel(iso, {
      ...area,
      y0: layout.rows + 4.4,
      y1: layout.rows + 5.2,
    });
  }
  paintSurface(iso, surface, {
    rect: { x0: 0, y0: 0, x1: layout.cols, y1: layout.rows },
    dim: 0,
  });
  paintPitchGrid(iso, layout);
  paintMarkings(iso, layout, plan.colours);
  const floor = FLOORS[surface];
  paintDugout(
    iso,
    { squares: plan.dugouts.home, kit: plan.colours.home },
    floor
  );
  paintDugout(
    iso,
    { squares: plan.dugouts.away, kit: plan.colours.away },
    floor
  );
}

function paintBackline(iso: IsoCanvas, layout: PitchLayout): void {
  const line = {
    ...BACKLINE,
    from: -MARGIN.ends,
    to: layout.cols + MARGIN.ends,
  };
  switch (layout.surface) {
    case "sand":
      paintPalm(iso, { x: -3, y: -3.5 });
      paintPalm(iso, { x: layout.cols + 2.5, y: -2.5 });
      return;
    case "sewer":
      paintSewerArches(iso, line);
      return;
    case "cobbles":
    case "grass":
      paintHouses(iso, line);
  }
}

function paintObstacles(iso: IsoCanvas, layout: PitchLayout): void {
  obstacleBlocks(layout.obstacles)
    .sort((a, b) => a.rect.x0 + a.rect.y0 - (b.rect.x0 + b.rect.y0))
    .forEach((block, index) => {
      if (block.kind === "sewer-pit") paintPit(iso, block.rect);
      else paintStalls(iso, block.rect, index);
    });
}

function paintWalls(
  iso: IsoCanvas,
  plan: VenuePlan,
  side: "far" | "near"
): void {
  const { layout, gates } = plan;
  if (!layout.walledSidelines) return;
  const style = layout.surface === "sewer" ? STONE_WALL : BRICK_WALL;
  const far = side === "far";
  const gateX = far ? gates.home : gates.away;
  paintWall(
    iso,
    {
      y: far ? -0.15 : layout.rows + 0.15,
      from: 0,
      to: layout.cols,
      height: far ? 1.8 : 0.9,
      ...(gateX === undefined ? {} : { gateX }),
    },
    style
  );
}

function paintEnds(iso: IsoCanvas, layout: PitchLayout): void {
  const rows = { y0: -0.6, y1: layout.rows + 0.6 };
  paintCrowd(iso, { x0: -5.6, x1: -1.7, ...rows });
  paintBarricade(iso, { x: -1.35, ...rows });
  paintBarricade(iso, { x: layout.cols + 1.35, ...rows });
  paintCrowd(iso, { x0: layout.cols + 1.7, x1: layout.cols + 5.6, ...rows });
}

function paintForeground(iso: IsoCanvas, layout: PitchLayout): void {
  if (layout.surface === "sand") {
    paintPalm(iso, { x: -2.5, y: layout.rows + 3 });
    paintPalm(iso, { x: layout.cols + 5, y: layout.rows + 2.5 });
    return;
  }
  if (layout.surface === "cobbles") {
    const xs = [2, layout.cols / 2, layout.cols - 2];
    paintLamps(iso, { y: layout.rows + 4.6, xs });
  }
}

export function paintVenue(iso: IsoCanvas, plan: VenuePlan): void {
  const { layout } = plan;
  const screen = onScreen(iso);
  screen.fillStyle = cssColour(MATCH_STYLE.background);
  screen.fillRect(0, 0, screen.canvas.width, screen.canvas.height);
  paintGround(iso, plan);
  paintBackline(iso, layout);
  paintWalls(iso, plan, "far");
  paintObstacles(iso, layout);
  paintWalls(iso, plan, "near");
  paintEnds(iso, layout);
  paintForeground(iso, layout);
  paintVignette(
    iso,
    { x: layout.cols / 2, y: layout.rows / 2 },
    (layout.cols + layout.rows) * ISO.gx.x * 0.5
  );
}
