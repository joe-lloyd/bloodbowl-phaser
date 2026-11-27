import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { SkillType } from "../../src/types/Skills";
import { type Player, PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";

const BLOODLUST_FAILS_SEED = 7;

function start() {
  const scenario: Scenario = {
    id: "bloodlust-bite-reaction",
    name: "Bloodlust bites an adjacent Thrall Lineman",
    description: "a failed Bloodlust roll is settled with a bite",
    setup: {
      team1Roster: RosterName.VAMPIRE,
      team1Placements: [
        {
          playerIndex: 0,
          x: 10,
          y: 5,
          skills: [{ type: SkillType.BLOODLUST, parameter: "2+" }],
        },
        { playerIndex: 1, x: 11, y: 5 },
        { playerIndex: 2, x: 3, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 20, y: 2 }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
  const game = new HeadlessGame({ scenario, seed: BLOODLUST_FAILS_SEED });
  const vampire = game.ctx.teams[0].players[0];
  const thrall = game.ctx.teams[0].players[1];

  const heard: string[] = [];
  game.ctx.eventBus.on(GameEventNames.PlayerStatusChanged, (p: Player) => {
    if (p.id === fixtureValue(thrall).id) heard.push(`thrall ${p.status}`);
  });
  game.ctx.eventBus.on(GameEventNames.PlayerKnockedDown, ({ playerId }) => {
    if (playerId === fixtureValue(thrall).id) heard.push("thrall knocked down");
  });
  game.ctx.eventBus.on(GameEventNames.TurnEnded, () => {
    heard.push("turn ended");
  });
  return { game, vampire, thrall, heard };
}

async function failBloodlust(r: ReturnType<typeof start>) {
  await r.game.execute({
    type: "declare-action",
    playerId: fixtureValue(r.vampire).id,
    action: "move",
  });

  await r.game.execute({ type: "use-reaction", accept: false });
}

const injuryDice = (result: Awaited<ReturnType<HeadlessGame["execute"]>>) =>
  result.events
    .filter((e) => e.name === "diceRoll")
    .map((e) => z.object({ description: z.string() }).parse(e.data).description)
    .filter((d) => d.startsWith("Injury Roll"));

describe("A Bloodlust bite announces the bitten Thrall at once", () => {
  it("at the end of the activation: the Thrall is announced Stunned as the bite lands", async () => {
    const r = start();
    await failBloodlust(r);
    const ended = await r.game.execute({
      type: "end-activation",
      playerId: fixtureValue(r.vampire).id,
    });
    expect(ended.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });

    const bitten = await r.game.execute({ type: "use-reaction", accept: true });

    expect(injuryDice(bitten)).toEqual([
      "Injury Roll (Thrall Lineman #2): 1 + 6 = 7",
    ]);
    expect(fixtureValue(r.thrall).status).toBe(PlayerStatus.STUNNED);
    expect(r.game.snapshot().activeTeamId).toBe(r.game.ctx.teams[0].id);

    expect(r.heard).toEqual([`thrall ${PlayerStatus.STUNNED}`]);
  });

  it("at End Turn: the Thrall is announced Stunned before the turn ends, once", async () => {
    const r = start();
    await failBloodlust(r);
    const ended = await r.game.execute({ type: "end-turn" });
    expect(ended.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.BLOODLUST,
    });

    const bitten = await r.game.execute({ type: "use-reaction", accept: true });

    expect(injuryDice(bitten)).toEqual([
      "Injury Roll (Thrall Lineman #2): 1 + 6 = 7",
    ]);
    expect(fixtureValue(r.thrall).status).toBe(PlayerStatus.STUNNED);
    expect(r.game.snapshot().activeTeamId).toBe(r.game.ctx.teams[1].id);
    expect(r.heard).toEqual([`thrall ${PlayerStatus.STUNNED}`, "turn ended"]);
  });
});
