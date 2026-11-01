/**
 * A phone: a touch screen whose short side is under 600 CSS px. The match
 * swaps its corner panels for thumb rails there, and asks for landscape.
 */
export const PHONE_QUERY =
  "(pointer: coarse) and (max-height: 599px), (pointer: coarse) and (max-width: 599px)";

/** Any touch screen, phone or tablet: the camera keeps squares thumb-sized. */
export const TOUCH_QUERY = "(pointer: coarse)";

export const PORTRAIT_QUERY = "(orientation: portrait)";

export function matchesMedia(query: string): boolean {
  return typeof matchMedia === "function" && matchMedia(query).matches;
}
