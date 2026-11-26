import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AvailableHires } from "../../../src/ui/components/TeamBuilder/AvailableHires";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { RosterName, createTeam } from "../../../src/types/Team";
import {
  hirePlayer,
  positionAllowance,
} from "../../../src/game/rules/teamPricing";
import { SkillType, SKILL_DEFINITIONS } from "../../../src/types/Skills";

describe("AvailableHires skill tooltips", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("renders each hire's skill as its own tooltip trigger with the skill's description", async () => {
    const roster = getRosterByRosterName(RosterName.AMAZON);

    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].description;

    await act(async () => {
      root.render(
        <AvailableHires
          roster={roster}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });

    expect(container.textContent).toContain("Dodge");

    const tooltipPanels = Array.from(
      document.querySelectorAll('[role="tooltip"]')
    );
    expect(tooltipPanels.length).toBeGreaterThan(0);

    const dodgeTooltip = tooltipPanels.find(
      (panel) => panel.textContent === dodgeText
    );
    expect(dodgeTooltip).toBeTruthy();
  });

  it("gives a template with multiple skills one independent tooltip per skill", async () => {
    const roster = getRosterByRosterName(RosterName.AMAZON);

    await act(async () => {
      root.render(
        <AvailableHires
          roster={roster}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });

    const defensiveText = SKILL_DEFINITIONS[SkillType.DEFENSIVE].description;
    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].description;

    const tooltipPanels = Array.from(
      document.querySelectorAll('[role="tooltip"]')
    ).map((panel) => panel.textContent);

    expect(tooltipPanels).toContain(defensiveText);
    expect(tooltipPanels).toContain(dodgeText);

    expect(
      tooltipPanels.includes(`${defensiveText} ${dodgeText}`)
    ).toBe(false);
  });

  it("makes each hire's skill tooltip reachable and revealed by keyboard focus, not just mouse hover", async () => {
    const roster = getRosterByRosterName(RosterName.AMAZON);

    await act(async () => {
      root.render(
        <AvailableHires
          roster={roster}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });

    const triggers = Array.from(
      container.querySelectorAll('span[tabindex="0"]')
    );
    expect(triggers.length).toBeGreaterThan(0);

    const [firstTrigger] = triggers;
    const describedBy = fixtureValue(firstTrigger).getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const panel = document.getElementById(fixtureValue(describedBy));
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("role")).toBe("tooltip");

    act(() => {
      (firstTrigger as HTMLElement).focus();
    });
    expect(document.activeElement).toBe(firstTrigger);

    expect(panel?.className).toContain("block");
    expect(panel?.className).not.toContain("hidden");
    act(() => {
      (firstTrigger as HTMLElement).blur();
    });
    expect(panel?.className).toContain("hidden");
  });

  it("keeps a focused skill's tooltip open when the pointer leaves", async () => {
    await act(async () => {
      root.render(
        <AvailableHires
          roster={getRosterByRosterName(RosterName.AMAZON)}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });
    const trigger = fixtureValue(container.querySelector<HTMLElement>('span[tabindex="0"]'));
    const panel = fixtureValue(document.getElementById(
      fixtureValue(trigger.getAttribute("aria-describedby"))
    ));
    act(() => {
      trigger.focus();
    });
    expect(panel.className).not.toContain("hidden");
    act(() => {
      trigger.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        })
      );
    });
    expect(panel.className).not.toContain("hidden");
  });

  it("shows one tooltip at a time: hovering another skill hides the focused one", async () => {
    await act(async () => {
      root.render(
        <AvailableHires
          roster={getRosterByRosterName(RosterName.AMAZON)}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });
    const [first, second] = Array.from(
      container.querySelectorAll<HTMLElement>('span[tabindex="0"]')
    );
    const panelOf = (trigger: HTMLElement) =>
      fixtureValue(document.getElementById(fixtureValue(trigger.getAttribute("aria-describedby"))));
    act(() => {
      fixtureValue(first).focus();
    });
    act(() => {
      fixtureValue(second).dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: document.body,
        })
      );
    });
    expect(panelOf(fixtureValue(second)).className).not.toContain("hidden");
    expect(panelOf(fixtureValue(first)).className).toContain("hidden");
  });

  it("shows how many of each position the team has and may have", async () => {
    const team = createTeam(
      "Orcs",
      RosterName.ORC,
      { primary: 0, secondary: 0 },
      0,
      2_000_000
    );
    const roster = getRosterByRosterName(RosterName.ORC);
    hirePlayer(team, fixtureValue(roster.playerTemplates[1]));
    await act(async () => {
      root.render(
        <AvailableHires
          roster={roster}
          treasury={team.treasury}
          onHirePlayer={() => {}}
          allowance={(template) => positionAllowance(team, template)}
        />
      );
    });
    const rows = Array.from(container.querySelectorAll("tbody tr")).map(
      (row) => [
        fixtureValue(row.querySelector("td")).textContent,
        fixtureValue(row.querySelector('[data-testid="hire-allowance"]')).textContent,
      ]
    );

    expect(rows).toEqual([
      ["Orc Lineman", "0 / 11"],
      ["Goblin Lineman", "1 / 4"],
      ["Orc Thrower", "0 / 2"],
      ["Orc Blitzer", "0 / 2"],
      ["Big Un Blocker", "0 / 2"],
      ["Untrained Troll", "0 / 1"],
    ]);
  });
});
