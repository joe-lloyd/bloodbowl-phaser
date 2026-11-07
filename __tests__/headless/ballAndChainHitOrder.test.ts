/**
 * A Ball & Chain lurch resolves each square before the next (2025 rulebook,
 * Ball & Chain): the Block or the Push, the Armour Roll and any Injury all
 * come to rest before the Fanatic moves on. The rolls used to wait until the
 * whole lurch was over, so a player hit twice could be Knocked Out by the
 * first roll and then left off the pitch, Stunned, by the second.
 */
import { describe, expect, it } from "vitest";
import { TRAIT_RULE_SCENARIOS } from "../../src/data/ruleScenarios/traits";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { checkInvariants } from "../../src/simulation/invariants";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { PlayerPlacement } from "../../src/types/Scenario";

const config = TRAIT_RULE_SCENARIOS.find(
  (e) => e.skill === SkillType.BALL_AND_CHAIN
)!.configs.find((c) => c.id === "ball-and-chain-block")!;
const FANATIC = config.setup.team1Placements[0].playerIndex;

/** Six opponents packed in front of the Fanatic, which lurches at them. */
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
        team2Roster,
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
    playerId: fanatic.id,
    action: "ballAndChain",
  });
  const before = game.snapshot();
  const response = await game.execute({
    type: "ball-and-chain",
    playerId: fanatic.id,
    x: 1,
    y: 0,
  });
  // In order: each square the Fanatic lurches into, each player it knocks
  // down or pushes, and each Armour and Injury Roll
  const name = (id: string) =>
    [...game.ctx.team1.players, ...game.ctx.team2.players].find(
      (p) => p.id === id
    )?.playerName;
  const trail = response.events.flatMap((e) => {
    const id = (e.data as { playerId?: string }).playerId;
    if (e.name === GameEventNames.PlayerKnockedDown && id !== fanatic.id)
      return [`down ${name(id!)}`];
    if (e.name === GameEventNames.PlayerMoved && id !== fanatic.id)
      return [`pushed ${name(id!)}`];
    const roll = (e.data as { description?: string }).description ?? "";
    if (e.name !== GameEventNames.DiceRoll) return [];
    // "lurch 3": the deviation die, 3 or 4 straight on
    if (roll.startsWith("Ball & Chain Deviation"))
      return [`lurch ${roll.slice(roll.indexOf(":") + 2)}`];
    const match = /^(Armour|Injury) Roll \(([^)]+)\)/.exec(roll);
    return match ? [`${match[1].toLowerCase()} ${match[2]}`] : [];
  });
  return {
    trail,
    proneAtStart:
      status === PlayerStatus.PRONE
        ? game.ctx.team2.players.slice(0, 6).map((p) => p.playerName)
        : [],
    fanatic: fanatic.playerName,
    turnedOver: game.snapshot().activeTeamId !== before.activeTeamId,
    violations: checkInvariants(
      before,
      game.snapshot(),
      response.pendingDecision !== null
    ),
  };
}

/**
 * A player the Fanatic hit whose Armour Roll had not come by its next
 * lurch, or by the end. A knockdown owes one, and so does a push of a player already
 * down; pushing a Standing player does not.
 */
