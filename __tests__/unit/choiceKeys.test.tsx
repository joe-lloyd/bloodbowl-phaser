import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  type BuilderMode,
  BuilderModeSwitch,
} from "../../src/ui/components/competition/BuilderModeSwitch";

describe("the Who plays choice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = (mode: BuilderMode, onChange: (mode: BuilderMode) => void) => {
    act(() => {
      root.render(<BuilderModeSwitch type="league" mode={mode} onChange={onChange} />);
    });
  };

  it("moves the choice and the focus with the arrow keys, and keeps one tab stop", () => {
    const onChange = vi.fn();
    show("local", onChange);
    const [local, online] = container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect([local?.tabIndex, online?.tabIndex]).toEqual([0, -1]);

    act(() => {
      fixtureValue(local).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("online");
    expect(document.activeElement).toBe(online);

    act(() => {
      fixtureValue(online).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith("local");
  });
});
