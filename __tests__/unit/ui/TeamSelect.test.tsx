import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamSelect } from "../../../src/ui/components/pages/TeamSelect";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { RosterName } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * React tracks a controlled input's previous value on the DOM node itself;
 * setting `.value` directly and dispatching a plain Event leaves that
 * tracker out of sync, so the resulting onChange never fires. Using the
 * native value setter (bypassing React's patched one) before dispatching
 * mirrors what @testing-library/react's fireEvent does under the hood.
 */
function typeInto(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * team-management-layout: "Filtering narrows the list" and "A large team
 * library remains navigable" — each of TeamSelect's two mirrored columns
 * gets its own live text filter over team name / roster name, independent
 * of the other column's filter.
 */
describe("TeamSelect filtering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  it("narrows each column independently by team name or roster name", async () => {
    const orcs = new TeamTestBuilder()
      .withId("team-orcs")
      .withName("Green Bay Orcs")
      .withRosterName(RosterName.ORC)
      .withPlayers(11)
      .build();
    const humans = new TeamTestBuilder()
      .withId("team-humans")
      .withName("River Vale Humans")
      .withRosterName(RosterName.HUMAN)
      .withPlayers(11)
      .build();
    saveTeams([orcs, humans]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamSelect mode="play" />
        </MemoryRouter>
      );
    });

    // Both teams initially visible in both columns.
    expect(container.textContent).toContain("Green Bay Orcs");
    expect(container.textContent).toContain("River Vale Humans");

    const filter1 = container.querySelector(
      'input[aria-label="Filter Player 1 teams"]'
    ) as HTMLInputElement;
    const filter2 = container.querySelector(
      'input[aria-label="Filter Player 2 teams"]'
    ) as HTMLInputElement;
    expect(filter1).toBeTruthy();
    expect(filter2).toBeTruthy();

    await act(async () => {
      typeInto(filter1, "orc");
    });

    // Player 1's column now only shows the Orc team; Player 2's is untouched.
    const player1Column = filter1.closest(
      "div.bg-bb-warm-paper"
    ) as HTMLElement;
    const player2Column = filter2.closest(
      "div.bg-bb-warm-paper"
    ) as HTMLElement;
    expect(player1Column).toBeTruthy();
    expect(player2Column).toBeTruthy();
    expect(player1Column).not.toBe(player2Column);

    expect(player1Column.textContent).toContain("Green Bay Orcs");
    expect(player1Column.textContent).not.toContain("River Vale Humans");
    expect(player2Column.textContent).toContain("Green Bay Orcs");
    expect(player2Column.textContent).toContain("River Vale Humans");

    await act(async () => {
      typeInto(filter2, "human");
    });

    expect(player2Column.textContent).toContain("River Vale Humans");
    expect(player2Column.textContent).not.toContain("Green Bay Orcs");
  });
});
