import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { PlayerStatus } from "../../src/types/Player";

/**
 * A fumbled Kick Team-mate removes the kicked player from play and makes an
 * Injury Roll. Off the pitch, a Stunned result goes to the Reserves box, as
 * it does in the crowd. Seeds are committed, never searched.
 */
/** "Kick Team-mate: 1, needs 5+", then "Injury Roll: 1 + 6 = 7", Stunned. */
const FUMBLE_STUNNED_SEED = 7;

describe("Kick Team-mate fumble", () => {
  it("puts a Stunned kicked player in the Reserves box", async () => {
    const game = new HeadlessGame({
      seed: FUMBLE_STUNNED_SEED,
      scenario: {
        id: "ktm-fumble",
        name: "Kick Team-mate fumble",
        description: "a fumbled kick stuns the kicked player",
        setup: {
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.KICK_TEAM_MATE] },
            { playerIndex: 1, x: 11, y: 5, skills: [SkillType.RIGHT_STUFF] },
            { playerIndex: 2, x: 2, y: 1 },
          ],
          team2Placements: [{ playerIndex: 0, x: 16, y: 9 }],
          activeTeam: "team1",
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          ballPosition: { x: 15, y: 2 },
        },
      },
    });
    const [kicker, mate] = game.ctx.team1.players;
    await game.execute({
      type: "declare-action",
      playerId: kicker.id,
      action: "throwTeamMate",
    });
    const response = await game.execute({
      type: "throw-teammate",
      throwerId: kicker.id,
      teammateId: mate.id,
      x: 14,
      y: 5,
    });
    const dice = response.events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);

    expect(dice).toEqual([
      "Kick Team-mate (Human Lineman #1): 1, needs 5+",
      "Injury Roll (Human Lineman #2): 1 + 6 = 7",
    ]);
    expect(mate.gridPosition).toBeUndefined();
    expect(mate.status).toBe(PlayerStatus.RESERVE);
    // The roll banner says where they went, not just Stunned
    expect(
      response.events
        .filter((e) => e.name === "injuryRolled")
        .map((e) => e.data)
    ).toEqual([
      {
        playerId: mate.id,
        result: "Stunned",
        rollType: "Injury Roll (Human Lineman #2)",
        diceTeamId: mate.teamId,
        stunnedToReserves: true,
      },
    ]);
    expect(response.snapshot.activeTeamId).toBe("team2");
  });
});
