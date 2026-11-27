import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RosterPanel } from "../../../src/ui/components/club/RosterPanel";
import { RosterName, type Team } from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { hirePlayer } from "../../../src/game/rules/teamPricing";
import { foundClub, squadIds } from "../../../src/game/rules/club";
import { fixtureValue } from "../../../src/testing/fixtureValue";

const roster = getRosterByRosterName(RosterName.DARK_ELF);
const ignore = (): undefined => undefined;

function sign(team: Team, positionName: string, count: number): void {
  const template = fixtureValue(
    roster.playerTemplates.find((candidate) => candidate.positionName === positionName)
  );
  for (let index = 0; index < count; index++) {
    const hired = hirePlayer(team, template);
    if (hired.amount == null) throw new Error(hired.reason);
  }
}

function darkElfClub(): Team {
  const team = foundClub("Shadow Wake", RosterName.DARK_ELF);
  team.treasury = 2_000_000;
  sign(team, "Dark Elf Blitzer", 1);
  sign(team, "Witch Elf", 1);
  sign(team, "Dark Elf Lineman", 9);
  return team;
}

describe("a club's roster and squads", () => {
  let container: HTMLDivElement;
  let root: Root;
  let team: Team;

  const render = () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <RosterPanel
            team={team}
            onFirePlayer={ignore}
            onReorderPlayers={ignore}
            onSquadsChange={(next) => {
              team = next;
              render();
            }}
          />
        </MemoryRouter>
      );
    });
  };

  const button = (name: string) =>
    fixtureValue([...container.querySelectorAll("button")].find((each) => each.textContent === name));
  const box = (label: string) =>
    fixtureValue(container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`));

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("shows shirt 12 as an open extra slot from the start", () => {
    team = darkElfClub();
    render();

    const slot = container.querySelector('[data-testid="roster-row-12"]');
    expect(slot?.textContent).toContain("Extra player");
    expect(container.textContent).toContain("11 / 12 players");
  });

  it("lets the coach put the extra player into one squad without touching the others", () => {
    team = darkElfClub();
    sign(team, "Assassin", 1);
    const extra = fixtureValue(team.players.find((player) => player.number === 12));
    const benched = fixtureValue(team.players.find((player) => player.number === 11));
    render();
    act(() => {
      button("Squads").click();
    });

    expect(box(`${extra.playerName} plays Street Bowl`).checked).toBe(false);
    act(() => {
      box(`${extra.playerName} plays Street Bowl`).click();
    });
    act(() => {
      box(`${benched.playerName} plays Street Bowl`).click();
    });

    expect(squadIds(team, "street-bowl")).toContain(extra.id);
    expect(squadIds(team, "street-bowl")).not.toContain(benched.id);
    expect(squadIds(team, "sevens")).not.toContain(extra.id);
    expect(squadIds(team, "beach-bowl")).toContain(benched.id);

    act(() => {
      button("Use Sevens").click();
    });
    expect(squadIds(team, "street-bowl")).toEqual(squadIds(team, "sevens"));
  });
});
