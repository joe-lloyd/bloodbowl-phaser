export const PHONE_QUERY =
  "(pointer: coarse) and (max-height: 599px), (pointer: coarse) and (max-width: 599px)";

export function matchesMedia(query: string): boolean {
  return typeof matchMedia === "function" && matchMedia(query).matches;
}
