import React, { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HudTabs } from "../../src/ui/components/componentWarehouse/HudKit";

type Id = "dice" | "chat";

function Switch() {
  const [value, setValue] = useState<Id>("dice");
  return (
    <>
      <HudTabs
        label="Dice log view"
        idBase="log"
        value={value}
        onChange={setValue}
        tabs={[
          { id: "dice", label: "Dice" },
          { id: "chat", label: "Chat" },
        ]}
      />
      <div role="tabpanel" id="log-panel" aria-labelledby={`log-tab-${value}`}>
        {value}
      </div>
    </>
  );
}

describe("HudTabs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Switch />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const tab = (name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (t) => t.textContent === name
    )!;
  const press = (key: string) =>
    act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    });

  it("ties each tab to the panel and keeps only the selected tab in the tab order", () => {
    expect(tab("Dice").getAttribute("aria-controls")).toBe("log-panel");
    expect(tab("Chat").getAttribute("aria-controls")).toBe("log-panel");
    expect(tab("Dice").tabIndex).toBe(0);
    expect(tab("Chat").tabIndex).toBe(-1);
    expect(
      container.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")
    ).toBe(tab("Dice").id);
  });

  it("moves and selects with the arrow keys, Home and End", async () => {
    tab("Dice").focus();
    await press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Chat");
    expect(tab("Chat").getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tabpanel"]')!.textContent).toBe("chat");
    await press("ArrowRight");
    expect(document.activeElement?.textContent).toBe("Dice");
    await press("End");
    expect(document.activeElement?.textContent).toBe("Chat");
    await press("Home");
    expect(document.activeElement?.textContent).toBe("Dice");
    await press("ArrowLeft");
    expect(document.activeElement?.textContent).toBe("Chat");
  });
});
