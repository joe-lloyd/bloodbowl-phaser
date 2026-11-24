import { type RefObject, useEffect, useState } from "react";

export function useNearScreen(target: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNear(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: "300px" }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [target]);
  return near;
}
