import { useEffect, useState } from "react";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";

/** An online match is running and this coach may not act right now. */
function isHeldOnline(): boolean {
  return getActiveOnlineMatch()?.mayAct() === false;
}

/**
 * Online, true while this coach cannot send a command: the other coach
 * dropped, this coach is offline, the clock is paused, or the other coach
 * holds the turn or the decision. Polled like the waiting banner, as the
 * hold comes from outside the event bus.
 */
export function useHeldOnline(): boolean {
  const [held, setHeld] = useState(isHeldOnline);
  useEffect(() => {
    const id = setInterval(() => setHeld(isHeldOnline()), 400);
    return () => clearInterval(id);
  }, []);
  return held;
}
