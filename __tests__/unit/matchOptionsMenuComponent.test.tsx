import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchOptionsMenu } from "../../src/ui/components/hud/MatchOptionsMenu";
import { type MatchOptionsMenuEntry } from "../../src/ui/components/hud/computeMatchOptionsMenu";

describe("MatchOptionsMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const trigger = () =>
    fixtureValue(container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]'));

  const menu = () => container.querySelector('[role="menu"]');

  const PLAIN: MatchOptionsMenuEntry[] = [
    { id: "return-to-menu", label: "Return to Main Menu" },
  ];

  const WITH_DESTRUCTIVE: MatchOptionsMenuEntry[] = [
    { id: "return-to-menu", label: "Return to Main Menu" },
    {
      id: "abandon-match",
      label: "Abandon Match",
      destructive: true,
      confirm: {
        title: "Abandon this match?",
        message: "This cannot be undone.",
        confirmLabel: "Abandon Match",
        cancelLabel: "Keep Playing",
      },
    },
  ];

  const WITH_DISABLED: MatchOptionsMenuEntry[] = [
    { id: "connection-status", label: "Skrag is connected", disabled: true },
    { id: "save-and-exit", label: "Save & Exit" },
  ];

  const WITH_PANEL: MatchOptionsMenuEntry[] = [
    { id: "return-to-menu", label: "Return to Main Menu" },
    {
      type: "panel",
      id: "test-panel",
      render: () => (
        <label>
          <input type="checkbox" aria-label="Test panel control" />
          Test panel control
        </label>
      ),
    },
  ];

  it("is collapsed by default and opens on trigger click, focusing the first item", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<MatchOptionsMenu entries={PLAIN} onSelect={onSelect} />);
    });

    expect(menu()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      trigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(menu()).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const items = container.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(1);
    expect(document.activeElement).toBe(items[0]);
  });

  it("Escape closes the menu and returns focus to the trigger", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<MatchOptionsMenu entries={PLAIN} onSelect={onSelect} />);
    });
    await act(async () => {
      trigger().click();
    });
    expect(menu()).not.toBeNull();

    await act(async () => {
      fixtureValue(menu()).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("ArrowDown/ArrowUp cycle focus between enabled menu items only", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <MatchOptionsMenu entries={WITH_DISABLED} onSelect={onSelect} />
      );
    });
    await act(async () => {
      trigger().click();
    });

    const items = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ];

    expect(document.activeElement).toBe(items[1]);

    await act(async () => {
      fixtureValue(menu()).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });

    expect(document.activeElement).toBe(items[1]);
  });

  it("selecting a plain entry fires onSelect once and closes the menu", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<MatchOptionsMenu entries={PLAIN} onSelect={onSelect} />);
    });
    await act(async () => {
      trigger().click();
    });
    await act(async () => {
      fixtureValue(container.querySelector<HTMLButtonElement>('[role="menuitem"]')).click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("return-to-menu");
    expect(menu()).toBeNull();
  });

  it("a disabled entry never fires onSelect", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <MatchOptionsMenu entries={WITH_DISABLED} onSelect={onSelect} />
      );
    });
    await act(async () => {
      trigger().click();
    });
    const disabledButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Skrag is connected")));
    expect(disabledButton.disabled).toBe(true);

    await act(async () => {
      disabledButton.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a destructive entry shows a confirm step before firing onSelect, and Cancel backs out safely", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <MatchOptionsMenu entries={WITH_DESTRUCTIVE} onSelect={onSelect} />
      );
    });
    await act(async () => {
      trigger().click();
    });
    const abandonButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes("Abandon Match")));

    await act(async () => {
      abandonButton.click();
    });

    expect(onSelect).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(fixtureValue(dialog).textContent).toContain("Abandon this match?");

    const cancelButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Keep Playing"));
    expect(document.activeElement).toBe(cancelButton);

    await act(async () => {
      cancelButton.click();
    });
    expect(onSelect).not.toHaveBeenCalled();

    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(menu()).not.toBeNull();
  });

  it("confirming a destructive entry fires onSelect with its id and closes the menu", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <MatchOptionsMenu entries={WITH_DESTRUCTIVE} onSelect={onSelect} />
      );
    });
    await act(async () => {
      trigger().click();
    });
    const abandonButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes("Abandon Match")));
    await act(async () => {
      abandonButton.click();
    });
    const confirmButton = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match"));

    await act(async () => {
      confirmButton.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("abandon-match");
    expect(menu()).toBeNull();
  });

  it("pressing outside the menu, with a mouse or a finger, closes it without selecting anything", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<MatchOptionsMenu entries={PLAIN} onSelect={onSelect} />);
    });
    await act(async () => {
      trigger().click();
    });
    expect(menu()).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(menu()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  describe("panel entries", () => {
    it("renders a panel entry's control inside the open menu, without menuitem semantics", async () => {
      const onSelect = vi.fn();
      await act(async () => {
        root.render(
          <MatchOptionsMenu entries={WITH_PANEL} onSelect={onSelect} />
        );
      });
      await act(async () => {
        trigger().click();
      });

      const control = container.querySelector<HTMLInputElement>(
        'input[aria-label="Test panel control"]'
      );
      expect(control).not.toBeNull();

      expect(fixtureValue(control).closest('[role="menuitem"]')).toBeNull();

      await act(async () => {
        fixtureValue(control).click();
      });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("ArrowDown navigation reaches the panel entry's control, not just past it", async () => {
      const onSelect = vi.fn();
      await act(async () => {
        root.render(
          <MatchOptionsMenu entries={WITH_PANEL} onSelect={onSelect} />
        );
      });
      await act(async () => {
        trigger().click();
      });

      const actionItem =
        fixtureValue(container.querySelector<HTMLButtonElement>('[role="menuitem"]'));
      expect(document.activeElement).toBe(actionItem);

      await act(async () => {
        fixtureValue(menu()).dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        );
      });

      const control = container.querySelector<HTMLInputElement>(
        'input[aria-label="Test panel control"]'
      );
      expect(document.activeElement).toBe(control);
    });

    it("Tab does not leak focus out of the open menu (focus trap)", async () => {
      const onSelect = vi.fn();
      await act(async () => {
        root.render(
          <MatchOptionsMenu entries={WITH_PANEL} onSelect={onSelect} />
        );
      });
      await act(async () => {
        trigger().click();
      });

      const control = fixtureValue(container.querySelector<HTMLInputElement>(
        'input[aria-label="Test panel control"]'
      ));

      control.focus();
      expect(document.activeElement).toBe(control);

      await act(async () => {
        fixtureValue(menu()).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        );
      });

      const actionItem =
        container.querySelector<HTMLButtonElement>('[role="menuitem"]');
      expect(document.activeElement).toBe(actionItem);
      expect(menu()).not.toBeNull();
    });

    it("Shift+Tab from the first item wraps to the panel's control instead of leaving the menu", async () => {
      const onSelect = vi.fn();
      await act(async () => {
        root.render(
          <MatchOptionsMenu entries={WITH_PANEL} onSelect={onSelect} />
        );
      });
      await act(async () => {
        trigger().click();
      });

      const actionItem =
        fixtureValue(container.querySelector<HTMLButtonElement>('[role="menuitem"]'));
      expect(document.activeElement).toBe(actionItem);

      await act(async () => {
        fixtureValue(menu()).dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            shiftKey: true,
            bubbles: true,
          })
        );
      });

      const control = container.querySelector<HTMLInputElement>(
        'input[aria-label="Test panel control"]'
      );
      expect(document.activeElement).toBe(control);
    });
  });
});
