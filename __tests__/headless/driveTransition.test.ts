import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";
import { PlayerStatus } from "../../src/types/Player";
import { findPlayerLocationViolations } from "../../src/game/rules/playerLocation";

/**
 * The drive transition end to end: touchdown -> paced KO recovery ->
 * short-handed setup -> kickoff. This is the sequence a Sevens match could
 * not previously survive.
 */

/** Carrier two squares from the end zone; walking in scores. */
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
  const carrier = game.snapshot().teams[0].players[0];
  await game.execute({
    type: "declare-action",
    playerId: carrier.id,
    action: "move",
  });
  return game.execute({
    type: "move",
    playerId: carrier.id,
    path: [
      { x: 18, y: 5 },
      { x: 19, y: 5 },
    ],
  });
}

/** Knock out every player of a team except `keep` of them. */
function knockOutAllBut(
  game: HeadlessGame,
  teamIndex: 0 | 1,
  keep: number
): string[] {
  const team = teamIndex === 0 ? game.ctx.team1 : game.ctx.team2;
  const knockedOut: string[] = [];
  team.players.slice(keep).forEach((player) => {
    player.status = PlayerStatus.KO;
    player.gridPosition = undefined;
    knockedOut.push(player.id);
  });
  return knockedOut;
}

/** Place every unplaced available player, up to the cap of seven. */
async function placeAvailable(
  game: HeadlessGame,
  teamId: string
): Promise<void> {
  const zone = game.ctx.gameService.getSetupZone(teamId)!;
  const snap = game.snapshot();
  const team = snap.teams.find((t) => t.id === teamId)!;
  const toPlace = team.players
    .filter((p) => p.status === "Active" || p.status === "Reserve")
    .filter((p) => !p.position)
    .slice(0, 7);
  const occupied = new Set(
    snap.teams
      .flatMap((t) => t.players)
      .filter((p) => p.position)
      .map((p) => `${p.position!.x},${p.position!.y}`)
  );
  const isTeam1 = teamId === snap.teams[0].id;
  const lineX = isTeam1 ? zone.maxX : zone.minX;
  let placed = 0;
  outer: for (
    let x = lineX;
    x >= zone.minX && x <= zone.maxX;
    x += isTeam1 ? -1 : 1
  ) {
    for (let y = 2; y <= 8; y++) {
      if (placed >= toPlace.length) break outer;
      if (occupied.has(`${x},${y}`)) continue;
      const result = await game.execute({
        type: "place-player",
        playerId: toPlace[placed].id,
        x,
        y,
      });
      if (result.ok) {
        occupied.add(`${x},${y}`);
        placed++;
      }
    }
  }
}

