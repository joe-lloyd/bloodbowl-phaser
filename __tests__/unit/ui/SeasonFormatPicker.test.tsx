import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SeasonFormatPicker } from "../../../src/ui/components/club/SeasonFormatPicker";
import { foundClub } from "../../../src/game/rules/club";
import { RosterName, type SeasonFormat, type Team } from "../../../src/types/Team";
import { fixtureValue } from "../../../src/testing/fixtureValue";

function Harness({ club, seen }: { club: Team; seen: SeasonFormat[] }) {
  const [format, setFormat] = useState<SeasonFormat>({ kind: "single", gameType: "sevens" });
  return (
    <SeasonFormatPicker
      club={club}
      value={format}
      onChange={(next) => {
        seen.push(next);
        setFormat(next);
      }}
    />
  );
}

const click = (target: HTMLElement) => {
  act(() => {
    target.click();
  });
};

describe("SeasonFormatPicker", () => {
  let container: HTMLDivElement;
  let root: Root;
  const seen: SeasonFormat[] = [];
  const latest = () => seen.at(-1);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    seen.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const button = (name: string, scope: ParentNode = container) => {
    const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name
    );
    if (!found) throw new Error(`No ${name} button.`);
    return found;
  };

  it("builds a set order from only the game types the coach ticks", () => {
    act(() => {
      root.render(<Harness club={foundClub("Altdorf Anvils", RosterName.HUMAN)} seen={seen} />);
    });

    expect(button("Gutter Bowl").disabled).toBe(true);
    expect(container.textContent).toContain("Gutter Bowl opens when team value plus treasury reaches 750k");
    click(button("Beach Bowl"));
    expect(latest()).toEqual({ kind: "random", gameTypes: ["sevens", "beach-bowl"] });

    click(button("Set order"));
    expect(latest()).toEqual({
      kind: "order",
      gameTypes: ["sevens", "beach-bowl", "sevens", "beach-bowl", "sevens", "beach-bowl", "sevens"],
    });
    const rounds = [...container.querySelectorAll('[role="radiogroup"][aria-label$="game type"]')];
    expect(rounds).toHaveLength(7);
    expect(
      [...fixtureValue(rounds[0]).querySelectorAll("button")].map((each) => each.getAttribute("aria-label"))
    ).toEqual(["Sevens", "Beach Bowl"]);

    click(button("Sevens", fixtureValue(rounds[2])));
    click(button("Beach Bowl", fixtureValue(rounds[2])));
    expect(latest()).toEqual({
      kind: "order",
      gameTypes: ["sevens", "beach-bowl", "beach-bowl", "beach-bowl", "sevens", "beach-bowl", "sevens"],
    });
  });

  it("plays one game type when only one is ticked and never unticks the last", () => {
    act(() => {
      root.render(<Harness club={foundClub("Altdorf Anvils", RosterName.HUMAN)} seen={seen} />);
    });

    expect(container.querySelector('[aria-label="How the game types mix"]')).toBeNull();
    expect(button("Sevens").disabled).toBe(true);
    click(button("Street Bowl"));
    click(button("Sevens"));
    expect(latest()).toEqual({ kind: "single", gameType: "street-bowl" });
    expect(container.querySelector('[aria-label="How the game types mix"]')).toBeNull();
  });
});
