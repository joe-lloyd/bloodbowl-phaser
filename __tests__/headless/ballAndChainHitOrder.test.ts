import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type CommandResponse } from "../../src/headless/protocol";
import { answerDecision } from "../../src/game/rules-lab/runner";
import { type BlockResultType } from "../../src/services/BlockResolutionService";
import { GamePhase } from "../../src/types/GameState";
import { checkInvariants } from "../../src/simulation/invariants";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { PlayerPlacement } from "../../src/types/Scenario";

const config = fixtureValue(
  fixtureValue(
    TRAIT_RULE_SCENARIOS.find((e) => e.skill === SkillType.BALL_AND_CHAIN)
  ).configs.find((c) => c.id === "ball-and-chain-block")
);
const FANATIC = fixtureValue(config.setup.team1Placements[0]).playerIndex;

const FANATIC_PRIORITY: BlockResultType[] = [
  "pow",
  "pow-dodge",
  "push",
  "both-down",
  "skull",
];

async function lurchAll(
  game: HeadlessGame,
  fanaticId: string
): Promise<CommandResponse[]> {
  const fanatic = fixtureValue(game.ctx.gameService.getPlayerById(fanaticId));
  const team = fanatic.teamId;
  const responses: CommandResponse[] = [];
  for (let square = 0; square < fanatic.stats.MA; square++) {
    const state = game.ctx.gameService.getState();
    if (
      state.phase !== GamePhase.PLAY ||
      state.activeTeamId !== team ||
      game.ctx.gameService.hasPlayerActed(fanaticId)
    ) {
      break;
    }
    let response = await game.execute({
      type: "ball-and-chain",
      playerId: fanaticId,
      x: 1,
      y: 0,
    });
    responses.push(response);
    while (response.pendingDecision) {
      response = await game.execute(
        fixtureValue(
          answerDecision(response.pendingDecision, game, {
            acceptRerolls: false,
            custom: (pending) => {
              if (pending.type !== "block-dice") return;
              const order =
                pending.chooserTeamId === team
                  ? FANATIC_PRIORITY
                  : [...FANATIC_PRIORITY].reverse();
              const type = order.find((t) =>
                pending.options.some((o) => o.type === t)
              );
              return {
                type: "choose-block-result",
                index: pending.options.findIndex((o) => o.type === type),
              };
            },
          })
        )
      );
      responses.push(response);
    }
  }
  return responses;
}

async function lurch(
  seed: number,
  status: PlayerStatus,
  team2Roster?: RosterName
) {
  const at = (playerIndex: number, x: number, y: number) => ({
    playerIndex,
    x,
    y,
    status,
  });
  const game = new HeadlessGame({
    seed,
    scenario: {
      id: "ball-and-chain-pile",
      name: "Ball & Chain into a pile",
      description: "",
      setup: {
        ...config.setup,
        ...(team2Roster === undefined ? {} : { team2Roster: team2Roster }),
        team2Placements: [
          at(0, 11, 4),
          at(1, 11, 5),
          at(2, 11, 6),
          at(3, 12, 4),
          at(4, 12, 5),
          at(5, 12, 6),
        ],
      },
    },
  });
  const fanatic = game.ctx.team1.players[FANATIC];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(fanatic).id,
    action: "ballAndChain",
  });
  const before = game.snapshot();
  const responses = await lurchAll(game, fixtureValue(fanatic).id);
  const response = responses.at(-1);

  const name = (id: string) =>
    [...game.ctx.team1.players, ...game.ctx.team2.players].find(
      (p) => p.id === id
    )?.playerName;
  const trail = responses
    .flatMap((r) => r.events)
    .flatMap((e) => {
      const id =
        e.name === GameEventNames.PlayerKnockedDown ||
        e.name === GameEventNames.PlayerMoved
          ? z.object({ playerId: z.string() }).parse(e.data).playerId
          : undefined;
      if (
        e.name === GameEventNames.PlayerKnockedDown &&
        id !== fixtureValue(fanatic).id
      )
        return [`down ${String(name(fixtureValue(id)))}`];
      if (
        e.name === GameEventNames.PlayerMoved &&
        id !== fixtureValue(fanatic).id
      )
        return [`pushed ${String(name(fixtureValue(id)))}`];
      if (e.name !== GameEventNames.DiceRoll) return [];
      const roll = z
        .object({ description: z.string() })
        .parse(e.data).description;

      if (roll.startsWith("Ball & Chain Deviation"))
        return [`lurch ${roll.slice(roll.indexOf(":") + 2)}`];
      const match = /^(Armour|Injury) Roll \(([^)]+)\)/.exec(roll);
      return match
        ? [`${fixtureValue(match[1]).toLowerCase()} ${String(match[2])}`]
        : [];
    });
  return {
    trail,
    proneAtStart:
      status === PlayerStatus.PRONE
        ? game.ctx.team2.players.slice(0, 6).map((p) => p.playerName)
        : [],
    fanatic: fixtureValue(fanatic).playerName,
    turnedOver: game.snapshot().activeTeamId !== before.activeTeamId,
    violations: checkInvariants(
      before,
      game.snapshot(),
      fixtureValue(response).pendingDecision !== null
    ),
  };
}

