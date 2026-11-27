import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type CommandResponse } from "../../src/headless/protocol";
import { type PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import {
  PlayerCondition,
  PlayerStatus,
  addCondition,
} from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import { GameEventNames } from "../../src/types/events";
import { nativeFixtures } from "../../src/testing/fixtures/rosterFixtures";
import { answerDecision } from "../../src/game/rules-lab/runner";

const FANATIC = 6;

function fanaticGame(opts: {
  seed: number;
  at?: { x: number; y: number };
  team1?: PlayerPlacement[];
  team2?: PlayerPlacement[];
  team2Roster?: RosterName;
  activeTeam?: "team1" | "team2";
  fanaticSkills?: SkillType[];
}) {
  const game = new HeadlessGame({
    seed: opts.seed,
    scenario: {
      id: "ball-and-chain-block",
      name: "Ball & Chain",
      description: "",
      setup: {
        team1Roster: RosterName.GOBLIN,
        ...(opts.team2Roster !== undefined && { team2Roster: opts.team2Roster }),
        team1Placements: [
          {
            playerIndex: FANATIC,
            ...(opts.at ?? { x: 10, y: 5 }),
            ...(opts.fanaticSkills !== undefined && { skills: opts.fanaticSkills }),
          },

          { playerIndex: 3, x: 1, y: 9 },
          ...(opts.team1 ?? []),
        ],
        team2Placements: opts.team2 ?? [{ playerIndex: 0, x: 18, y: 9 }],
        activeTeam: opts.activeTeam ?? "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ...([...(opts.team1 ?? []), ...(opts.team2 ?? [])].every(
          (p) => !p.hasBall
        ) && { ballPosition: { x: 1, y: 1 } }),
      },
    },
  });
  return { game, fanatic: game.ctx.teams[0].players[FANATIC] };
}

async function declare(game: HeadlessGame, fanaticId: string) {
  const declared = await game.execute({
    type: "declare-action",
    playerId: fanaticId,
    action: "ballAndChain",
  });
  expect(declared.ok).toBe(true);
}

const EAST = { x: 1, y: 0 };
const NORTH = { x: 0, y: -1 };

function swing(
  game: HeadlessGame,
  fanaticId: string,
  facing: { x: number; y: number }
) {
  return game.execute({
    type: "ball-and-chain",
    playerId: fanaticId,
    ...facing,
  });
}

const dice = (response: CommandResponse): string[] =>
  response.events
    .filter((e) => e.name === GameEventNames.DiceRoll)
    .map(
      (e) => z.object({ description: z.string() }).parse(e.data).description
    );

const straight = (response: CommandResponse) =>
  dice(response).some((d) => /^Ball & Chain Deviation: [34]$/.test(d));

async function firstSeed<T>(
  run: (seed: number) => Promise<T | null>,
  limit = 300
): Promise<T> {
  for (let seed = 1; seed <= limit; seed++) {
    const found = await run(seed);
    if (found !== null) return found;
  }
  throw new Error(`no seed in 1..${String(limit)}`);
}

const WALL: PlayerPlacement[] = [
  { playerIndex: 0, x: 11, y: 4 },
  { playerIndex: 1, x: 11, y: 5 },
  { playerIndex: 2, x: 11, y: 6 },
];

