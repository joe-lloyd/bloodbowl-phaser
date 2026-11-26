import { readFileSync, statSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseLayeredModels, type LayeredModel } from "../../../src/boundary/layeredArt";
import manifest from "../../../src/game/presentation/spriteManifest.json";
import { PlayerPortrait } from "../../../src/ui/components/common/PlayerPortrait";

const PORTRAIT_BUDGET = 150_000;
const LAYERED = parseLayeredModels(manifest);
const positions: Record<string, Record<string, string>> = manifest.positions;

function portraitBytes(model: string, body: string, layer: string): number {
  const base = `public/sprites/bloodbowl/${model}/layered/${body}/portrait/${layer}`;
  return statSync(`${base}.bin`).size + statSync(`${base}.json`).size;
}

function heaviestLook(model: string, art: LayeredModel, body: string): number {
  const layers = art.layered.bodies[body] ?? [];
  const optionBytes = art.layered.options.slice(1).map(([name, , values]) =>
    Math.max(0, ...values.map(([value]) => {
      const layer = `${name}.${value}`;
      if (!layers.includes(layer)) return 0;
      const shade = layers.includes(`${layer}~shade`) ? portraitBytes(model, body, `${layer}~shade`) : 0;
      return portraitBytes(model, body, layer) + shade;
    }))
  );
  return optionBytes.reduce((sum, bytes) => sum + bytes, portraitBytes(model, body, "base"));
}

function layeredPosition(): { roster: string; position: string } {
  for (const [roster, byPosition] of Object.entries(positions)) {
    for (const [position, model] of Object.entries(byPosition)) {
      if ((LAYERED.get(model)?.layered.options.length ?? 0) > 1) return { roster, position };
    }
  }
  throw new Error("no layered position with look options");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portrait download size", () => {
  it("keeps every model's heaviest portrait look under the budget", () => {
    const over = [...LAYERED].flatMap(([model, art]) =>
      Object.keys(art.layered.bodies)
        .map((body) => ({ look: `${model}/${body}`, bytes: heaviestLook(model, art, body) }))
        .filter(({ bytes }) => bytes > PORTRAIT_BUDGET)
        .map(({ look, bytes }) => `${look}: ${String(Math.round(bytes / 1000))} KB`)
    );
    const why = `A portrait may download at most ${String(PORTRAIT_BUDGET / 1000)} KB. Rerun portrait_layers.py, or render the model smaller`;
    expect(over, why).toEqual([]);
  });

  it("draws a team page portrait from the idle-only portrait files", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      requested.push(url);
      return Promise.resolve(new Response(readFileSync(`public${url}`)));
    });
    const { roster, position } = layeredPosition();
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<PlayerPortrait rosterName={roster} positionName={position} colors={{ primary: 0x8b1a1a, secondary: 0xe8e0c8 }} />);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(requested.length).toBeGreaterThan(0);
    });
    act(() => {
      root.unmount();
    });
    const bytes = requested.reduce((sum, url) => sum + statSync(`public${url}`).size, 0);
    expect(requested.filter((url) => !url.includes("/portrait/"))).toEqual([]);
    expect(bytes).toBeLessThan(PORTRAIT_BUDGET);
  });
});