function unresolvedHit(trail: string[], proneAtStart: string[]): string | null {
  const down = new Set(proneAtStart);
  const owed = new Set<string>();
  let pushedDown: string | null = null;
  for (const step of trail) {
    if (step.startsWith("lurch")) {
      if (owed.size > 0) return fixtureValue([...owed][0]);
      if (pushedDown) return pushedDown;
      continue;
    }
    const [kind, ...rest] = step.split(" ");
    const who = rest.join(" ");
    if (kind === "down") {
      down.add(who);
      owed.add(who);
    } else if (kind === "pushed" && down.has(who)) pushedDown = who;
    else if (kind === "armour") {
      owed.delete(who);
      if (pushedDown === who) pushedDown = null;
    }
  }

  return owed.size > 0 ? fixtureValue([...owed][0]) : pushedDown;
}

describe("a Ball & Chain lurch through a pile of players", () => {
  it("rolls each Prone player's Armour before the Fanatic moves on", async () => {
    let hitTwice = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { trail, proneAtStart, violations } = await lurch(
        seed,
        PlayerStatus.PRONE
      );
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(
        unresolvedHit(trail, proneAtStart),
        `seed ${String(seed)}`
      ).toBeNull();
      expect(violations, `seed ${String(seed)}`).toEqual([]);
    }

    expect(hitTwice).toBeGreaterThanOrEqual(5);
  });

  it("chain-pushes a boxed-in Prone player, then rolls their Armour", async () => {
    let boxedIn = 0;
    for (let seed = 1; seed <= 150 && boxedIn < 3; seed++) {
      const [first, ...rest] = (await lurch(seed, PlayerStatus.PRONE)).trail;
      if (first !== "lurch 3" && first !== "lurch 4") continue;
      boxedIn++;

      const next = rest.findIndex((step) => step.startsWith("lurch"));
      expect(next, `seed ${String(seed)}`).toBeGreaterThanOrEqual(0);
      const square = rest
        .slice(0, next)
        .filter((step) => !step.startsWith("injury"));
      expect(square, `seed ${String(seed)}`).toEqual([
        "pushed Human Lineman #5",
        "pushed Human Lineman #2",
        "armour Human Lineman #2",
      ]);
    }
    expect(boxedIn).toBe(3);
  });

  it("blocks Standing players one square at a time, and falls last", async () => {
    let hitTwice = 0;
    let fellAfterHitting = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { trail, proneAtStart, fanatic, turnedOver, violations } =
        await lurch(seed, PlayerStatus.ACTIVE, RosterName.OGRE);
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(
        unresolvedHit(trail, proneAtStart),
        `seed ${String(seed)}`
      ).toBeNull();
      expect(violations, `seed ${String(seed)}`).toEqual([]);

      const fell = trail.indexOf(`injury ${fanatic}`);
      if (fell === -1 || armoured.length === 0) continue;
      fellAfterHitting++;

      expect(trail.slice(fell + 1), `seed ${String(seed)}`).toEqual([]);
      expect(turnedOver, `seed ${String(seed)}`).toBe(true);
    }
    expect(hitTwice).toBeGreaterThanOrEqual(2);
    expect(fellAfterHitting).toBeGreaterThanOrEqual(2);
  });

  async function lurchToScore(
    seed: number,
    team2Placements: PlayerPlacement[],
    team2Roster?: RosterName
  ) {
    const game = new HeadlessGame({
      seed,
      scenario: {
        id: "ball-and-chain-score",
        name: "Ball & Chain knocks the ball into the End Zone",
        description: "",
        setup: {
          ...config.setup,
          team1Placements: [
            { playerIndex: FANATIC, x: 17, y: 5 },
            { playerIndex: 0, x: 19, y: 4 },
            { playerIndex: 1, x: 19, y: 5 },
            { playerIndex: 2, x: 19, y: 6 },
          ],
          ...(team2Roster === undefined ? {} : { team2Roster: team2Roster }),
          team2Placements,
          ballPosition: { x: 18, y: 5 },
        },
      },
    });
    const fanatic = game.ctx.team1.players[FANATIC];
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(fanatic).id,
      action: "ballAndChain",
    });
    const before = game.snapshot();
    const responses = await lurchAll(game, fixtureValue(fanatic).id);
    const response = {
      ...responses.at(-1),
      events: responses.flatMap((r) => r.events),
    };
    const scoredAt = response.events.findIndex(
      (e) => e.name === GameEventNames.Touchdown
    );
    if (scoredAt === -1) return null;

    expect(
      fixtureValue(fanatic).gridPosition,
      `seed ${String(seed)}`
    ).toBeUndefined();
    expect(
      checkInvariants(
        before,
        game.snapshot(),
        response.pendingDecision !== null
      ),
      `seed ${String(seed)}`
    ).toEqual([]);

    const afterwards = response.events.slice(scoredAt + 1);
    expect(
      afterwards.some(
        (e) =>
          (e.name === GameEventNames.PlayerMoved &&
            z.object({ playerId: z.string() }).parse(e.data).playerId ===
              fixtureValue(fanatic).id) ||
          (e.name === GameEventNames.DiceRoll &&
            z
              .object({ description: z.string() })
              .parse(e.data)
              .description.startsWith("Ball & Chain Deviation"))
      ),
      `seed ${String(seed)}`
    ).toBe(false);
    return {
      events: response.events,
      scoredAt,
      fanatic: fixtureValue(fanatic).playerName,
    };
  }

  it("stops when a loose ball it lurches onto is caught for a touchdown", async () => {
    let scored = 0;
    for (let seed = 1; seed <= 300 && scored < 3; seed++)
      if (await lurchToScore(seed, [{ playerIndex: 0, x: 2, y: 9 }])) scored++;
    expect(scored).toBe(3);
  });

  it("rolls a knocked-down carrier's Armour, then stops when the bounce scores", async () => {
    let scored = 0;
    for (let seed = 1; seed <= 400 && scored < 3; seed++) {
      const run = await lurchToScore(seed, [{ playerIndex: 0, x: 18, y: 5 }]);
      if (!run) continue;
      scored++;
      const armour = run.events.findIndex(
        (e) =>
          e.name === GameEventNames.DiceRoll &&
          z
            .object({ description: z.string() })
            .parse(e.data)
            .description.startsWith("Armour Roll (Human Lineman #1)")
      );
      expect(armour, `seed ${String(seed)}`).toBeGreaterThanOrEqual(0);
      expect(armour, `seed ${String(seed)}`).toBeLessThan(run.scoredAt);
    }
    expect(scored).toBe(3);
  });

  it("on Both Down, rolls the Fanatic's injury before the dropped ball scores", async () => {
    let scored = 0;
    for (let seed = 1; seed <= 4000 && scored < 2; seed++) {
      const run = await lurchToScore(
        seed,
        [{ playerIndex: 0, x: 18, y: 5 }],
        RosterName.OGRE
      );
      if (!run) continue;
      const injury = run.events.findIndex(
        (e) =>
          e.name === GameEventNames.DiceRoll &&
          z
            .object({ description: z.string() })
            .parse(e.data)
            .description.startsWith(`Injury Roll (${run.fanatic})`)
      );
      if (injury === -1) continue;
      scored++;
      expect(injury, `seed ${String(seed)}`).toBeLessThan(run.scoredAt);
    }
    expect(scored).toBe(2);
  });
});
