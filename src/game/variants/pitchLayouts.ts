import { type Frame, type Span, pairFrames } from "../rules/frames";

export const VENUES = [
  "stadium",
  "street",
  "beach",
  "gutter-street",
  "gutter-sewer",
] as const;

export type Venue = (typeof VENUES)[number];

export type Surface = "grass" | "cobbles" | "sand" | "sewer";

export type ObstacleKind = "market-stall" | "sewer-pit";

export interface Square {
  x: number;
  y: number;
}

export interface Obstacle extends Square {
  kind: ObstacleKind;
}

export interface Barricade {
  afterColumn: number;
  rows: Span;
}

export interface PitchLayout {
  venue: Venue;
  label: string;
  cols: number;
  rows: number;
  surface: Surface;
  frames: readonly [Frame, Frame];
  walledSidelines: boolean;
  obstacles: readonly Obstacle[];
  barricades: readonly Barricade[];
  trapdoors: readonly Square[];
}

function block(
  kind: ObstacleKind,
  columns: Span,
  rows: Span
): Obstacle[] {
  const squares: Obstacle[] = [];
  for (let x = columns.min; x <= columns.max; x++) {
    for (let y = rows.min; y <= rows.max; y++) squares.push({ x, y, kind });
  }
  return squares;
}

function gutterObstacles(kind: ObstacleKind): Obstacle[] {
  return [
    ...block(kind, { min: 4, max: 9 }, { min: 2, max: 5 }),
    ...block(kind, { min: 4, max: 9 }, { min: 9, max: 12 }),
    ...block(kind, { min: 16, max: 21 }, { min: 2, max: 5 }),
    ...block(kind, { min: 16, max: 21 }, { min: 9, max: 12 }),
  ];
}

const GUTTER_BARRICADES: readonly Barricade[] = [
  { afterColumn: 11, rows: { min: 0, max: 2 } },
  { afterColumn: 10, rows: { min: 6, max: 8 } },
  { afterColumn: 14, rows: { min: 6, max: 8 } },
  { afterColumn: 13, rows: { min: 12, max: 14 } },
];

const FULL_LENGTH = {
  cols: 26,
  trapdoors: [],
} as const;

const GUTTER = {
  ...FULL_LENGTH,
  rows: 15,
  frames: pairFrames({
    cols: 26,
    rows: 15,
    lines: [12, 13],
    centre: { min: 4, max: 10 },
    wide: [
      { min: 0, max: 3 },
      { min: 11, max: 14 },
    ],
  }),
  walledSidelines: true,
  barricades: GUTTER_BARRICADES,
} as const;

export const PITCH_LAYOUTS: Record<Venue, PitchLayout> = {
  stadium: {
    venue: "stadium",
    label: "Sevens stadium",
    cols: 20,
    rows: 11,
    surface: "grass",
    frames: pairFrames({
      cols: 20,
      rows: 11,
      lines: [6, 13],
      centre: { min: 2, max: 8 },
      wide: [
        { min: 0, max: 1 },
        { min: 9, max: 10 },
      ],
    }),
    walledSidelines: false,
    obstacles: [],
    barricades: [],
    trapdoors: [
      { x: 5, y: 1 },
      { x: 14, y: 9 },
    ],
  },
  street: {
    ...FULL_LENGTH,
    venue: "street",
    label: "Cobbled street",
    rows: 7,
    surface: "cobbles",
    frames: pairFrames({
      cols: 26,
      rows: 7,
      lines: [12, 13],
      centre: { min: 2, max: 4 },
      wide: [
        { min: 0, max: 1 },
        { min: 5, max: 6 },
      ],
    }),
    walledSidelines: true,
    obstacles: [],
    barricades: [],
  },
  beach: {
    venue: "beach",
    label: "Beach",
    cols: 20,
    rows: 9,
    surface: "sand",
    frames: pairFrames({
      cols: 20,
      rows: 9,
      lines: [6, 13],
      centre: { min: 2, max: 6 },
      wide: [
        { min: 0, max: 1 },
        { min: 7, max: 8 },
      ],
    }),
    walledSidelines: false,
    obstacles: [],
    barricades: [],
    trapdoors: [],
  },
  "gutter-street": {
    ...GUTTER,
    venue: "gutter-street",
    label: "Gutter Bowl street",
    surface: "cobbles",
    obstacles: gutterObstacles("market-stall"),
  },
  "gutter-sewer": {
    ...GUTTER,
    venue: "gutter-sewer",
    label: "Gutter Bowl sewer",
    surface: "sewer",
    obstacles: gutterObstacles("sewer-pit"),
  },
};

export function isVenue(value: unknown): value is Venue {
  return VENUES.some((venue) => venue === value);
}

export function obstacleAt(
  layout: PitchLayout,
  square: Square
): Obstacle | undefined {
  return layout.obstacles.find(
    (obstacle) => obstacle.x === square.x && obstacle.y === square.y
  );
}

export function isInsideLayout(layout: PitchLayout, square: Square): boolean {
  return (
    square.x >= 0 &&
    square.y >= 0 &&
    square.x < layout.cols &&
    square.y < layout.rows
  );
}

export function isPlayableSquare(layout: PitchLayout, square: Square): boolean {
  return isInsideLayout(layout, square) && !obstacleAt(layout, square);
}
