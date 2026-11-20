import { PITCH_LAYOUTS, VENUES } from "../../src/game/variants/pitchLayouts";
import {
  dugoutGateX,
  venueDugouts,
} from "../../src/game/presentation/venueSidelines";

const venues = VENUES.filter((venue) => venue !== "stadium").map((venue) => {
  const layout = PITCH_LAYOUTS[venue];
  const dugouts = venueDugouts(layout);
  const gates = layout.walledSidelines
    ? { home: dugoutGateX(dugouts.home), away: dugoutGateX(dugouts.away) }
    : {};
  return { ...layout, dugouts, gates };
});

process.stdout.write(`${JSON.stringify(venues, null, 1)}\n`);
