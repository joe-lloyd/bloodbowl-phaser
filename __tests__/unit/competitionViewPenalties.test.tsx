/**
 * Reporting a knockout game left level by hand: the page asks for the
 * Penalty Shoot-out, and its winner goes through the bracket.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
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
import { CompetitionEntrant, TournamentDoc } from "../../src/competition/types";
import { CompetitionView } from "../../src/ui/components/pages/CompetitionView";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("reporting a knockout game left level", () => {
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
  });

  it("asks for the Penalty Shoot-out and sends its winner through", async () => {
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
    const field = (label: string) =>
      container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

    await act(async () => typeInto(field("Reavers score")!, "1"));
    expect(field("Reavers penalties")).toBeNull();
    await act(async () => typeInto(field("Badgers score")!, "1"));
    await act(async () => typeInto(field("Reavers penalties")!, "2"));
    await act(async () => typeInto(field("Badgers penalties")!, "3"));
    const record = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Record result"
    )!;
    await act(async () => record.click());

    expect(container.textContent).toContain("Penalties 2–3");
    const stored = await getCompetition("tournament", "cup");
    expect(stored?.championEntrantId).toBe("local:Badgers");
  });
});
