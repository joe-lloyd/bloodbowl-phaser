import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";

const BLOODLUST_FAILS_SEED = 7;

function vampireWithBall(): HeadlessGame {
  return new HeadlessGame({
    seed: BLOODLUST_FAILS_SEED,
    scenario: {
      id: "bloodlust-ball-retry",
      name: "Bloodlust refuses a pass, then the coach tries again",
      description: "",
      setup: {
        team1Roster: RosterName.VAMPIRE,
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }] },
          { playerIndex: 1, x: 10, y: 6 },
        ],
        team2Placements: [{ playerIndex: 0, x: 20, y: 2 }],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 10, y: 5 },
      },
    },
  });
}

async function refuseFirstBite(action: "handoff" | "pass") {
  const game = vampireWithBall();
  const [vampire, thrall] = [0, 1].map((index) => fixtureValue(game.ctx.teams[0].players[index]));
  const playerId = fixtureValue(vampire).id;
  const thrallId = fixtureValue(thrall).id;
  await game.execute({ type: "declare-action", playerId, action });
  await game.execute({ type: "use-reaction", accept: false });
  const command =
    action === "handoff"
      ? { type: "handoff" as const, playerId, targetId: thrallId }
      : { type: "pass" as const, playerId, x: 10, y: 6 };
  const attempt = () => game.execute(command);
  const first = await attempt();
  await game.execute({ type: "use-reaction", accept: false });
  return { first, retry: await attempt() };
}

describe("a refused Bloodlust bite leaves the ball free to move (DB-A1)", () => {
  it("offers the bite again when the coach retries the hand-off", async () => {
    const { first, retry } = await refuseFirstBite("handoff");

    expect(first.pendingDecision).toMatchObject({ type: "reaction", skill: SkillType.BLOODLUST });
    expect(retry).toMatchObject({
      ok: true,
      pendingDecision: { type: "reaction", skill: SkillType.BLOODLUST },
    });
  });

  it("offers the bite again when the coach retries the pass", async () => {
    const { first, retry } = await refuseFirstBite("pass");

    expect(first.pendingDecision).toMatchObject({ type: "reaction", skill: SkillType.BLOODLUST });
    expect(retry).toMatchObject({
      ok: true,
      pendingDecision: { type: "reaction", skill: SkillType.BLOODLUST },
    });
  });
});
