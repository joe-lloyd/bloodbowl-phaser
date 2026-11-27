import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { findPlayerLocationViolations } from "../../src/game/rules/playerLocation";

const tdScenario: Scenario = {
  id: "drive-transition",
  name: "Drive transition",
  description: "carrier walks into the end zone",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 17, y: 5 },
      { playerIndex: 1, x: 15, y: 3 },
    ],
    team2Placements: [{ playerIndex: 0, x: 13, y: 9 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 17, y: 5 },
  },
};

async function scoreTouchdown(game: HeadlessGame) {
  const carrier = fixtureValue(game.snapshot().teams[0]).players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(carrier).id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: fixtureValue(carrier).id,
    path: [
      { x: 18, y: 5 },
      { x: 19, y: 5 },
    ],
  });
}

function knockOutAllBut(
  game: HeadlessGame,
  teamIndex: 0 | 1,
): string[] {
  const team = teamIndex === 0 ? game.ctx.teams[0] : game.ctx.teams[1];
  const knockedOut: string[] = [];
  for (const player of team.players.slice(3)) {
    player.status = PlayerStatus.KO;
    delete player.gridPosition;
    knockedOut.push(player.id);
  }
  return knockedOut;
}

async function placeAvailable(
  game: HeadlessGame,
  teamId: string
): Promise<void> {
  const zone = fixtureValue(game.ctx.gameService.getSetupZone(teamId));
  const snap = game.snapshot();
  const team = fixtureValue(snap.teams.find((t) => t.id === teamId));
  const toPlace = team.players
    .filter((p) => p.status === "Active" || p.status === "Reserve")
    .filter((p) => !p.position)
    .slice(0, 7);
  const occupied = new Set(
    snap.teams
      .flatMap((t) => t.players)
      .filter((p) => p.position)
      .map(
        (p) =>
          `${String(fixtureValue(p.position).x)},${String(fixtureValue(p.position).y)}`
      )
  );
  const isTeam1 = teamId === fixtureValue(snap.teams[0]).id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${String(x)},${String(y)}`)) continue;
      const result = await game.execute({
        type: "place-player",
        playerId: fixtureValue(toPlace[placed]).id,
        x,
        y,
      });
      if (!result.ok) {
        continue;
      }

      occupied.add(`${String(x)},${String(y)}`);
      placed++;
    }
  }
}

describe("drive transition: touchdown -> KO recovery -> short-handed setup -> kickoff", () => {
  it("announces and records the scorer, score and remaining turns before setup", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 7 });
    const entries: string[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_LogEntry, (entry) => {
      if (entry.category === "score") entries.push(entry.detail ?? "");
    });
    const response = await scoreTouchdown(game);
    const announcement = response.events.findIndex(
      (event) =>
        event.name === GameEventNames.UI_Announce &&
        typeof event.data === "object" &&
        event.data !== null &&
        "kind" in event.data &&
        event.data.kind === "touchdown"
    );
    const setup = response.events.findIndex(
      (event) =>
        event.name === GameEventNames.PhaseChanged &&
        typeof event.data === "object" &&
        event.data !== null &&
        "phase" in event.data &&
        event.data.phase === GamePhase.SETUP
    );
    expect(announcement).toBeGreaterThanOrEqual(0);
    expect(setup).toBeGreaterThan(announcement);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("1 : 0");
    expect(entries[0]).toContain("Turns left in the half");
    expect(entries[0]).toContain(
      fixtureValue(game.ctx.teams[0].players[0]).playerName
    );
  });

  it("rolls KO recovery one player at a time, each roll shown before the move", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 7 });
    const knockedOut = knockOutAllBut(game, 0);
    expect(knockedOut.length).toBeGreaterThan(1);

    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const rolls = response.events.filter(
      (e) => e.name === GameEventNames.KORecoveryRolled
    );

    expect(
      rolls.map(
        (e) => z.object({ playerId: z.string() }).parse(e.data).playerId
      )
    ).toEqual(knockedOut);

    for (const event of rolls) {
      const data = z
        .object({ playerId: z.string(), recovered: z.boolean() })
        .parse(event.data);
      if (!data.recovered) continue;
      const rollIndex = response.events.indexOf(event);
      const moveIndex = response.events.findIndex(
        (e, i) =>
          i > rollIndex &&
          e.name === GameEventNames.PlayerStatusChanged &&
          z.object({ id: z.string() }).parse(e.data).id === data.playerId
      );
      expect(moveIndex).toBeGreaterThan(rollIndex);
    }
  });

  it("plays the whole transition: score, recover, field a short-handed team, kick off", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 7 });

    knockOutAllBut(game, 0);
    knockOutAllBut(game, 1);

    const scored = await scoreTouchdown(game);
    expect(scored.ok).toBe(true);

    expect(scored.events.some((e) => e.name === GameEventNames.Touchdown)).toBe(
      true
    );
    expect(scored.snapshot.phase).toBe(GamePhase.SETUP);
    expect(scored.snapshot.subPhase).toBe(SubPhase.SETUP_KICKING);

    expect(
      findPlayerLocationViolations([
        ...game.ctx.teams[0].players,
        ...game.ctx.teams[1].players,
      ])
    ).toEqual([]);

    let snap = game.snapshot();
    for (let team = 0; team < 2; team++) {
      const teamId = fixtureValue(snap.activeTeamId);
      const available = fixtureValue(
        game.ctx.gameService.getTeam(teamId)
      ).players.filter(
        (p) =>
          p.status !== PlayerStatus.KO &&
          p.status !== PlayerStatus.INJURED &&
          p.status !== PlayerStatus.DEAD &&
          p.status !== PlayerStatus.REMOVED
      );
      expect(available.length).toBeLessThan(7);

      await placeAvailable(game, teamId);
      expect(game.ctx.gameService.isSetupComplete(teamId)).toBe(true);
      const confirmed = await game.execute({ type: "confirm-setup", teamId });
      expect(confirmed.ok).toBe(true);
      snap = game.snapshot();
    }

    expect(snap.phase).toBe(GamePhase.KICKOFF);

    const kicker = snap.teams
      .flatMap((t) => t.players)
      .find(
        (p) => p.position && p.teamId === game.ctx.gameService.getActiveTeamId()
      );
    const kickingTeam = snap.teams.find((t) =>
      t.players.some((p) => p.position && p.id === kicker?.id)
    );
    expect(kickingTeam).toBeDefined();
    const kicked = await game.execute({
      type: "kick-ball",
      playerId: fixtureValue(kicker).id,
      x:
        fixtureValue(kickingTeam).id === fixtureValue(snap.teams[0]).id
          ? 15
          : 5,
      y: 5,
    });
    expect(kicked.ok).toBe(true);
    expect(game.snapshot().phase).toBe(GamePhase.PLAY);
  });

  it("a touchdown on the last turn of the first half goes to halftime, not another drive", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 11 });
    const [team1Id] = game.snapshot().teams.map((t) => t.id);

    game.ctx.gameService.startGame(fixtureValue(team1Id));
    for (let i = 0; i < 11; i++) await game.execute({ type: "end-turn" });

    let snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.PLAY);
    expect(snap.turn.isHalf2).toBe(false);

    const carrier = game.ctx.teams[0].players[0];
    fixtureValue(carrier).gridPosition = { x: 17, y: 5 };
    game.ctx.gameService.setBallPosition(17, 5);
    game.ctx.gameService.getState().activeTeamId = fixtureValue(team1Id);
    const scored = await scoreTouchdown(game);
    expect(scored.ok).toBe(true);

    snap = game.snapshot();

    expect(snap.turn.isHalf2).toBe(true);
    expect(snap.activeTeamId).not.toBe(team1Id);
    expect(
      scored.events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          z.object({ reason: z.string() }).parse(e.data).reason === "halftime"
      )
    ).toBe(true);

    const koPhases = scored.events.filter(
      (e) =>
        e.name === GameEventNames.PhaseChanged &&
        z.object({ subPhase: z.string().exactOptional() }).parse(e.data)
          .subPhase === SubPhase.RECOVER_KO
    );
    expect(koPhases).toHaveLength(1);
  });

  it("a recovered player exists exactly once and can be placed next drive", async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const game = new HeadlessGame({ scenario: tdScenario, seed });
      const knockedOut = knockOutAllBut(game, 0);

      const response = await scoreTouchdown(game);
      const recovered = response.events
        .filter((e) => e.name === GameEventNames.KORecoveryRolled)
        .map((e) =>
          z
            .object({ playerId: z.string(), recovered: z.boolean() })
            .parse(e.data)
        )
        .filter((data) => data.recovered);
      if (recovered.length === 0) continue;

      const playerId = fixtureValue(recovered[0]).playerId;
      const player = fixtureValue(game.ctx.gameService.getPlayerById(playerId));

      expect(knockedOut).toContain(playerId);
      expect(player.status).toBe(PlayerStatus.RESERVE);
      expect(player.gridPosition).toBeUndefined();
      const everyone = [...game.ctx.teams[0].players, ...game.ctx.teams[1].players];
      expect(everyone.filter((p) => p.id === playerId)).toHaveLength(1);
      expect(findPlayerLocationViolations(everyone)).toEqual([]);

      const snap = game.snapshot();
      expect(snap.phase).toBe(GamePhase.SETUP);
      expect(snap.activeTeamId).toBe(player.teamId);
      const zone = fixtureValue(
        game.ctx.gameService.getSetupZone(player.teamId)
      );
      const square = { x: zone.maxX, y: 5 };
      const placed = await game.execute({
        type: "place-player",
        playerId,
        ...square,
      });
      expect(placed.ok).toBe(true);
      expect(
        fixtureValue(game.ctx.gameService.getPlayerById(playerId)).gridPosition
      ).toEqual(square);
      return;
    }
    throw new Error("no seed in 1..40 produced a KO recovery");
  });
});
