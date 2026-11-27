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

  it("sets a game type for every round and changes one round at a time", () => {
    act(() => {
      root.render(<Harness club={foundClub("Altdorf Anvils", RosterName.HUMAN)} seen={seen} />);
    });

    click(button("Set order"));
    const rounds = [...container.querySelectorAll('[role="radiogroup"][aria-label$="game type"]')];
    expect(rounds.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Round 1 game type", "Round 2 game type", "Round 3 game type", "Round 4 game type",
      "Round 5 game type", "Round 6 game type", "Round 7 game type",
    ]);
    expect(latest()).toEqual({
      kind: "order",
      gameTypes: ["sevens", "street-bowl", "beach-bowl", "sevens", "street-bowl", "beach-bowl", "sevens"],
    });

    click(button("Gutter Bowl", fixtureValue(rounds[1])));
    expect(latest()).toEqual({
      kind: "order",
      gameTypes: ["sevens", "street-bowl", "beach-bowl", "sevens", "street-bowl", "beach-bowl", "sevens"],
    });
    expect(button("Gutter Bowl", fixtureValue(rounds[1])).disabled).toBe(true);
    expect(container.textContent).toContain("Gutter Bowl opens when team value plus treasury reaches 750k");

    click(button("Beach Bowl", fixtureValue(rounds[1])));
    expect(latest()).toEqual({
      kind: "order",
      gameTypes: ["sevens", "beach-bowl", "beach-bowl", "sevens", "street-bowl", "beach-bowl", "sevens"],
    });
  });

  it("draws from the picked game types and warns when fewer than two are left", () => {
    act(() => {
      root.render(<Harness club={foundClub("Altdorf Anvils", RosterName.HUMAN)} seen={seen} />);
    });

    click(button("Random each round"));
    expect(latest()).toEqual({ kind: "random", gameTypes: ["sevens", "street-bowl", "beach-bowl"] });

    click(button("Sevens"));
    click(button("Street Bowl"));
    expect(latest()).toEqual({ kind: "random", gameTypes: ["beach-bowl"] });
    expect(container.textContent).toContain("A random season needs at least two game types to draw from.");
  });
});
