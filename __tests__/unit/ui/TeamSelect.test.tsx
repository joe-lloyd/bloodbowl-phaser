import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamSelect } from "../../../src/ui/components/pages/TeamSelect";
import { saveTeams } from "../../../src/game/managers/TeamManager";
import { RosterName, type Team } from "../../../src/types/Team";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";
import {
  createComputerTeamFromTemplate,
  getComputerTeamTemplates,
} from "../../../src/competition/computerTeamTemplates";

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

function buttonIn(scope: Element, text: string): HTMLButtonElement {
  return fixtureValue(
    [...scope.querySelectorAll("button")].find((button) =>
      button.textContent.includes(text)
    )
  );
}

function libraryTeam(templateIndex: number, id: string, name: string): Team {
  const template = fixtureValue(getComputerTeamTemplates()[templateIndex]);
  const team = { ...createComputerTeamFromTemplate(template.id), id, name };
  delete team.computerCoached;
  delete team.computerTemplateId;
  return team;
}

describe("TeamSelect random opponent", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    localStorage.clear();
    await saveTeams([
      libraryTeam(0, "team-a", "Library Team A"),
      libraryTeam(1, "team-b", "Library Team B"),
    ]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <TeamSelect mode="play" />
        </MemoryRouter>
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  const column = (player: 1 | 2) =>
    fixtureValue(
      container.querySelector(`[data-testid="team-column-${String(player)}"]`)
    );

  const pickedOpponents = () =>
    [...column(2).querySelectorAll('button[aria-pressed="true"]')].map(
      (button) => button.textContent
    );

  it("picks an opponent other than Player 1's team and enables Start", () => {
    act(() => {
      buttonIn(column(1), "Library Team A").click();
    });
    const random = buttonIn(column(2), "Random");

    act(() => {
      random.click();
    });

    expect(pickedOpponents()).toEqual([expect.stringContaining("Library Team B")]);
    expect(buttonIn(container, "Start Game").disabled).toBe(false);
    expect(random.disabled).toBe(true);
  });

  it("picks a computer team when Player 2 is the computer", () => {
    act(() => {
      buttonIn(container, "Versus computer").click();
    });

    act(() => {
      buttonIn(column(2), "Random").click();
    });

    expect(pickedOpponents()).toHaveLength(1);
    expect(column(2).textContent).not.toContain("Library Team");
  });
});

function MatchStart() {
  return <p data-testid="match-start">{JSON.stringify(useLocation().state)}</p>;
}

describe("TeamSelect counted friendly", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    localStorage.clear();
    await saveTeams([libraryTeam(0, "team-a", "Library Team A")]);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/select-team"]}>
          <Routes>
            <Route path="/select-team" element={<TeamSelect mode="play" />} />
            <Route path="/play/computer" element={<MatchStart />} />
          </Routes>
        </MemoryRouter>
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it("offers the toggle against the computer and carries it into the match", () => {
    const column = (player: 1 | 2) =>
      fixtureValue(
        container.querySelector(`[data-testid="team-column-${String(player)}"]`)
      );
    act(() => {
      buttonIn(container, "Versus computer").click();
    });
    act(() => {
      buttonIn(column(1), "Library Team A").click();
      buttonIn(column(2), "Random").click();
    });
    const toggle = fixtureValue(
      [...container.querySelectorAll("label")].find((label) =>
        label.textContent.includes("Count this game")
      )
    );
    act(() => {
      fixtureValue(toggle.querySelector("input")).click();
    });
    act(() => {
      buttonIn(container, "Start Game").click();
    });

    expect(
      container.querySelector('[data-testid="match-start"]')?.textContent
    ).toContain('"progressionEnabled":true');
  });
});
