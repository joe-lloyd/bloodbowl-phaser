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

export interface Span {
  min: number;
  max: number;
}

export interface PitchLayout {
  venue: Venue;
  label: string;
  cols: number;
  rows: number;
  surface: Surface;
  lineOfScrimmage: { team1: number; team2: number };
  noMansLand: Span | null;
  centreRows: Span;
  wideZoneRows: { top: Span; bottom: Span };
  walledSidelines: boolean;
  obstacles: readonly Obstacle[];
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
    ...block(kind, { min: 2, max: 7 }, { min: 0, max: 3 }),
    ...block(kind, { min: 6, max: 11 }, { min: 11, max: 14 }),
    ...block(kind, { min: 14, max: 19 }, { min: 0, max: 3 }),
    ...block(kind, { min: 18, max: 23 }, { min: 11, max: 14 }),
  ];
}

const FULL_LENGTH = {
  cols: 26,
  lineOfScrimmage: { team1: 12, team2: 13 },
  noMansLand: null,
  trapdoors: [],
} as const;

const GUTTER = {
  ...FULL_LENGTH,
  rows: 15,
  centreRows: { min: 4, max: 10 },
  wideZoneRows: { top: { min: 0, max: 3 }, bottom: { min: 11, max: 14 } },
  walledSidelines: true,
} as const;

export const PITCH_LAYOUTS: Record<Venue, PitchLayout> = {
  stadium: {
    venue: "stadium",
    label: "Sevens stadium",
    cols: 20,
    rows: 11,
    surface: "grass",
    lineOfScrimmage: { team1: 6, team2: 13 },
    noMansLand: { min: 7, max: 12 },
    centreRows: { min: 2, max: 8 },
    wideZoneRows: { top: { min: 0, max: 1 }, bottom: { min: 9, max: 10 } },
    walledSidelines: false,
    obstacles: [],
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
    centreRows: { min: 2, max: 4 },
    wideZoneRows: { top: { min: 0, max: 1 }, bottom: { min: 5, max: 6 } },
    walledSidelines: true,
    obstacles: [],
  },
  beach: {
    venue: "beach",
    label: "Beach",
    cols: 20,
    rows: 9,
    surface: "sand",
    lineOfScrimmage: { team1: 6, team2: 13 },
    noMansLand: { min: 7, max: 12 },
    centreRows: { min: 2, max: 6 },
    wideZoneRows: { top: { min: 0, max: 1 }, bottom: { min: 7, max: 8 } },
    walledSidelines: false,
    obstacles: [],
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
