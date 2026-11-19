import { fixtureValue } from "../../src/testing/fixtureValue";
import { type Page } from "@playwright/test";
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

  const pageScrolls = (document.scrollingElement?.scrollHeight ?? 0) > vh + 4;

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
        detail: `${label(el)} ${String(Math.round(r.width))}x${String(Math.round(r.height))}`,
      });
    }

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
      if (fixtureValue(a).contains(fixtureValue(b)) || fixtureValue(b).contains(fixtureValue(a))) continue;
      const ra = fixtureValue(a).getBoundingClientRect();
      const rb = fixtureValue(b).getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w <= 8 || h <= 8) continue;
      const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
      if ((w * h) / smaller > 0.15) {
        findings.push({
          kind: "panels-overlap",
          detail: `${label(fixtureValue(a))} / ${label(fixtureValue(b))}`,
        });
      }
    }
  }

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
        const pt = bridge.squareToCanvas(fixtureValue(p.position).x, fixtureValue(p.position).y);
        if (!pt) return true;
        const x = box.left + pt.x;
        const y = box.top + pt.y;
        if (x < 0 || y < 0 || x > vw || y > vh) return true;

        const top = document.elementFromPoint(x, y);
        return top !== null && top !== canvas;
      });

      const dialogUp = onPitch.some((p) => {
        const pt = bridge.squareToCanvas(fixtureValue(p.position).x, fixtureValue(p.position).y);
        return pt
          ? insideModal(
              document.elementFromPoint(box.left + pt.x, box.top + pt.y)
            )
          : false;
      });
      if (!dialogUp && onPitch.length && hidden.length * 2 >= onPitch.length) {
        findings.push({
          kind: "players-offscreen",
          detail: `${String(hidden.length)}/${String(onPitch.length)} of the acting team out of view`,
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
        const shotName = `ux-${f.kind}-${String(seen.size)}`;
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

    summary(): Record<string, number> {
      return Object.fromEntries(counts);
    },
  };
}