describe("a Ball & Chain collision is a normal Block", () => {
  it("bounces a dropped ball when moving into the vacated square, without a pickup Turnover", async () => {
    const { game, fanatic } = fanaticGame({
      seed: 25,
      team2: [{ playerIndex: 0, x: 11, y: 5, hasBall: true }],
    });
    await declare(game, fixtureValue(fanatic).id);
    const collision = await swing(game, fixtureValue(fanatic).id, EAST);
    expect(straight(collision)).toBe(true);
    expect(collision.pendingDecision?.type).toBe("block-dice");
    const options =
      collision.pendingDecision?.type === "block-dice"
        ? collision.pendingDecision.options
        : [];
    const pow = options.findIndex((o) => o.type === "pow");
    expect(pow).toBeGreaterThanOrEqual(0);
    await game.execute({ type: "choose-block-result", index: pow });
    const moved = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });

    expect(fixtureValue(fanatic).gridPosition).toEqual({ x: 11, y: 5 });
    expect(dice(moved).filter((d) => d.startsWith("Bounce"))).toHaveLength(2);
    expect(moved.events.some((e) => e.name === GameEventNames.Turnover)).toBe(
      false
    );
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[0].id);
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      false
    );
  });

  it("does not turn over when a team-mate Wrestles the Fanatic Prone", async () => {
    const { game, fanatic } = fanaticGame({
      seed: 6,
      team1: [{ playerIndex: 1, x: 11, y: 5, skills: [SkillType.WRESTLE] }],
    });
    await declare(game, fixtureValue(fanatic).id);
    const collision = await swing(game, fixtureValue(fanatic).id, EAST);
    expect(straight(collision)).toBe(true);
    const options =
      collision.pendingDecision?.type === "block-dice"
        ? collision.pendingDecision.options
        : [];
    const bothDown = options.findIndex((o) => o.type === "both-down");
    expect(bothDown).toBeGreaterThanOrEqual(0);
    const offer = await game.execute({
      type: "choose-block-result",
      index: bothDown,
    });
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.WRESTLE,
    });
    const wrestled = await game.execute({ type: "use-reaction", accept: true });

    expect(fixtureValue(game.ctx.teams[0].players[1]).status).toBe(
      PlayerStatus.PRONE
    );
    expect(
      dice(wrestled).filter((d) => d.startsWith("Injury Roll (Fanatic #7)"))
    ).toHaveLength(1);
    expect(dice(wrestled).some((d) => d.startsWith("Armour Roll"))).toBe(false);
    expect(
      wrestled.events.some((e) => e.name === GameEventNames.PlayerKnockedDown)
    ).toBe(false);
    expect(
      wrestled.events.some((e) => e.name === GameEventNames.Turnover)
    ).toBe(false);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[0].id);
  });

  it("rolls immediate Injury when Pile Driver places the Fanatic Prone", async () => {
    const { game, fanatic } = fanaticGame({
      seed: 10,
      fanaticSkills: [SkillType.PILE_DRIVER],
      team2: [{ playerIndex: 0, x: 11, y: 5 }],
    });
    await declare(game, fixtureValue(fanatic).id);
    const collision = await swing(game, fixtureValue(fanatic).id, EAST);
    expect(straight(collision)).toBe(true);
    const options =
      collision.pendingDecision?.type === "block-dice"
        ? collision.pendingDecision.options
        : [];
    const pow = options.findIndex((o) => o.type === "pow");
    expect(pow).toBeGreaterThanOrEqual(0);
    await game.execute({ type: "choose-block-result", index: pow });
    const offer = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });
    expect(offer.pendingDecision).toMatchObject({
      type: "reaction",
      skill: SkillType.PILE_DRIVER,
    });
    const piled = await game.execute({ type: "use-reaction", accept: true });

    expect(
      dice(piled).filter((d) => d.startsWith("Injury Roll (Fanatic #7)"))
    ).toHaveLength(1);
    expect(
      dice(piled).some((d) => d.startsWith("Armour Roll (Fanatic #7)"))
    ).toBe(false);
    expect([PlayerStatus.KO, PlayerStatus.INJURED]).toContain(
      fixtureValue(fanatic).status
    );
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      true
    );
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[0].id);
  });

  it("lets the Fanatic's coach pick the die, assists counted: ST 7 against 3 + 2", async () => {
    const { game, fanatic } = fanaticGame({ seed: 1, team2: WALL });
    await declare(game, fixtureValue(fanatic).id);
    const response = await swing(game, fixtureValue(fanatic).id, EAST);

    expect(response.pendingDecision).toMatchObject({
      type: "block-dice",
      attackerId: fixtureValue(fanatic).id,
      chooserTeamId: game.ctx.teams[0].id,
    });

    expect(
      response.pendingDecision?.type === "block-dice"
        ? response.pendingDecision.options.length
        : 0
    ).toBe(2);
  });

  it("offers the team re-roll on the Fanatic's block dice", async () => {
    const { game, fanatic } = fanaticGame({ seed: 1, team2: WALL });
    game.ctx.teams[0].rerolls = 1;
    await declare(game, fixtureValue(fanatic).id);
    const response = await swing(game, fixtureValue(fanatic).id, EAST);
    expect(response.pendingDecision).toMatchObject({
      type: "block-dice",
      teamRerollAvailable: true,
    });

    const rerolled = await game.execute({
      type: "team-reroll-block",
      attackerId: fixtureValue(fanatic).id,
    });
    expect(
      rerolled.events.find((e) => e.name === GameEventNames.RerollUsed)?.data
    ).toMatchObject({
      playerId: fixtureValue(fanatic).id,
      source: "team",
      rollKind: "block",
    });
  });

  it("ignores Foul Appearance", async () => {
    const run = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        team2: [
          { playerIndex: 0, x: 11, y: 5, skills: [SkillType.FOUL_APPEARANCE] },
        ],
      });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      return straight(response) ? response : null;
    });
    expect(dice(run).filter((d) => d.startsWith("Foul Appearance"))).toEqual(
      []
    );
    expect(run.pendingDecision?.type).toBe("block-dice");
  });

  it("keeps the Fanatic in its square when Stand Firm refuses the push (FAQ)", async () => {
    const [slot] = nativeFixtures(SkillType.STAND_FIRM);
    const { game, fanatic, target } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        team2Roster: fixtureValue(slot).roster,
        team2: [{ playerIndex: fixtureValue(slot).playerIndex, x: 11, y: 5 }],
      });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      const pending = response.pendingDecision;
      if (!straight(response) || pending?.type !== "block-dice") return null;
      const push = pending.options.findIndex((o) => o.type === "push");
      if (push === -1) return null;
      await game.execute({ type: "choose-block-result", index: push });
      return {
        game,
        fanatic,
        target: game.ctx.teams[1].players[fixtureValue(slot).playerIndex],
      };
    });

    const stood = await game.execute({ type: "use-reaction", accept: true });
    expect(stood.pendingDecision).toBeNull();
    expect(fixtureValue(target).gridPosition).toEqual({ x: 11, y: 5 });
    expect(fixtureValue(fanatic).gridPosition).toEqual({ x: 10, y: 5 });

    const state = game.ctx.gameService.getState();
    expect(state.turn.movementUsed.get(fixtureValue(fanatic).id)).toBe(1);
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      false
    );
    expect(state.activePlayer).toMatchObject({
      id: fixtureValue(fanatic).id,
      action: "ballAndChain",
    });
  });

  it("chain-pushes a boxed-in target, then moves in without a follow-up choice", async () => {
    const { game, fanatic, push } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        team2: [
          { playerIndex: 0, x: 11, y: 5 },
          { playerIndex: 1, x: 12, y: 4 },
          { playerIndex: 2, x: 12, y: 5 },
          { playerIndex: 3, x: 12, y: 6 },
        ],
      });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      const pending = response.pendingDecision;
      if (!straight(response) || pending?.type !== "block-dice") return null;
      const push = pending.options.findIndex((o) => o.type === "push");
      return push === -1 ? null : { game, fanatic, push };
    });
    const [target, , behind] = game.ctx.teams[1].players;

    const first = await game.execute({
      type: "choose-block-result",
      index: push,
    });
    expect(first.pendingDecision).toMatchObject({
      type: "push-direction",
      defenderId: fixtureValue(target).id,
      chooserTeamId: game.ctx.teams[0].id,
    });
    const chained = await game.execute({
      type: "choose-push-direction",
      x: 12,
      y: 5,
    });
    expect(chained.pendingDecision).toMatchObject({
      type: "push-direction",
      defenderId: fixtureValue(behind).id,
    });
    const options =
      chained.pendingDecision?.type === "push-direction"
        ? chained.pendingDecision.options
        : [];
    const settled = await game.execute({
      type: "choose-push-direction",
      ...options[0],
    });

    expect(settled.pendingDecision).toBeNull();
    expect(fixtureValue(behind).gridPosition).toEqual(options[0]);
    expect(fixtureValue(target).gridPosition).toEqual({ x: 12, y: 5 });
    expect(fixtureValue(fanatic).gridPosition).toEqual({ x: 11, y: 5 });
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      false
    );
  });

  it("knocking a team-mate down is a Turnover", async () => {
    const { game } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        team1: [{ playerIndex: 1, x: 11, y: 5 }],
      });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      const pending = response.pendingDecision;
      if (!straight(response) || pending?.type !== "block-dice") return null;
      expect(pending.chooserTeamId).toBe(game.ctx.teams[0].id);
      const pow = pending.options.findIndex((o) => o.type === "pow");
      if (pow === -1) return null;
      let reply = await game.execute({
        type: "choose-block-result",
        index: pow,
      });
      while (reply.pendingDecision) {
        reply = await game.execute(
          fixtureValue(answerDecision(reply.pendingDecision, game, {}))
        );
      }
      return { game };
    });
    expect(fixtureValue(game.ctx.teams[0].players[1]).status).not.toBe(
      PlayerStatus.ACTIVE
    );
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[1].id);
  });
});

