import { useEffect, useState } from "react";
import { matchesMedia } from "../../game/presentation/phoneLayout";

/** Whether a CSS media query matches now, kept current as it changes. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesMedia(query));
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return matches;
}
