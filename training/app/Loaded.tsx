import type { ReactNode } from "react";
import { Notice } from "../../src/ui/components/componentWarehouse/HudPage";
import type { Load } from "./useLoad";

export function Loaded<Value>({
  state,
  children,
}: {
  state: Load<Value>;
  children: (value: Value) => ReactNode;
}) {
  switch (state.kind) {
    case "loading":
      return <p className="text-hud-dim">Loading…</p>;
    case "failed":
      return (
        <Notice tone="bad" title="Could not load" role="alert">
          {state.message}
        </Notice>
      );
    case "ready":
      return children(state.value);
  }
}
