export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}
