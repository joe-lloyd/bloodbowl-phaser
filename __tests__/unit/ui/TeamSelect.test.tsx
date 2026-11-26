import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamSelect } from "../../../src/ui/components/pages/TeamSelect";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { RosterName } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

function typeInto(input: HTMLInputElement, value: string) {
  const nativeSetter = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )).set);
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TeamSelect filtering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
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

    expect(container.textContent).toContain("Green Bay Orcs");
    expect(container.textContent).toContain("River Vale Humans");

    const filter1 = fixtureValue(container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter Player 1 teams"]'
    ));
    const filter2 = fixtureValue(container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter Player 2 teams"]'
    ));
    expect(filter1).toBeTruthy();
    expect(filter2).toBeTruthy();

    await act(async () => {
      typeInto(filter1, "orc");
    });

    const player1Column = fixtureValue(filter1.closest('[data-testid^="team-column-"]'));
    const player2Column = fixtureValue(filter2.closest('[data-testid^="team-column-"]'));
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

  it("matches on roster name alone, even when the query isn't in the team name", async () => {
    const dwarfs = new TeamTestBuilder()
      .withId("team-dwarfs")
      .withName("Thunderfoot Warband")
      .withRosterName(RosterName.DWARF)
      .withPlayers(11)
      .build();
    const humans = new TeamTestBuilder()
      .withId("team-humans-2")
      .withName("River Vale Humans")
      .withRosterName(RosterName.HUMAN)
      .withPlayers(11)
      .build();
    saveTeams([dwarfs, humans]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamSelect mode="play" />
        </MemoryRouter>
      );
    });

    const filter1 = fixtureValue(container.querySelector<HTMLInputElement>(
      'input[aria-label="Filter Player 1 teams"]'
    ));

    await act(async () => {
      typeInto(filter1, "dwarf");
    });

    const player1Column = fixtureValue(filter1.closest('[data-testid^="team-column-"]'));
    expect(player1Column.textContent).toContain("Thunderfoot Warband");
    expect(player1Column.textContent).not.toContain("River Vale Humans");
  });
});

describe("TeamSelect match look", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it("has no match style picker: every match is played in the Blood Bowl stadium", async () => {
    saveTeams([
      new TeamTestBuilder()
        .withId("team-orcs")
        .withName("Green Bay Orcs")
        .withRosterName(RosterName.ORC)
        .withPlayers(11)
        .build(),
      new TeamTestBuilder()
        .withId("team-humans")
        .withName("River Vale Humans")
        .withRosterName(RosterName.HUMAN)
        .withPlayers(11)
        .build(),
    ]);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamSelect mode="play" />
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Green Bay Orcs");
    expect(container.querySelector('[aria-label="Match style"]')).toBeNull();
    expect(container.textContent).not.toContain("Choose the pitch");
    expect(container.textContent).not.toMatch(/neon/i);
  });
});
