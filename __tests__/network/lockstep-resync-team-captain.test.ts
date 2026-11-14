/**
 * A full resync lands after one team appoints its Team Captain and while
 * the other team's appointment is still open. The resync rebuilds from the
 * roster before the first appointment, so restoring it must take the
 * title back off the new Captain. Left on, the replay skipped that team's
 * appointment and refused its recorded answer.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stabilizeIds } from "../../src/headless/createHeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import { LockstepSession } from "../../src/network/LockstepSession";
import { createInMemoryTransportPair } from "../../src/network/transport";
import { TeamFactory } from "../../src/game/TeamFactory";
import { stampFirstCompletedMatch } from "../../src/game/rules/teamLifecycle";
import { GamePhase } from "../../src/types/GameState";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { RosterName, Team } from "../../src/types/Team";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function settle(...sessions: LockstepSession[]) {
  for (let i = 0; i < 5; i++) {
    await tick();
    for (const session of sessions) await session.whenIdle();
  }
}

function leagueHumans(stableId: string): Team {
  const team = stabilizeIds(
    TeamFactory.createTestTeam(RosterName.HUMAN, stableId, 0xcc0000),
    stableId
  );
  team.advancementMode = "sevens-skill-selection";
  stampFirstCompletedMatch(team);
  return team;
}

const build = () =>
  new HeadlessGame({
    seed: 5,
    team1: leagueHumans("team1"),
    team2: leagueHumans("team2"),
    paysWinnings: true,
    startingPhase: GamePhase.SETUP,
  });

describe("a full resync between two Team Captain appointments", () => {
  it("keeps the first Captain's Pro and leaves the second choice open", async () => {
    const hostGame = build();
    const guestGame = build();
    const [hostEnd, guestEnd] = createInMemoryTransportPair();
    const errors: string[] = [];
    const session = (game: HeadlessGame, end: typeof hostEnd, side: string) =>
      new LockstepSession({
        transport: end,
        game,
        selfId: `${side}-uid`,
        myTeamId: side === "host" ? game.ctx.team1.id : game.ctx.team2.id,
        peerTeamId: side === "host" ? game.ctx.team2.id : game.ctx.team1.id,
        hostTeamId: game.ctx.team1.id,
        onDesync: (detail) => errors.push(`${side}: ${detail}`),
      });
    const host = session(hostGame, hostEnd, "host");
    const guest = session(guestGame, guestEnd, "guest");

    await host.run({ type: "confirm-inducements", teamId: "team1" });
    await settle(host, guest);
    await guest.run({ type: "confirm-inducements", teamId: "team2" });
    await settle(host, guest);
    const appointed = hostGame.ctx.team1.players[2].id;
    expect(
      (await host.run({ type: "choose-inducement", playerId: appointed })).ok
    ).toBe(true);
    await settle(host, guest);
    expect(guestGame.pendingDecision()).toMatchObject({
      kind: "team-captain",
      chooserTeamId: "team2",
    });

    const honest = stateChecksum(hostGame);
    const { score } = guestGame.ctx.gameService.getState();
    score.team1 = (score.team1 ?? 0) + 7;
    await guest.requestResync();
    await settle(host, guest);

    expect(stateChecksum(guestGame)).toBe(honest);
    const captain = guestGame.ctx.team1.players[2];
    expect(captain.teamCaptain).toBe(true);
    expect(hasSkill(captain.skills, SkillType.PRO)).toBe(true);
    expect(guestGame.pendingDecision()).toMatchObject({
      kind: "team-captain",
      chooserTeamId: "team2",
    });
    const answered = await guest.run({ type: "choose-inducement" });
    await settle(host, guest);
    expect(answered.reason).toBeUndefined();
    expect(stateChecksum(guestGame)).toBe(stateChecksum(hostGame));
    expect(errors).toEqual([]);
  }, 60_000);
});
