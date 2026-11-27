import {
  PITCH_LAYOUTS,
  VENUES,
  twoTeamFrames,
} from "../../src/game/variants/pitchLayouts";
import {
  type Frame,
  blockOf,
  noMansLand,
  squareAt,
} from "../../src/game/rules/frames";
import {
  dugoutGateX,
  venueDugouts,
} from "../../src/game/presentation/venueSidelines";

const scrimmageX = (frame: Frame) =>
  squareAt(frame, frame.arm.scrimmage, 0).x;

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

process.stdout.write(`${JSON.stringify(venues, null, 1)}\n`);
