import { fixtureValue } from "../../src/testing/fixtureValue";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MatchOptionsMenu } from "../../src/ui/components/hud/MatchOptionsMenu";
import { computeMatchOptionsMenu } from "../../src/ui/components/hud/computeMatchOptionsMenu";

const baselinePath = (file: string) =>
  resolve(process.cwd(), "__tests__", "unit", "screenshots", file);

const normalize = (html: string) => html.replaceAll('\r\n', "\n").trim();

describe("MatchOptionsMenu fixed-viewport baseline", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");

    container.style.width = "1280px";
    container.style.height = "720px";
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const compare = (name: string, html: string) => {
    const actual = normalize(html);
    const path = baselinePath(name);

    if (process.env["UPDATE_VISUAL_BASELINES"] === "1" || !existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${actual}\n`, "utf8");
    }

    const expected = normalize(readFileSync(path, "utf8"));
    expect(actual).toBe(expected);
  };

  it("matches the collapsed trigger (local, active match)", async () => {
    const entries = computeMatchOptionsMenu({
      kind: "local",
      matchOver: false,
    });
    await act(async () => {
      root.render(<MatchOptionsMenu entries={entries} onSelect={() => {}} />);
    });
    compare("match-options-menu-collapsed.html", container.innerHTML);
  });

  it("matches the expanded menu (local, active match)", async () => {
    const entries = computeMatchOptionsMenu({
      kind: "local",
      matchOver: false,
    });
    await act(async () => {
      root.render(<MatchOptionsMenu entries={entries} onSelect={() => {}} />);
    });
    await act(async () => {
      fixtureValue(container.querySelector<HTMLButtonElement>("button")).click();
    });
    compare("match-options-menu-expanded-local.html", container.innerHTML);
  });

  it("matches the expanded menu (online guest, opponent abandonable) with its confirm step open", async () => {
    const entries = computeMatchOptionsMenu({
      kind: "online",
      role: "guest",
      opponentName: "Skrag",
      connection: "abandonable",
      endRequest: "none",
    });
    await act(async () => {
      root.render(<MatchOptionsMenu entries={entries} onSelect={() => {}} />);
    });
    await act(async () => {
      fixtureValue(container.querySelector<HTMLButtonElement>("button")).click();
    });
    compare(
      "match-options-menu-expanded-online-guest.html",
      container.innerHTML
    );

    const forceAbandon = fixtureValue([
      ...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ].find((b) => b.textContent?.includes("End Match (Opponent Left)")));
    await act(async () => {
      forceAbandon.click();
    });
    compare(
      "match-options-menu-confirm-online-guest.html",
      container.innerHTML
    );
  });
});