describe("drive transition: touchdown -> KO recovery -> short-handed setup -> kickoff", () => {
  it("rolls KO recovery one player at a time, each roll shown before the move", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 7 });
    const knockedOut = knockOutAllBut(game, 0, 3);
    expect(knockedOut.length).toBeGreaterThan(1);

    const response = await scoreTouchdown(game);
    expect(response.ok).toBe(true);

    const rolls = response.events.filter(
      (e) => e.name === GameEventNames.KORecoveryRolled
    );
    // One roll per knocked-out player, in roster order, no player rolled twice
    expect(rolls.map((e) => (e.data as { playerId: string }).playerId)).toEqual(
      knockedOut
    );

    // Each roll is surfaced BEFORE that player's status change is applied, so
    // what the coach watches and what the record says never disagree.
    for (const event of rolls) {
      const data = event.data as { playerId: string; recovered: boolean };
      if (!data.recovered) continue;
      const rollIndex = response.events.indexOf(event);
      const moveIndex = response.events.findIndex(
        (e, i) =>
          i > rollIndex &&
          e.name === GameEventNames.PlayerStatusChanged &&
          (e.data as { id: string }).id === data.playerId
      );
      expect(moveIndex).toBeGreaterThan(rollIndex);
    }
  });

  it("plays the whole transition: score, recover, field a short-handed team, kick off", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 7 });
    // Leave both teams well under seven available for the next drive.
    knockOutAllBut(game, 0, 3);
    knockOutAllBut(game, 1, 3);

    const scored = await scoreTouchdown(game);
    expect(scored.ok).toBe(true);
    // No unhandled phase: TOUCHDOWN was entered and handed off to setup.
    expect(scored.events.some((e) => e.name === GameEventNames.Touchdown)).toBe(
      true
    );
    expect(scored.snapshot.phase).toBe(GamePhase.SETUP);
    expect(scored.snapshot.subPhase).toBe(SubPhase.SETUP_KICKING);

    // Every player is in exactly one place once the dust settles.
    expect(
      findPlayerLocationViolations([
        ...game.ctx.team1.players,
        ...game.ctx.team2.players,
      ])
    ).toEqual([]);

    // Both teams are short-handed; each fields everything it has.
    let snap = game.snapshot();
    for (let team = 0; team < 2; team++) {
      const teamId = snap.activeTeamId!;
      const available = game.ctx.gameService
        .getTeam(teamId)!
        .players.filter(
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

    // ...and the short-handed drive kicks off normally.
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
      playerId: kicker!.id,
      x: kickingTeam!.id === snap.teams[0].id ? 15 : 5,
      y: 5,
    });
    expect(kicked.ok).toBe(true);
    expect(game.snapshot().phase).toBe(GamePhase.PLAY);
  });

  it("a touchdown on the last turn of the first half goes to halftime, not another drive", async () => {
    const game = new HeadlessGame({ scenario: tdScenario, seed: 11 });
    const [team1Id] = game.snapshot().teams.map((t) => t.id);

    // Burn the whole first half except team1's final turn.
    game.ctx.gameService.startGame(team1Id);
    for (let i = 0; i < 11; i++) await game.execute({ type: "end-turn" });

    let snap = game.snapshot();
    expect(snap.phase).toBe(GamePhase.PLAY);
    expect(snap.turn.isHalf2).toBe(false);

    // Put the carrier back on the pitch with the ball and walk it in.
    const carrier = game.ctx.team1.players[0];
    carrier.gridPosition = { x: 17, y: 5 };
    game.ctx.gameService.setBallPosition(17, 5);
    game.ctx.gameService.getState().activeTeamId = team1Id;
    const scored = await scoreTouchdown(game);
    expect(scored.ok).toBe(true);

    snap = game.snapshot();
    // Halftime, not a further first-half drive.
    expect(snap.turn.isHalf2).toBe(true);
    expect(snap.activeTeamId).not.toBe(team1Id);
    expect(
      scored.events.some(
        (e) =>
          e.name === GameEventNames.DriveEnded &&
          (e.data as { reason: string }).reason === "halftime"
      )
    ).toBe(true);
    // Exactly one KO-recovery pass, not one per queued sequence.
    const koPhases = scored.events.filter(
      (e) =>
        e.name === GameEventNames.PhaseChanged &&
        (e.data as { subPhase?: string }).subPhase === SubPhase.RECOVER_KO
    );
    expect(koPhases).toHaveLength(1);
  });

  it("a recovered player exists exactly once and can be placed next drive", async () => {
    // Search seeds until at least one knocked-out player recovers.
    for (let seed = 1; seed <= 40; seed++) {
      const game = new HeadlessGame({ scenario: tdScenario, seed });
      const knockedOut = knockOutAllBut(game, 0, 3);

      const response = await scoreTouchdown(game);
      const recovered = response.events
        .filter((e) => e.name === GameEventNames.KORecoveryRolled)
        .map((e) => e.data as { playerId: string; recovered: boolean })
        .filter((data) => data.recovered);
      if (recovered.length === 0) continue;

      const playerId = recovered[0].playerId;
      const player = game.ctx.gameService.getPlayerById(playerId)!;

      // One record, one place: Reserves, with no stale pitch square.
      expect(knockedOut).toContain(playerId);
      expect(player.status).toBe(PlayerStatus.RESERVE);
      expect(player.gridPosition).toBeUndefined();
      const everyone = [...game.ctx.team1.players, ...game.ctx.team2.players];
      expect(everyone.filter((p) => p.id === playerId)).toHaveLength(1);
      expect(findPlayerLocationViolations(everyone)).toEqual([]);

      // ...and they are available to place in the next drive's setup.
      const snap = game.snapshot();
      expect(snap.phase).toBe(GamePhase.SETUP);
      expect(snap.activeTeamId).toBe(player.teamId);
      const zone = game.ctx.gameService.getSetupZone(player.teamId)!;
      const square = { x: zone.maxX, y: 5 };
      const placed = await game.execute({
        type: "place-player",
        playerId,
        ...square,
      });
      expect(placed.ok).toBe(true);
      expect(
        game.ctx.gameService.getPlayerById(playerId)!.gridPosition
      ).toEqual(square);
      return;
    }
    throw new Error("no seed in 1..40 produced a KO recovery");
  });
});
