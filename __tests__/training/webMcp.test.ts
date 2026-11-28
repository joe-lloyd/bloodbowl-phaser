import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMcp } from "../../training/app/webMcp";

interface Registered {
  name: string;
  signal: AbortSignal;
  execute: (input: unknown) => Promise<unknown>;
}

function fakeContext() {
  const registered: Registered[] = [];
  return {
    registered,
    context: {
      registerTool: (
        tool: { name: string; execute: (input: unknown) => Promise<unknown> },
        { signal }: { signal: AbortSignal }
      ) => {
        registered.push({ name: tool.name, signal, execute: tool.execute });
        return Promise.resolve();
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the training page's WebMCP tools", () => {
  it("registers every tool on document.modelContext and removes them on cleanup", () => {
    const { registered, context } = fakeContext();

    const cleanup = registerWebMcp(context);

    expect(registered.map(({ name }) => name)).toEqual([
      "list_weights",
      "list_teams",
      "get_team",
      "list_candidates",
      "get_candidate",
      "save_candidate",
      "delete_candidate",
    ]);
    expect(registered.some(({ signal }) => signal.aborted)).toBe(false);
    cleanup();
    expect(registered.every(({ signal }) => signal.aborted)).toBe(true);
  });

  it("answers a tool call with the API's JSON value", async () => {
    const { registered, context } = fakeContext();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response('{"candidates":[]}')))
    );
    registerWebMcp(context);

    const listed = registered.find(({ name }) => name === "list_candidates");

    await expect(listed?.execute({})).resolves.toEqual({ candidates: [] });
  });

  it("does nothing when the browser has no model context", () => {
    vi.stubGlobal("document", {});

    const cleanup = registerWebMcp();

    expect(cleanup).not.toThrow();
  });
});
