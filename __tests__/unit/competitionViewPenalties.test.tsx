import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeStandings,
  generateSingleElimination,
} from "../../src/competition/logic";
import {
  getCompetition,
  saveCompetition,
} from "../../src/competition/repository";
import {
  type CompetitionEntrant,
  type TournamentDoc,
} from "../../src/competition/types";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function typeInto(input: HTMLInputElement, value: string) {
  const setter = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )).set);
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("reporting a knockout game left level", () => {
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
  });

  const field = (label: string) =>
    container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

  const showCup = async () => {
    const entrants: CompetitionEntrant[] = ["Reavers", "Badgers"].map(
      (name, index) => ({
        id: `local:${name}`,
        teamId: name,
        ownerUid: null,
        name,
        rosterName: "Human",
        seed: index + 1,
      })
    );
    const fixtures = generateSingleElimination(entrants);
    const cup: TournamentDoc = {
      id: "cup",
      type: "tournament",
      format: "single-elimination",
      name: "Cup",
      organizerUid: null,
      participantUids: [],
      status: "active",
      entrants,
      fixtures,
      standings: computeStandings(entrants, fixtures),
      createdAt: 1,
      updatedAt: 1,
    };
    await saveCompetition(cup);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/tournaments/cup"]}>
          <Routes>
            <Route
              path="/tournaments/:id"
              element={<CompetitionView type="tournament" />}
            />
          </Routes>
        </MemoryRouter>
      );
    });
  };

  it("asks for the Penalty Shoot-out and sends its winner through", async () => {
    await showCup();

    await act(async () => {
      typeInto(fixtureValue(field("Reavers score")), "1");
    });
    expect(field("Reavers penalties")).toBeNull();
    await act(async () => {
      typeInto(fixtureValue(field("Badgers score")), "1");
    });
    await act(async () => {
      typeInto(fixtureValue(field("Reavers penalties")), "2");
    });
    await act(async () => {
      typeInto(fixtureValue(field("Badgers penalties")), "3");
    });
    const record = fixtureValue([...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Record result"
    ));
    await act(async () => {
      record.click();
    });

    expect(container.textContent).toContain("Penalties 2–3");
    const stored = await getCompetition("tournament", "cup");
    expect(stored).toMatchObject({ championEntrantId: "local:Badgers" });
  });

  it("treats 01 and 1 as the same score", async () => {
    await showCup();
    act(() => {
      typeInto(fixtureValue(field("Reavers score")), "01");
    });
    act(() => {
      typeInto(fixtureValue(field("Badgers score")), "1");
    });
    expect(field("Reavers penalties")).not.toBeNull();
  });

  it("says so when the competition does not exist", async () => {
    await act(async () => {
      await Promise.resolve();
      root.render(
        <MemoryRouter initialEntries={["/tournaments/missing"]}>
          <Routes>
            <Route path="/tournaments/:id" element={<CompetitionView type="tournament" />} />
          </Routes>
        </MemoryRouter>
      );
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "This competition does not exist, or it was deleted."
    );
  });
});
