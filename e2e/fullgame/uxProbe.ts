/**
 * A user-experience probe for the full-match drive.
 *
 * At each step it looks at the screen the way a coach does and records what
 * gets in the way: controls that cover other controls, controls cut off by
 * the window edge, targets too small to hit, and the acting team's players
 * sitting off screen where they cannot be clicked. Each distinct problem is
 * logged once, with a screenshot the first time it appears, to
 * `${OUT}/ux.jsonl`.
 */
import { Page } from "@playwright/test";
import { appendFileSync } from "node:fs";

export interface UxFinding {
  kind:
    | "covered"
    | "offscreen"
    | "tiny"
    | "panels-overlap"
    | "players-offscreen";
  detail: string;
}

/** Runs in the page: everything a coach can see and click right now. */
function inspect(): UxFinding[] {
  const findings: UxFinding[] = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const label = (el: Element) => {
    const text = (el.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    const id = el.getAttribute("data-testid");
    return id
      ? `${id}${text ? ` "${text}"` : ""}`
      : `${el.tagName.toLowerCase()} "${text}"`;
  };
  const shown = (el: Element) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity) > 0.05 &&
      style.pointerEvents !== "none"
    );
  };

  // A page that scrolls can bring a control below the fold into view
  const pageScrolls = (document.scrollingElement?.scrollHeight ?? 0) > vh + 4;
  // An open dialog is meant to cover everything behind it
  const insideModal = (el: Element | null): boolean => {
    for (
      let node = el;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const style = getComputedStyle(node);
      if (style.position !== "fixed" && style.position !== "absolute") continue;
      const r = node.getBoundingClientRect();
      if (r.width * r.height >= vw * vh * 0.8) return true;
    }
    return false;
  };

  // Controls: buttons, selects, inputs, links
  const controls = [
    ...document.querySelectorAll(
      "button, [role=button], select, input:not([type=hidden]), a[href]"
    ),
  ].filter(shown);
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const belowFold = r.bottom > vh + 1 || r.top < -1;
    if (r.right > vw + 1 || r.left < -1 || (belowFold && !pageScrolls)) {
      findings.push({ kind: "offscreen", detail: label(el) });
      continue;
    }
    if (belowFold) continue;
    if (
      Math.min(r.width, r.height) < 24 &&
      !(el as HTMLButtonElement).disabled
    ) {
      findings.push({
        kind: "tiny",
        detail: `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      });
    }
    // Is the middle of the control actually reachable by a click?
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2
    );
    if (
      hit &&
      hit !== el &&
      !el.contains(hit) &&
      !hit.contains(el) &&
      !insideModal(hit)
    ) {
      findings.push({
        kind: "covered",
        detail: `${label(el)} under ${label(hit)}`,
      });
    }
  }

  // HUD panels: absolutely placed boxes with their own background
  const panels = [...document.querySelectorAll("#root *")].filter((el) => {
    if (!shown(el)) return false;
    const style = getComputedStyle(el);
    if (style.position !== "absolute" && style.position !== "fixed")
      return false;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 40 || r.width > vw * 0.9) return false;
    const bg = style.backgroundColor;
    return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
  });
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i];
      const b = panels[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w <= 8 || h <= 8) continue;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if ((w * h) / smaller > 0.15) {
        findings.push({
          kind: "panels-overlap",
          detail: `${label(a)} / ${label(b)}`,
        });
      }
    }
  }

  // The acting team's players: can the coach see them to click them?
  const bridge = (
    window as unknown as {
      __bbTestBridge?: {
        phase(): { phase: string; activeTeamId: string | null };
        snapshot(): {
          teams: {
            id: string;
            players: { position?: { x: number; y: number } | null }[];
          }[];
        };
        squareToCanvas(x: number, y: number): { x: number; y: number } | null;
      };
    }
  ).__bbTestBridge;
  const canvas = document.querySelector("#game-container canvas");
  if (bridge && canvas) {
    const { phase, activeTeamId } = bridge.phase();
    if (phase === "PLAY" && activeTeamId) {
      const box = canvas.getBoundingClientRect();
      const team = bridge.snapshot().teams.find((t) => t.id === activeTeamId);
      const onPitch = (team?.players ?? []).filter((p) => p.position);
      const hidden = onPitch.filter((p) => {
        const pt = bridge.squareToCanvas(p.position!.x, p.position!.y);
        if (!pt) return true;
        const x = box.left + pt.x;
        const y = box.top + pt.y;
        if (x < 0 || y < 0 || x > vw || y > vh) return true;
        // Under a HUD panel counts as hidden too
        const top = document.elementFromPoint(x, y);
        return top !== null && top !== canvas;
      });
      // A dialog covers the board on purpose while it is open
      const dialogUp = onPitch.some((p) => {
        const pt = bridge.squareToCanvas(p.position!.x, p.position!.y);
        return pt
          ? insideModal(
              document.elementFromPoint(box.left + pt.x, box.top + pt.y)
            )
          : false;
      });
      if (!dialogUp && onPitch.length && hidden.length * 2 >= onPitch.length) {
        findings.push({
          kind: "players-offscreen",
          detail: `${hidden.length}/${onPitch.length} of the acting team out of view`,
        });
      }
    }
  }
  return findings;
}

export function createUxProbe(page: Page, out: string, viewport: string) {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  return {
    async probe(step: string): Promise<void> {
      const findings = await page.evaluate(inspect).catch(() => []);
      for (const f of findings) {
        const key = `${f.kind}|${f.detail}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (seen.has(key)) continue;
        seen.add(key);
        const shotName = `ux-${f.kind}-${seen.size}`;
        await page
          .screenshot({ path: `${out}/${shotName}.png` })
          .catch(() => {});
        appendFileSync(
          `${out}/ux.jsonl`,
          JSON.stringify({ viewport, step, ...f, shot: `${shotName}.png` }) +
            "\n"
        );
      }
    },
    /** How many steps each problem was seen on. */
    summary(): Record<string, number> {
      return Object.fromEntries(counts);
    },
  };
}
