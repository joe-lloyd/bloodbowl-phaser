import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "../../src/boundary/json";
import {
  DEFAULT_WEIGHTS,
  parseWeightFile,
} from "../../src/simulation/ai/weights";
import { candidateStore } from "../../training/server/candidates";
import { trainingHandler } from "../../training/server/handler";
import { toolHandlers } from "../../training/server/tools";

const SAVED_AT = "2026-11-28T12:00:00.000Z";

function server() {
  const dir = mkdtempSync(path.join(tmpdir(), "training-ground-"));
  const store = candidateStore({ dir, now: () => new Date(SAVED_AT) });
  const handle = trainingHandler({ handlers: toolHandlers(store), root: dir });
  const call = async (
    tool: string,
    body: unknown,
    headers: Record<string, string> = {}
  ) => {
    const response = await handle(
      new Request(`http://training.test/api/tools/${tool}`, {
        method: "POST",
        headers: { host: "training.test", ...headers },
        body: JSON.stringify(body),
      })
    );
    return {
      status: response.status,
      body: parseJson(await response.text(), z.unknown()),
    };
  };
  return { dir, handle, call };
}

const BRAVER = {
  name: "Braver Halflings",
  note: "Hit harder and dodge more.",
  layers: {
    weights: { casualtyHit: 60 },
    rosters: { Halfling: { safeMove: 0.7 } },
    gameTypes: {},
  },
};

