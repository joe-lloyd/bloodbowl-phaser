/**
 * True when the coach has asked the OS for less motion. The match then cuts
 * the camera instead of gliding it and holds players on their first idle
 * frame; runs, falls and flights still play, since they carry information.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
