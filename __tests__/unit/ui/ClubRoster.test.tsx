import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamRoster } from "../../../src/ui/components/TeamBuilder/TeamRoster";
import { clubSheetHandlers } from "../../../src/ui/components/club/clubSheet";
import { RosterName, type Team } from "../../../src/types/Team";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { hirePlayer } from "../../../src/game/rules/teamPricing";
import { foundClub, gutterSitsOut } from "../../../src/game/rules/club";

const roster = getRosterByRosterName(RosterName.DARK_ELF);
const ignore = (): undefined => undefined;

function sign(team: Team, positionName: string, count: number): void {
  const template = roster.playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) throw new Error(`No ${positionName} on the roster.`);
  for (let index = 0; index < count; index++) {
    const hired = hirePlayer(team, template);
    if (hired.amount == null) throw new Error(hired.reason);
  }
}

function darkElfClub(linemen: number): Team {
  const team = foundClub("Shadow Wake", RosterName.DARK_ELF);
  team.treasury = 2_000_000;
  sign(team, "Dark Elf Blitzer", 1);
  sign(team, "Witch Elf", 1);
  sign(team, "Dark Elf Lineman", linemen);
  return team;
}

describe("a club's team sheet", () => {
  let container: HTMLDivElement;
  let root: Root;
  let team: Team;

  const render = () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={ignore}
            onReorderPlayers={ignore}
            {...clubSheetHandlers(team, (next) => {
              team = next;
              render();
            })}
          />
        </MemoryRouter>
      );
    });
  };

  const slot = () => container.querySelector('[data-testid="gutter-slot"]');
  const hireAssassin = () =>
    [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent === "Hire Assassin · 90k")
      ?.click();

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

  it("shows the Gutter Bowl slot as shirt 12 with the road to unlocking it", () => {
    team = darkElfClub(5);
    team.treasury = 0;
    render();

    expect(slot()?.querySelector("td")?.textContent).toBe("12");
    expect(slot()?.textContent).toContain("Gutter Bowl specialist");
    expect(
      slot()?.querySelector('[aria-label="Progress to Gutter Bowl"]')
    ).not.toBeNull();
    expect(slot()?.querySelectorAll("button")).toHaveLength(0);
  });

  it("hires a positional into shirt 12 once Gutter Bowl is open", () => {
    team = darkElfClub(5);
    render();

    const labels = [...(slot()?.querySelectorAll("button") ?? [])].map(
      (hire) => hire.textContent
    );
    expect(labels).not.toContain("Hire Dark Elf Lineman · 65k");
    expect(labels).toContain("Hire Assassin · 90k");

    const treasury = team.treasury;
    act(() => {
      hireAssassin();
    });

    expect(slot()).toBeNull();
    const specialist = team.players.find((player) => player.number === 12);
    expect(specialist?.positionName).toBe("Assassin");
    expect(team.treasury).toBe(treasury - 90_000);
    expect(container.textContent).toContain("Gutter Bowl only");
    expect(container.textContent).toContain("7 / 11 players");
  });

  it("lets the coach pick which Lineman sits out when the squad is full", () => {
    team = darkElfClub(9);
    render();
    act(() => {
      hireAssassin();
    });

    const lastLineman = team.players.find((player) => player.number === 11);
    expect(gutterSitsOut(team)?.id).toBe(lastLineman?.id);
    expect(
      container.querySelector('[data-testid="roster-row-11"]')?.textContent
    ).toContain("Sits out Gutter Bowl");

    const choice = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Lineman who sits out Gutter Bowl"]'
    );
    expect(choice?.options).toHaveLength(9);
    const third = team.players.find((player) => player.number === 3);
    act(() => {
      if (!choice || !third) return;
      choice.value = third.id;
      choice.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(gutterSitsOut(team)?.id).toBe(third?.id);
    expect(
      container.querySelector('[data-testid="roster-row-3"]')?.textContent
    ).toContain("Sits out Gutter Bowl");
    expect(
      container.querySelector('[data-testid="roster-row-11"]')?.textContent
    ).not.toContain("Sits out Gutter Bowl");
  });
});