describe("training ground API", () => {
  it("refuses a name that would replace a differently named candidate", async () => {
    const { call } = server();
    const first = { ...BRAVER, name: "Halfling safe-move" };
    const saved = await call("save_candidate", first);
    expect(saved.status).toBe(200);

    const clash = await call("save_candidate", { ...BRAVER, name: "Halfling safe move" });

    expect(clash).toEqual({
      status: 400,
      body: {
        error:
          '"Halfling safe move" would replace the candidate "Halfling safe-move". Pick another name.',
      },
    });
    const again = await call("save_candidate", first);
    expect(again.status).toBe(200);
  });

  it("lists only the computer builds the game accepts for that game type", async () => {
    const { call } = server();
    const { body } = await call("get_team", { roster: "Snotling", matchType: "sevens" });
    const builds = z
      .object({ builds: z.array(z.object({ name: z.string() }).loose()) })
      .parse(body).builds.map(({ name }) => name);

    expect(builds).not.toContain("Snot What You Think");
    expect(builds.length).toBeGreaterThan(0);
  });

  it("shows a weight after the roster layer merges", async () => {
    const { call } = server();
    const { status, body } = await call("list_weights", { roster: "Halfling" });
    expect(status).toBe(200);
    const view = z
      .object({ planner: z.array(z.object({ name: z.string() }).loose()) })
      .parse(body);
    expect(view.planner.find((w) => w.name === "safeMove")).toEqual({
      name: "safeMove",
      label: "Safe move chance",
      group: "risk",
      description:
        "Lowest chance of making every dodge and rush that a support move needs. Lower lets players rush and dodge more to get into place.",
      defaultValue: 0.92,
      bounds: [0.2, 0.99],
      value: 0.82,
      setBy: "roster",
      overrides: [
        { layer: { kind: "roster", roster: "Halfling" }, value: 0.82 },
      ],
      plans: [],
    });
    expect(view.planner.find((w) => w.name === "flank")).toMatchObject({
      value: 0,
      setBy: "default",
      plans: [{ plan: "flank", value: 3 }],
    });
  });

  it("badges each of a roster's skills by how the coach uses it", async () => {
    const { call } = server();
    const { body } = await call("get_team", { roster: "Black Orc" });
    const team = z
      .object({
        positions: z.array(
          z
            .object({
              name: z.string(),
              skills: z.array(
                z.object({ name: z.string(), use: z.string() }).loose()
              ),
            })
            .loose()
        ),
      })
      .parse(body);
    const troll = team.positions.find((p) => p.name === "Trained Troll");
    expect(troll?.skills.map(({ name, use }) => `${name}: ${use}`)).toEqual([
      "Always Hungry: prices",
      "Mighty Blow: prices",
      "Projectile Vomit: ignores",
      "Really Stupid: chooses",
      "Regeneration: prices",
      "Throw Team-mate: chooses",
    ]);
  });

  it("saves a candidate the policy lab can read, lists it and deletes it", async () => {
    const { call, dir } = server();
    const saved = await call("save_candidate", BRAVER);
    expect(saved).toEqual({
      status: 200,
      body: {
        id: "braver-halflings",
        name: "Braver Halflings",
        note: "Hit harder and dodge more.",
        savedAt: SAVED_AT,
        changes: 2,
        layers: BRAVER.layers,
        diff: [
          {
            layer: { kind: "all" },
            weight: "casualtyHit",
            current: null,
            candidate: 60,
          },
          {
            layer: { kind: "roster", roster: "Halfling" },
            weight: "safeMove",
            current: 0.82,
            candidate: 0.7,
          },
        ],
      },
    });
    const file = parseWeightFile(
      parseJson(
        readFileSync(path.join(dir, "braver-halflings.json"), "utf8"),
        z.unknown()
      )
    );
    expect(file.weights).toEqual({ ...DEFAULT_WEIGHTS, casualtyHit: 60 });
    expect(file.rosters).toEqual({ Halfling: { safeMove: 0.7 } });

    const listed = await call("list_candidates", {});
    expect(listed.body).toEqual({
      candidates: [
        {
          id: "braver-halflings",
          name: "Braver Halflings",
          note: "Hit harder and dodge more.",
          savedAt: SAVED_AT,
          changes: 2,
        },
      ],
    });
    const deleted = await call("delete_candidate", { id: "braver-halflings" });
    expect(deleted.body).toEqual({ deleted: "braver-halflings" });
    const after = await call("list_candidates", {});
    expect(after.body).toEqual({ candidates: [] });
  });

  it("keeps the current roster layer when a save leaves it out", async () => {
    const { call } = server();
    const saved = await call("save_candidate", {
      name: "Harder hits",
      note: "",
      layers: { weights: { knockdown: 15 } },
    });
    expect(saved.body).toMatchObject({
      layers: {
        weights: { knockdown: 15 },
        rosters: { Halfling: { safeMove: 0.82 } },
        gameTypes: {},
      },
      diff: [
        {
          layer: { kind: "all" },
          weight: "knockdown",
          current: null,
          candidate: 15,
        },
      ],
    });
  });

  it("refuses a value outside its tuning bounds and writes nothing", async () => {
    const { call } = server();
    const refused = await call("save_candidate", {
      ...BRAVER,
      layers: { ...BRAVER.layers, weights: { casualtyHit: 1000 } },
    });
    expect(refused).toEqual({
      status: 400,
      body: { error: "Casualty (casualtyHit) must be between 10 and 160" },
    });
    const listed = await call("list_candidates", {});
    expect(listed.body).toEqual({ candidates: [] });
  });

  it("refuses a write sent from another site", async () => {
    const { call } = server();
    const refused = await call("save_candidate", BRAVER, {
      origin: "http://elsewhere.test",
    });
    expect(refused).toEqual({
      status: 403,
      body: { error: "Requests from other sites are refused" },
    });
  });
});

describe("training ground MCP endpoint", () => {
  it("lists the same tools and runs them", async () => {
    const { handle } = server();
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL("http://training.test/mcp"), {
        fetch: (url, init) => handle(new Request(url, init)),
      })
    );
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_weights",
      "list_teams",
      "get_team",
      "list_candidates",
      "get_candidate",
      "save_candidate",
      "delete_candidate",
    ]);
    const saved = await client.callTool({
      name: "save_candidate",
      arguments: BRAVER,
    });
    expect(saved.isError).toBe(false);
    const listed = await client.callTool({
      name: "list_candidates",
      arguments: {},
    });
    expect(listed.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          candidates: [
            {
              id: "braver-halflings",
              name: "Braver Halflings",
              note: "Hit harder and dodge more.",
              savedAt: SAVED_AT,
              changes: 2,
            },
          ],
        }),
      },
    ]);
    const missing = await client.callTool({
      name: "get_candidate",
      arguments: { id: "nobody" },
    });
    expect(missing).toEqual({
      content: [{ type: "text", text: "No candidate called nobody" }],
      isError: true,
    });
    await client.close();
  });
});
