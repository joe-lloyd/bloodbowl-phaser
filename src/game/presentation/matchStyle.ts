import type { Venue } from "../variants/pitchLayouts";

export const MATCH_STYLE = {
  stadiumPath: "/stadium/bloodbowl",

  venuePath: "/venues",

  spritePath: "/sprites/bloodbowl",

  background: 0x0b0805,
} as const;

export function venueArtPath(venue: Venue): string {
  return venue === "stadium"
    ? MATCH_STYLE.stadiumPath
    : `${MATCH_STYLE.venuePath}/${venue}`;
}