function unresolvedHit(trail: string[], proneAtStart: string[]): string | null {
  const down = new Set(proneAtStart);
  const owed = new Set<string>();
  for (const step of trail) {
    if (step.startsWith("lurch")) {
      if (owed.size > 0) return [...owed][0];
      continue;
    }
    const [kind, ...rest] = step.split(" ");
    const who = rest.join(" ");
    if (kind === "down") {
      down.add(who);
      owed.add(who);
    } else if (kind === "pushed" && down.has(who)) owed.add(who);
    else if (kind === "armour") owed.delete(who);
  }
  // The last hit too, a fall straight after it included
  return owed.size > 0 ? [...owed][0] : null;
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
      expect(unresolvedHit(trail, proneAtStart), `seed ${seed}`).toBeNull();
      expect(violations, `seed ${seed}`).toEqual([]);
    }
    // The pile is there to hit someone twice; make sure it does
    expect(hitTwice).toBeGreaterThanOrEqual(5);
  });

  it("rolls Armour for a Prone player with nowhere to be pushed", async () => {
    // A straight first lurch hits (11,5). The row behind is full, so the
    // player stays put, and the Armour Roll comes before the next lurch.
    let boxedIn = 0;
    for (let seed = 1; seed <= 150 && boxedIn < 3; seed++) {
      const [first, ...rest] = (await lurch(seed, PlayerStatus.PRONE)).trail;
      if (first !== "lurch 3" && first !== "lurch 4") continue;
      boxedIn++;
      // Hitting a Prone player never ends the lurch: the Fanatic goes on
      const next = rest.findIndex((step) => step.startsWith("lurch"));
      expect(next, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      const square = rest.slice(0, next);
      expect(square, `seed ${seed}`).toContain("armour Human Lineman #2");
      expect(square, `seed ${seed}`).not.toContain("pushed Human Lineman #2");
    }
    expect(boxedIn).toBe(3);
  });

  it("blocks Standing players one square at a time, and falls last", async () => {
    // ST 5 Ogres give the ST 7 Fanatic two dice, so it sometimes falls
    let hitTwice = 0;
    let fellAfterHitting = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { trail, proneAtStart, fanatic, turnedOver, violations } =
        await lurch(seed, PlayerStatus.ACTIVE, RosterName.OGRE);
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(unresolvedHit(trail, proneAtStart), `seed ${seed}`).toBeNull();
      expect(violations, `seed ${seed}`).toEqual([]);

      const fell = trail.indexOf(`injury ${fanatic}`);
      if (fell < 0 || armoured.length === 0) continue;
      fellAfterHitting++;
      // The hits before the fall are all settled before the Fanatic's
      // Injury Roll, and the fall ends the turn.
      expect(trail.slice(fell + 1), `seed ${seed}`).toEqual([]);
      expect(turnedOver, `seed ${seed}`).toBe(true);
    }
    expect(hitTwice).toBeGreaterThanOrEqual(2);
    expect(fellAfterHitting).toBeGreaterThanOrEqual(2);
  });

  /**
   * The Fanatic lurches East from (17,5) with team-mates waiting in their
   * End Zone at x = 19, where team 1 scores; null unless a touchdown came.
   */
  async function lurchToScore(
    seed: number,
    team2Placements: PlayerPlacement[]
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
          team2Placements,
          ballPosition: { x: 18, y: 5 },
        },
      },
    });
    const fanatic = game.ctx.team1.players[FANATIC];
    await game.execute({
      type: "declare-action",
      playerId: fanatic.id,
      action: "ballAndChain",
    });
    const before = game.snapshot();
    const response = await game.execute({
      type: "ball-and-chain",
      playerId: fanatic.id,
      x: 1,
      y: 0,
    });
    const scoredAt = response.events.findIndex(
      (e) => e.name === GameEventNames.Touchdown
    );
    if (scoredAt < 0) return null;
    // The drive is over: the Fanatic goes back with everyone else
    expect(fanatic.gridPosition, `seed ${seed}`).toBeUndefined();
    expect(
      checkInvariants(
        before,
        game.snapshot(),
        response.pendingDecision !== null
      ),
      `seed ${seed}`
    ).toEqual([]);
    // Nothing of the lurch comes after the touchdown
    const afterwards = response.events.slice(scoredAt + 1);
    expect(
      afterwards.some(
        (e) =>
          (e.name === GameEventNames.PlayerMoved &&
            (e.data as { playerId: string }).playerId === fanatic.id) ||
          (e.name === GameEventNames.DiceRoll &&
            (e.data as { description: string }).description.startsWith(
              "Ball & Chain Deviation"
            ))
      ),
      `seed ${seed}`
    ).toBe(false);
    return { events: response.events, scoredAt };
  }

  it("stops when a loose ball it lurches onto is caught for a touchdown", async () => {
    let scored = 0;
    for (let seed = 1; seed <= 300 && scored < 3; seed++)
      if (await lurchToScore(seed, [{ playerIndex: 0, x: 2, y: 9 }])) scored++;
    expect(scored).toBe(3);
  });

  it("rolls a knocked-down carrier's Armour, then stops when the bounce scores", async () => {
    // Knocked Down: the Armour Roll, then the carried ball Bounces (2025
    // rulebook), so the roll is made before the touchdown it leads to
    let scored = 0;
    for (let seed = 1; seed <= 400 && scored < 3; seed++) {
      const run = await lurchToScore(seed, [{ playerIndex: 0, x: 18, y: 5 }]);
      if (!run) continue;
      scored++;
      const armour = run.events.findIndex(
        (e) =>
          e.name === GameEventNames.DiceRoll &&
          (e.data as { description: string }).description.startsWith(
            "Armour Roll (Human Lineman #1)"
          )
      );
      expect(armour, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(armour, `seed ${seed}`).toBeLessThan(run.scoredAt);
    }
    expect(scored).toBe(3);
  });
});
