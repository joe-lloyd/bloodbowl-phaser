import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { GameService } from "../../src/services/GameService";
import { createLineupTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { startingFormat } from "../../src/game/variants/startingFormat";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { stateChecksum } from "../../src/headless/checksum";
import { Inducement } from "../../src/types/Inducements";
import {
  computerOwnsDecision,
  createComputerCoach,
} from "../../src/network/computerCoach";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function until(
  sessions: LockstepSession[],
  done: () => boolean,
  label: string
) {
  for (let i = 0; i < 400; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
    if (done()) return;
  }
  throw new Error(`timed out waiting for ${label}`);
}

function streetBowlGame() {
  const team1 = stabilizeIds(
    createLineupTeam(RosterName.WOOD_ELF, "Got Wood", 1),
    "team1"
  );
  const team2 = stabilizeIds(
    createLineupTeam(RosterName.HIGH_ELF, "Dragon Drop", 2),
    "team2"
  );
  team2.rerolls += 3;
  return new HeadlessGame({
    teams: [team1, team2],
    seed: 23,
    initialState: GameService.createMatchState({
      teams: [team1, team2],
      startingPhase: GamePhase.SETUP,
      startingSubPhase: SubPhase.INTRO,
      fixture: { pregameInducements: true },
      ...startingFormat({ gameType: "street-bowl" }),
    }),
  });
}

function describeState(game: HeadlessGame) {
  const state = game.snapshot();
  return {
    phase: state.phase,
    subPhase: state.subPhase,
    pending: game.pendingDecision(),
    pregame: state.pregameInducements,
  };
}

describe("a coach against the house bot with a Magic Potion", () => {
  it("offers the potion to the coach who bought it and plays on", async () => {
    const home = streetBowlGame();
    const away = streetBowlGame();
    const [a, b] = createInMemoryTransportPair();
    const desyncs: string[] = [];
    const onDesync = (detail: string) => { desyncs.push(detail); };
    const host = new LockstepSession({
      game: home,
      transport: a,
      selfId: "host",
      myTeamId: "team1",
      peerTeamId: "team2",
      hostTeamId: "team1",
      onDesync,
    });
    const guest = new LockstepSession({
      game: away,
      transport: b,
      selfId: "guest",
      myTeamId: "team2",
      peerTeamId: "team1",
      hostTeamId: "team1",
      onDesync,
    });
    const bot = createComputerCoach({
      game: away,
      eventBus: away.ctx.eventBus,
      computerTeamId: "team2",
      mayAct: () => computerOwnsDecision(away, "team2", "team1"),
      run: (command) => guest.run(command),
      pace: 0.01,
    });
    const both = [host, guest];
    const choosers = new Set<string>();
    try {
      bot.start();
      await until(
        both,
        () => !!home.snapshot().weatherReady?.includes("team2"),
        "the bot to ready up for the weather"
      );
      const readied = await host.run({ type: "ready-weather", teamId: "team1" });
      expect(readied.ok).toBe(true);
      await until(
        both,
        () => !!home.snapshot().pregameInducements?.offer?.confirmed["team2"],
        "the bot to confirm its inducements"
      );
      const selected = await host.run({
        type: "select-inducement",
        teamId: "team1",
        inducement: Inducement.MAGIC_POTION,
        quantity: 1,
      });
      expect(selected.ok).toBe(true);
      const confirmed = await host.run({ type: "confirm-inducements", teamId: "team1" });
      expect(confirmed.ok).toBe(true);
      await until(
        both,
        () => home.pendingDecision()?.type === "inducement-choice",
        `the potion choice, got ${JSON.stringify(describeState(home))}`
      );
      const pending = home.pendingDecision();
      if (pending?.type !== "inducement-choice") throw new Error("no choice");
      expect(pending.kind).toBe("magic-potion");
      expect(pending.chooserTeamId).toBe("team1");
      const [first, second] = pending.playerIds;
      if (!first || !second) throw new Error("no players to drink");
      const chosenFirst = await host.run({ type: "choose-inducement", playerId: first });
      expect(chosenFirst.ok).toBe(true);
      await until(
        both,
        () => {
          const next = home.pendingDecision();
          return (
            next?.type === "inducement-choice" &&
            !next.playerIds.includes(first)
          );
        },
        `the free Street Bowl potion, got ${JSON.stringify(describeState(home))}`
      );
      const chosenSecond = await host.run({ type: "choose-inducement", playerId: second });
      expect(chosenSecond.ok).toBe(true);
      await until(
        both,
        () => {
          const next = home.pendingDecision();
          if (next?.type === "inducement-choice")
            choosers.add(next.chooserTeamId);
          return !next && !home.snapshot().pregameInducements?.resolving;
        },
        `the bot to answer its potion, got ${JSON.stringify(describeState(home))}`
      );
      expect([...choosers]).toEqual(["team2"]);
      expect(away.pendingDecision()).toBeNull();
      expect(stateChecksum(home)).toBe(stateChecksum(away));
      expect(desyncs).toEqual([]);
    } finally {
      bot.close();
      host.close();
      guest.close();
    }
  });
});