describe("Ball & Chain movement", () => {
  it("takes a new facing for every square", async () => {
    const { game, fanatic } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({ seed });
      await declare(game, fixtureValue(fanatic).id);
      if (!straight(await swing(game, fixtureValue(fanatic).id, EAST)))
        return null;
      if (!straight(await swing(game, fixtureValue(fanatic).id, NORTH)))
        return null;
      return { game, fanatic };
    });
    expect(fixtureValue(fanatic).gridPosition).toEqual({ x: 11, y: 4 });
    expect(
      game.ctx.gameService
        .getState()
        .turn.movementUsed.get(fixtureValue(fanatic).id)
    ).toBe(2);
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      false
    );
  });

  it("Rushes the two squares after its MA, then the activation ends", async () => {
    const { game, fanatic, rushes } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({ seed, at: { x: 5, y: 5 } });
      await declare(game, fixtureValue(fanatic).id);
      const rushes: string[][] = [];
      for (let square = 0; square < 5; square++) {
        const response = await swing(game, fixtureValue(fanatic).id, EAST);
        rushes.push(dice(response).filter((d) => d.startsWith("Rush")));
      }
      return fixtureValue(fanatic).status === PlayerStatus.ACTIVE
        ? { game, fanatic, rushes }
        : null;
    });
    expect(rushes.map((r) => r.length)).toEqual([0, 0, 0, 1, 1]);
    expect(fixtureValue(rushes[3])[0]).toMatch(
      /^Rush \(Fanatic #7\): [2-6], needs 2\+$/
    );
    expect(game.ctx.gameService.hasPlayerActed(fixtureValue(fanatic).id)).toBe(
      true
    );
  });

  it("lets Steady Footing save a failed Rush", async () => {
    const { game, fanatic, response } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        at: { x: 5, y: 5 },
        fanaticSkills: [SkillType.STEADY_FOOTING],
      });
      game.ctx.teams[0].rerolls = 0;
      await declare(game, fixtureValue(fanatic).id);
      for (let square = 0; square < 3; square++) {
        await swing(game, fixtureValue(fanatic).id, EAST);
      }
      if (fixtureValue(fanatic).status !== PlayerStatus.ACTIVE) return null;
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      const rolled = dice(response);
      return rolled.some((d) => d.startsWith("Rush (Fanatic #7): 1")) &&
        rolled.some((d) => d.startsWith("Steady Footing (Fanatic #7): 6"))
        ? { game, fanatic, response }
        : null;
    });
    expect(fixtureValue(fanatic).status).toBe(PlayerStatus.ACTIVE);
    expect(dice(response).some((d) => d.startsWith("Injury Roll"))).toBe(false);
    expect(response.snapshot.activeTeamId).toBe(game.ctx.teams[0].id);
  });

  it("enters the square of a failed Rush, then Falls Over there", async () => {
    const { game, fanatic, response, from } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({ seed, at: { x: 5, y: 5 } });
      await declare(game, fixtureValue(fanatic).id);
      for (let square = 0; square < 3; square++) {
        await swing(game, fixtureValue(fanatic).id, EAST);
      }
      if (fixtureValue(fanatic).status !== PlayerStatus.ACTIVE) return null;
      const from = { ...fixtureValue(fixtureValue(fanatic).gridPosition) };
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      return dice(response).some((d) => d.startsWith("Rush (Fanatic #7): 1"))
        ? { game, fanatic, response, from }
        : null;
    });
    const moved = response.events.findIndex(
      (e) =>
        e.name === GameEventNames.PlayerMoved &&
        z.object({ playerId: z.string() }).parse(e.data).playerId ===
          fixtureValue(fanatic).id
    );
    expect(
      z
        .object({ to: z.object({ x: z.number() }) })
        .parse(fixtureValue(response.events[moved]).data).to.x
    ).toBe(from.x + 1);
    const injury = response.events.findIndex(
      (e) =>
        e.name === GameEventNames.DiceRoll &&
        z
          .object({ description: z.string() })
          .parse(e.data)
          .description.startsWith("Injury Roll (Fanatic #7)")
    );
    expect(moved).toBeGreaterThanOrEqual(0);
    expect(injury).toBeGreaterThan(moved);
    expect(dice(response).some((d) => d.startsWith("Armour Roll"))).toBe(false);
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[1].id);
  });

  it("is never held in place by Chomped (FAQ)", async () => {
    const { game, fanatic } = fanaticGame({
      seed: 1,
      team2: [{ playerIndex: 0, x: 9, y: 5 }],
    });
    addCondition(
      fixtureValue(fanatic),
      PlayerCondition.CHOMPED,
      fixtureValue(game.ctx.teams[1].players[0]).id
    );
    await declare(game, fixtureValue(fanatic).id);
    await swing(game, fixtureValue(fanatic).id, EAST);
    expect(fixtureValue(fanatic).gridPosition?.x).toBe(11);
  });
});

