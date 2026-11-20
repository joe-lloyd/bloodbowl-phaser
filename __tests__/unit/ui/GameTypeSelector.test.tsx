import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameTypeSelector } from "../../../src/ui/components/common/GameTypeSelector";

describe("GameTypeSelector", () => {
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

  const cards = () => [
    ...container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ];
  const card = (name: string) => {
    const found = cards().find((button) => button.textContent.startsWith(name));
    if (!found) throw new Error(`No ${name} card.`);
    return found;
  };

  it("shows a card per game type with its pitch and size", () => {
    act(() => {
      root.render(<GameTypeSelector value="street-bowl" onChange={vi.fn()} />);
    });

    expect(cards().map((button) => button.textContent)).toEqual([
      "Sevens20 × 11 stadium pitch",
      "Gutter Bowl26 × 15 street or sewer, chosen or rolled",
      "Street Bowl26 × 7 street between two walls",
      "Beach Bowl20 × 9 sand, no casualties",
    ]);
    expect(card("Street Bowl").getAttribute("aria-checked")).toBe("true");
    expect(
      [...card("Gutter Bowl").querySelectorAll("img")].map((img) =>
        img.getAttribute("src")
      )
    ).toEqual([
      "/venues/gutter-street/card.webp",
      "/venues/gutter-sewer/card.webp",
    ]);
    expect(card("Sevens").querySelector("img")?.getAttribute("src")).toBe(
      "/stadium/bloodbowl/card.webp"
    );
  });

  it("picks a game type when its card is clicked", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<GameTypeSelector value="sevens" onChange={onChange} />);
    });

    act(() => {
      card("Beach Bowl").click();
    });

    expect(onChange).toHaveBeenCalledWith("beach-bowl");
  });

  it("moves focus with the arrow keys, wrapping at the ends, and picks only on a press", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<GameTypeSelector value="beach-bowl" onChange={onChange} />);
    });
    const press = (name: string, key: string) => {
      act(() => {
        card(name).dispatchEvent(
          new KeyboardEvent("keydown", { key, bubbles: true })
        );
      });
    };

    expect(cards().map((button) => button.tabIndex)).toEqual([-1, -1, -1, 0]);
    press("Beach Bowl", "ArrowRight");
    expect(document.activeElement).toBe(card("Sevens"));
    press("Sevens", "ArrowRight");
    press("Gutter Bowl", "ArrowLeft");
    press("Sevens", "ArrowLeft");
    expect(document.activeElement).toBe(card("Beach Bowl"));
    expect(onChange).not.toHaveBeenCalled();

    press("Beach Bowl", "ArrowLeft");
    act(() => {
      card("Street Bowl").click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("street-bowl");
  });

  it("keeps one tab stop on the focused card, and returns it to the checked card when focus leaves", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    act(() => {
      root.render(<GameTypeSelector value="sevens" onChange={vi.fn()} />);
    });
    const stops = () => cards().map((button) => button.tabIndex);

    act(() => {
      card("Sevens").focus();
      card("Sevens").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(stops()).toEqual([-1, 0, -1, -1]);

    act(() => {
      card("Gutter Bowl").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: outside })
      );
    });
    expect(stops()).toEqual([0, -1, -1, -1]);
    outside.remove();
  });

  it("moves the tab stop to a card clicked after arrowing away from it", () => {
    act(() => {
      root.render(<GameTypeSelector value="sevens" onChange={vi.fn()} />);
    });

    act(() => {
      card("Sevens").focus();
      card("Sevens").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    act(() => {
      card("Sevens").focus();
    });

    expect(cards().map((button) => button.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  const pitches = () => [
    ...container.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Pitch"] [role="radio"]'
    ),
  ];

  it("lets the coaches choose the Gutter Bowl pitch or roll for it", () => {
    const onVenueChange = vi.fn();
    act(() => {
      root.render(
        <GameTypeSelector
          value="gutter-bowl"
          onChange={vi.fn()}
          venue="gutter-sewer"
          onVenueChange={onVenueChange}
        />
      );
    });

    expect(
      pitches().map((pitch) => [
        pitch.textContent,
        pitch.getAttribute("aria-checked"),
      ])
    ).toEqual([
      ["StreetMarket stalls count as walls", "false"],
      ["SewerA pushed player can fall into a pit", "true"],
      ["Roll a D61-3 Sewer, 4-6 Street", "false"],
    ]);

    act(() => {
      pitches()[0]?.click();
    });
    act(() => {
      pitches()[2]?.click();
    });

    expect(onVenueChange.mock.calls).toEqual([["gutter-street"], [undefined]]);
  });

  it("offers no pitch choice for a game type with one pitch", () => {
    act(() => {
      root.render(
        <GameTypeSelector
          value="sevens"
          onChange={vi.fn()}
          onVenueChange={vi.fn()}
        />
      );
    });

    expect(pitches()).toEqual([]);
  });

  it("leaves the choice alone while disabled", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <GameTypeSelector value="sevens" onChange={onChange} disabled />
      );
    });

    act(() => {
      card("Gutter Bowl").click();
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
