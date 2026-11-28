import { useCallback, useEffect, useState } from "react";
import { errorText } from "../../src/ui/errorText";

export type Load<Value> =
  | { kind: "loading" }
  | { kind: "ready"; value: Value }
  | { kind: "failed"; message: string };

export function useLoad<Value>(load: () => Promise<Value>) {
  const [state, setState] = useState<Load<Value>>({ kind: "loading" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (value) => {
        if (live) setState({ kind: "ready", value });
      },
      (error: unknown) => {
        if (live) setState({ kind: "failed", message: errorText(error) });
      }
    );
    return () => {
      live = false;
    };
  }, [load, round]);
  const reload = useCallback(() => {
    setRound((n) => n + 1);
  }, []);
  return { state, reload };
}
