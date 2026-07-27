import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchOptionsMenu } from "../../src/ui/components/hud/MatchOptionsMenu";
import { MatchOptionsMenuEntry } from "../../src/ui/components/hud/computeMatchOptionsMenu";

/**
 * Behavioral coverage for the accessible menu shell itself (disclosure,
 * focus management, keyboard operation, the destructive confirm step).
 * computeMatchOptionsMenu.test.ts covers which entries appear in which
 * context; this file covers what the menu does with whatever entries it's
 * given.
 */
describe("MatchOptionsMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const trigger = () =>
    container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;

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
      menu()!.dispatchEvent(
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
    // The disabled connection-status row is first in the list but not
    // focusable — focus should start on "Save & Exit" instead.
    expect(document.activeElement).toBe(items[1]);

    await act(async () => {
      menu()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    // Only one enabled item exists, so ArrowDown wraps back to itself.
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
      container
        .querySelector<HTMLButtonElement>('[role="menuitem"]')!
        .click();
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
    const disabledButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent?.includes("Skrag is connected"))!;
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
    const abandonButton = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes("Abandon Match"))!;

    await act(async () => {
      abandonButton.click();
    });

    // Confirm step replaces the list; nothing fired yet.
    expect(onSelect).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain("Abandon this match?");

    // Focus defaults to the SAFE option, guarding against an accidental
    // Enter/Space committing the destructive action.
    const cancelButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Keep Playing")!;
    expect(document.activeElement).toBe(cancelButton);

    await act(async () => {
      cancelButton.click();
    });
    expect(onSelect).not.toHaveBeenCalled();
    // Cancelling returns to the plain menu list, still open.
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
    const abandonButton = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes("Abandon Match"))!;
    await act(async () => {
      abandonButton.click();
    });
    const confirmButton = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Abandon Match")!;

    await act(async () => {
      confirmButton.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("abandon-match");
    expect(menu()).toBeNull();
  });

  it("clicking outside the menu closes it without selecting anything", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(<MatchOptionsMenu entries={PLAIN} onSelect={onSelect} />);
    });
    await act(async () => {
      trigger().click();
    });
    expect(menu()).not.toBeNull();

    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });

    expect(menu()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
