import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import type { HeadlessCommand } from "../../src/headless/protocol";
import { snapshotHash } from "../../src/simulation/runMatch";
import { usageOfTrace } from "../../scripts/coach/policy-lab/usage";

const PUSH_SEED = 1;

describe("policy-lab play usage", () => {
  it("does not credit a team's plays with a touchdown scored in the other team's turn", async () => {
    const game = new HeadlessGame({
      seed: PUSH_SEED,
      scenario: {
        id: "usage-opponent-turn-score",
        name: "Pushed into the end zone",
        description: "",
        setup: {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          activeTeam: "team1",
          turn: 2,
          team1Placements: [
            { playerIndex: 0, x: 18, y: 5, hasBall: true },
            { playerIndex: 1, x: 5, y: 1 },
          ],
          team2Placements: [
            { playerIndex: 0, x: 17, y: 5, stats: { ST: 6 } },
            { playerIndex: 1, x: 3, y: 9 },
          ],
        },
      },
    });
    const initial = game.matchSave();
    const carrier = fixtureValue(game.ctx.team1.players[0]).id;
    const blocker = fixtureValue(game.ctx.team2.players[0]).id;
    const steps: {
      command: HeadlessCommand;
      ok: boolean;
      team: 0 | 1;
      label: string;
      note?: string;
    }[] = [];
    const play = async (
      team: 0 | 1,
      command: HeadlessCommand,
      note?: string
    ) => {
      const response = await game.execute(command);
      steps.push({
        command,
        ok: response.ok,
        team,
        label: command.type,
        ...(note === undefined ? {} : { note: note }),
      });
      return response;
    };
    await play(
      0,
      { type: "declare-action", playerId: carrier, action: "move" },
      "moves the ball carrier"
    );
    await play(0, { type: "end-activation", playerId: carrier });
    await play(0, { type: "end-turn" });
    await play(
      1,
      { type: "declare-action", playerId: blocker, action: "block" },
      "blocks"
    );
    const dice = await play(1, {
      type: "block",
      attackerId: blocker,
      defenderId: carrier,
    });
    const options =
      dice.pendingDecision?.type === "block-dice"
        ? dice.pendingDecision.options.map((o) => o.type)
        : [];
    await play(1, {
      type: "choose-block-result",
      index: options.indexOf("push"),
    });
    await play(1, { type: "choose-push-direction", x: 19, y: 5 });
    expect(game.snapshot().score).toEqual({ team1: 1, team2: 0 });

    const dir = mkdtempSync(join(tmpdir(), "bb7-usage-"));
    try {
      const file = join(dir, "trace.json.gz");
      writeFileSync(
        file,
        gzipSync(
          JSON.stringify({
            initial,
            recording: {
              steps,
              final: { hash: snapshotHash(game.snapshot()) },
            },
          })
        )
      );
      const usage = await usageOfTrace(file, "usage-opponent-turn-score");

      expect(usage.byPlay[0]["carrier"]).toEqual({
        plays: 1,
        scoredThisTurn: 0,
        scoredNextTurn: 0,
        turnovers: 0,
      });
      expect(usage.moments).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
