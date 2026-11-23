import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { setupMatch } from "../../src/gallery/fixtures";
import { VARIANTS } from "../../src/gallery/variants";
import { PAGE_VARIANTS } from "../../src/gallery/pageVariants";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { rollLabel } from "../../src/game/rules/rollTargets";
import {
  foulPreview,
  interceptPreviewLine,
} from "../../src/game/rules/rollPreview";
import { stepPromptLine } from "../../src/ui/components/hud/otherCoachText";
import { getSkill, SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";
import { runMatch } from "../../src/simulation/runMatch";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { heuristicCoach } from "../../src/simulation/coaches/heuristic";
import { RosterName } from "../../src/types/Team";

const ODDS = /%|\bchances?\b|\bodds\b|\bprobab/i;

function readableText(root: HTMLElement): string[] {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof HTMLStyleElement) return;

    if (node instanceof HTMLElement && node.title === "Dice Log text size")
      return;
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      out.push(node.textContent.trim());
    if (node instanceof HTMLElement) {
      for (const attr of ["aria-label", "title", "alt", "placeholder"]) {
        const value = node.getAttribute(attr);
        if (value) out.push(value);
      }
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return out;
}

const pages = new Set(PAGE_VARIANTS.map((v) => v.id));
const hudVariants = VARIANTS.filter((v) => !pages.has(v.id));

describe("no odds on a coach's screen", () => {
  it.each(hudVariants.map((v) => [v.id, v] as const))(
    "gallery variant %s shows targets only",
    async (_id, variant) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      variant.prepare?.();
      const fx = setupMatch(variant.fixture);
      let cleanup: void | (() => void) | undefined;
      try {
        await act(async () => {
          root.render(<>{variant.view(fx)}</>);
        });
        await act(async () => {
          cleanup = variant.drive?.(fx);
        });

        for (let step = 0; step < 10; step++)
          await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
        expect(
          readableText(document.body).filter((text) => ODDS.test(text))
        ).toEqual([]);
      } finally {
        if (typeof cleanup === "function") cleanup();
        await act(async () => {
          root.unmount();
        });
        document.body.innerHTML = "";
        ServiceContainer.reset();
      }
    }
  );

  it("labels every roll with its target alone", () => {
    expect(rollLabel("Dodge", 3)).toBe("Dodge: 3+");
    expect(rollLabel("Armour", 8)).toBe("Armour: 8+");
    for (let target = 2; target <= 12; target++)
      expect(rollLabel("Roll", target)).not.toMatch(ODDS);
  });

  it("names the other coach's rolls without odds", () => {
    expect(
      stepPromptLine("Orc Founders", {
        playerId: "p",
        rolls: [
          { type: "rush", target: 2 },
          { type: "dodge", target: 3 },
        ],
      })
    ).toBe("Orc Founders: Rush 2+, then Dodge 3+");
  });

  it("gives a Lone Fouler's foul and an interceptor their targets only", () => {
    const fx = setupMatch({ scenario: "block-injury-test" });
    const fouler = fx.player(1, 0);
    const target = fx.player(2, 0);
    fouler.skills = [...fouler.skills, getSkill(SkillType.LONE_FOULER)];
    fouler.gridPosition = { x: 10, y: 5 };
    target.gridPosition = { x: 11, y: 5 };
    target.status = PlayerStatus.PRONE;
    const foul = foulPreview(
      fouler,
      target,
      [fouler, target],
      fx.services.gameService.getState()
    );
    expect(foul.lines.join("\n")).not.toMatch(ODDS);
    expect(foul.lines).toContain("Lone Fouler may re-roll the armour roll");
    expect(
      interceptPreviewLine(target, [fouler], fx.services.gameService.getState())
        .line
    ).not.toMatch(ODDS);
    ServiceContainer.reset();
  });

  it("explains the computer coach's moves with roll targets only", async () => {
    const recording = await runMatch({
      seed: 3,
      rosters: [RosterName.HUMAN, RosterName.SKAVEN],
      coaches: [plannerCoach, heuristicCoach],
    });
    const notes = recording.steps.flatMap((step) =>
      step.note ? [step.note] : []
    );
    expect(notes.length).toBeGreaterThan(50);
    expect(
      notes.filter((note) => ODDS.test(note) || /\d\.\d/.test(note))
    ).toEqual([]);

    expect(
      notes.filter((note) => /\d/.test(note.replace(/\b[2-6]\+/g, "")))
    ).toEqual([]);
  }, 60_000);
});
