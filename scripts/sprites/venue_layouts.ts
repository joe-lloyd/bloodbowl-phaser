import {
  PITCH_LAYOUTS,
  type PitchLayout,
  type Square,
  VENUES,
  isInsideLayout,
  twoTeamFrames,
} from "../../src/game/variants/pitchLayouts";
import {
  type Frame,
  type Span,
  blockOf,
  noMansLand,
  squareAt,
} from "../../src/game/rules/frames";
import {
  ARENA_SEATS,
  arenaDugoutStrips,
  arenaDugouts,
  dugoutGateX,
  venueDugouts,
} from "../../src/game/presentation/venueSidelines";

type Edge = readonly [number, number, number, number];

const scrimmageX = (frame: Frame) => squareAt(frame, frame.arm.scrimmage, 0).x;

function blenderGeometry(frames: readonly [Frame, Frame]) {
  const [ahead, behind] = frames;
  const land = noMansLand(ahead);
  const columns = land && blockOf(ahead, land, { min: 0, max: 0 });
  return {
    lineOfScrimmage: { team1: scrimmageX(ahead), team2: scrimmageX(behind) },
    noMansLand: columns && { min: columns.min.x, max: columns.max.x },
    wideZoneRows: { top: ahead.arm.wide[0], bottom: ahead.arm.wide[1] },
  };
}

const rendered = VENUES.filter(
  (venue) => venue !== "stadium" && venue !== "deathbowl"
);

const venues = rendered.map((venue) => {
  const { frames, ...layout } = PITCH_LAYOUTS[venue];
  const dugouts = venueDugouts(PITCH_LAYOUTS[venue]);
  const gates = layout.walledSidelines
    ? { home: dugoutGateX(dugouts.home), away: dugoutGateX(dugouts.away) }
    : {};
  const pair = twoTeamFrames({ ...layout, frames });
  return { ...layout, ...blenderGeometry(pair), dugouts, gates };
});

const numbers = ({ min, max }: Span) =>
  Array.from({ length: max - min + 1 }, (_, k) => min + k);

function edgeBetween(a: Square, b: Square): Edge {
  if (a.x === b.x) {
    const y = Math.max(a.y, b.y);
    return [a.x, y, a.x + 1, y];
  }
  const x = Math.max(a.x, b.x);
  return [x, a.y, x, a.y + 1];
}

function frameLines(frame: Frame): Edge[] {
  const { arm } = frame;
  const cut = (along: number, across: number, next: Square) =>
    edgeBetween(squareAt(frame, along, across), next);
  const wide = (along: number) => [
    cut(along, arm.wide[0].max, squareAt(frame, along, arm.wide[0].max + 1)),
    cut(along, arm.wide[1].min, squareAt(frame, along, arm.wide[1].min - 1)),
  ];
  return [
    ...numbers({ min: 0, max: arm.width - 1 }).map((across) =>
      cut(0, across, squareAt(frame, 1, across))
    ),
    ...numbers(arm.setupAcross).map((across) =>
      cut(arm.scrimmage, across, squareAt(frame, arm.scrimmage + 1, across))
    ),
    ...numbers({ min: 0, max: arm.scrimmage }).flatMap((along) => wide(along)),
  ];
}

function pitchSquares(layout: PitchLayout): Square[] {
  return numbers({ min: 0, max: layout.rows - 1 }).flatMap((y) =>
    numbers({ min: 0, max: layout.cols - 1 })
      .map((x) => ({ x, y }))
      .filter((square) => isInsideLayout(layout, square))
  );
}

function outline(layout: PitchLayout): Edge[] {
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  return pitchSquares(layout).flatMap((square) =>
    steps
      .map(([dx, dy]) => ({ x: square.x + dx, y: square.y + dy }))
      .filter((next) => !isInsideLayout(layout, next))
      .map((next) => edgeBetween(square, next))
  );
}

function unique(edges: readonly Edge[]): Edge[] {
  const byKey = new Map(edges.map((edge) => [edge.join(","), edge]));
  return [...byKey.values()];
}

function arena(layout: PitchLayout) {
  const { frames, ...rest } = layout;
  const endZones = Object.fromEntries(
    ARENA_SEATS.map((seat, index) => {
      const frame = frames[index];
      const squares = frame
        ? numbers({ min: 0, max: frame.arm.width - 1 }).map((across) =>
            squareAt(frame, 0, across)
          )
        : [];
      return [seat, squares.map(({ x, y }) => [x, y])];
    })
  );
  return {
    ...rest,
    squares: pitchSquares(layout).map(({ x, y }) => [x, y]),
    endZones,
    lines: unique([
      ...outline(layout),
      ...frames.flatMap((frame) => frameLines(frame)),
    ]),
    dugouts: arenaDugouts(layout),
    strips: arenaDugoutStrips(layout),
  };
}

process.stdout.write(
  `${JSON.stringify([...venues, arena(PITCH_LAYOUTS.deathbowl)], null, 1)}\n`
);
