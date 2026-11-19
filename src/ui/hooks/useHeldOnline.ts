import { useEffect, useState } from "react";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";

function isHeldOnline(): boolean {
  return getActiveOnlineMatch()?.mayAct() === false;
}

export function useHeldOnline(): boolean {
  const [held, setHeld] = useState(isHeldOnline);
  useEffect(() => {
    const id = setInterval(() => {
      setHeld(isHeldOnline());
    }, 400);
    return () => {
      clearInterval(id);
    };
  }, []);
  return held;
}