describe("a Ball & Chain player getting hurt", () => {
  it("keeps Mighty Blow's Injury modifier when the Fanatic skips Armour", async () => {
    const { game, fanatic } = fanaticGame({
      seed: 10,
      activeTeam: "team2",
      team2Roster: RosterName.GOBLIN,
      team2: [
        { playerIndex: 0, x: 11, y: 5 },
        { playerIndex: 1, x: 12, y: 5 },
      ],
    });
    const troll = game.ctx.teams[1].players[0];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(troll).id,
      action: "block",
    });
    const block = await game.execute({
      type: "block",
      attackerId: fixtureValue(troll).id,
      defenderId: fixtureValue(fanatic).id,
    });
    const options =
      block.pendingDecision?.type === "block-dice"
        ? block.pendingDecision.options
        : [];
    const pow = options.findIndex((o) => o.type === "pow");
    expect(pow).toBeGreaterThanOrEqual(0);
    await game.execute({ type: "choose-block-result", index: pow });
    const downed = await game.execute({
      type: "choose-push-direction",
      x: 9,
      y: 5,
    });

    expect(
      dice(downed).filter((d) => d.startsWith("Injury Roll (Fanatic #7)"))
    ).toEqual(["Injury Roll (Fanatic #7): 5 + 3 = 8"]);
    expect(
      dice(downed).some((d) => d.startsWith("Armour Roll (Fanatic #7)"))
    ).toBe(false);
    const expectedData: unknown = expect.objectContaining({
      playerId: fixtureValue(troll).id,
      skill: SkillType.MIGHTY_BLOW,
    });
    expect(downed.events).toContainEqual(
      expect.objectContaining({
        name: GameEventNames.SkillTriggered,
        data: expectedData,
      })
    );
    expect(fixtureValue(fanatic).status).toBe(PlayerStatus.INJURED);
  });

  it("rolls Injury with no Armour Roll when Knocked Down, and Stunned is KO", async () => {
    const { fanatic, rolls } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({ seed, team2: WALL });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, EAST);
      const pending = response.pendingDecision;
      if (pending?.type !== "block-dice") return null;
      const skull = pending.options.findIndex((o) => o.type === "skull");
      if (skull === -1) return null;
      const chosen = await game.execute({
        type: "choose-block-result",
        index: skull,
      });
      const rolls = dice(chosen).filter((d) => d.includes("(Fanatic #7)"));

      const injury = rolls.find((d) => d.startsWith("Injury Roll"));
      return injury && Number(injury.split("= ", 2)[1]) <= 6
        ? { fanatic, rolls }
        : null;
    });
    expect(rolls.filter((d) => d.startsWith("Armour Roll"))).toEqual([]);
    expect(fixtureValue(fanatic).status).toBe(PlayerStatus.KO);
  });

  it("counts off the pitch as Pushed into the Crowd, where Stunned is Reserves (FAQ)", async () => {
    const { game, fanatic } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({ seed, at: { x: 10, y: 0 } });
      await declare(game, fixtureValue(fanatic).id);
      const response = await swing(game, fixtureValue(fanatic).id, NORTH);
      const injury = dice(response).find((d) =>
        d.startsWith("Injury by the Crowd (Fanatic #7)")
      );
      return injury && Number(injury.split("= ", 2)[1]) <= 6
        ? { game, fanatic }
        : null;
    });
    expect(fixtureValue(fanatic).status).toBe(PlayerStatus.RESERVE);
    expect(fixtureValue(fanatic).gridPosition).toBeUndefined();
    expect(game.snapshot().activeTeamId).toBe(game.ctx.teams[1].id);
  });

  it("is Knocked Out with no Injury Roll when its sabotaged weapon goes off (FAQ)", async () => {
    const { fanatic, rolls } = await firstSeed(async (seed) => {
      const { game, fanatic } = fanaticGame({
        seed,
        activeTeam: "team2",
        fanaticSkills: [SkillType.SABOTEUR],
        team2: [{ playerIndex: 0, x: 11, y: 5 }],
      });
      const blocker = game.ctx.teams[1].players[0];
      await game.execute({
        type: "declare-action",
        playerId: fixtureValue(blocker).id,
        action: "block",
      });
      const response = await game.execute({
        type: "block",
        attackerId: fixtureValue(blocker).id,
        defenderId: fixtureValue(fanatic).id,
      });
      const pending = response.pendingDecision;
      if (pending?.type !== "block-dice") return null;
      const pow = pending.options.findIndex((o) => o.type === "pow");
      if (pow === -1) return null;
      const chosen = await game.execute({
        type: "choose-block-result",
        index: pow,
      });
      const rolls = dice(chosen);
      return rolls.some((d) => /^Saboteur \(Fanatic #7\): [4-6]$/.test(d))
        ? { fanatic, rolls }
        : null;
    }, 600);
    expect(fixtureValue(fanatic).status).toBe(PlayerStatus.KO);
    expect(rolls.filter((d) => d.includes("Roll (Fanatic #7)"))).toEqual([]);
  });
});
