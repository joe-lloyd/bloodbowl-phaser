import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AvailableHires } from "../../../src/ui/components/TeamBuilder/AvailableHires";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { RosterName } from "../../../src/types/Team";
import { SkillType, SKILL_DEFINITIONS } from "../../../src/types/Skills";

/**
 * team-builder-rule-tooltips: "Hovering an available hire's skill shows its
 * rule text" — each skill listed for a hireable player template is its own
 * hoverable element carrying that skill's full rulebook text, rather than a
 * single joined string with a redundant repeated title.
 */
describe("AvailableHires skill tooltips", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders each hire's skill as its own tooltip trigger with the skill's rule text", async () => {
    const roster = getRosterByRosterName(RosterName.AMAZON);
    // Eagle Warrior is the Amazon Lineman, carrying Dodge (RosterTemplates.ts).
    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].text;

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
      container.querySelectorAll('[role="tooltip"]')
    );
    expect(tooltipPanels.length).toBeGreaterThan(0);

    const dodgeTooltip = tooltipPanels.find(
      (panel) => panel.textContent === dodgeText
    );
    expect(dodgeTooltip).toBeTruthy();
  });

  it("gives a template with multiple skills one independent tooltip per skill", async () => {
    const roster = getRosterByRosterName(RosterName.AMAZON);
    // Jaguar Warrior carries Defensive + Dodge (RosterTemplates.ts).

    await act(async () => {
      root.render(
        <AvailableHires
          roster={roster}
          treasury={1_000_000}
          onHirePlayer={() => {}}
        />
      );
    });

    const defensiveText = SKILL_DEFINITIONS[SkillType.DEFENSIVE].text;
    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].text;

    const tooltipPanels = Array.from(
      container.querySelectorAll('[role="tooltip"]')
    ).map((panel) => panel.textContent);

    expect(tooltipPanels).toContain(defensiveText);
    expect(tooltipPanels).toContain(dodgeText);
    // Independent tooltips, not one combined blob repeating both texts.
    expect(tooltipPanels.some((t) => t === `${defensiveText} ${dodgeText}`)).toBe(
      false
    );
  });

  /**
   * team-builder-rule-tooltips: "Tabbing to a skill reveals its rule text"
   * — the tooltip is keyboard-reachable, not mouse-only.
   */
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
    const describedBy = firstTrigger.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const panel = container.querySelector(`#${describedBy}`);
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("role")).toBe("tooltip");
    expect(panel?.className).toContain("group-focus:opacity-100");
    expect(panel?.className).toContain("group-focus-within:opacity-100");

    act(() => {
      (firstTrigger as HTMLElement).focus();
    });
    expect(document.activeElement).toBe(firstTrigger);
  });
});
