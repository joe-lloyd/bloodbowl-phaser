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

const config = TRAIT_RULE_SCENARIOS.find(
  (e) => e.skill === SkillType.BALL_AND_CHAIN
)!.configs.find((c) => c.id === "ball-and-chain-block")!;
const FANATIC = config.setup.team1Placements[0].playerIndex;

/** Six Prone opponents packed in front of the Fanatic, which faces them. */
async function lurch(seed: number) {
  const prone = (playerIndex: number, x: number, y: number) => ({
    playerIndex,
    x,
    y,
    status: PlayerStatus.PRONE,
  });
  const game = new HeadlessGame({
    seed,
    scenario: {
      id: "ball-and-chain-pile",
      name: "Ball & Chain into a pile",
      description: "",
      setup: {
        ...config.setup,
        team2Placements: [
          prone(0, 11, 4),
          prone(1, 11, 5),
          prone(2, 11, 6),
          prone(3, 12, 4),
          prone(4, 12, 5),
          prone(5, 12, 6),
        ],
      },
    },
  });
  const fanaticId = game.ctx.team1.players[FANATIC].id;
  await game.execute({
    type: "declare-action",
    playerId: fanaticId,
    action: "ballAndChain",
  });
  const before = game.snapshot();
  const response = await game.execute({
    type: "ball-and-chain",
    playerId: fanaticId,
    x: 1,
    y: 0,
  });
  // Each player's Armour Rolls and pushes, in the order they happened
  const name = (id: string) =>
    [...game.ctx.team1.players, ...game.ctx.team2.players].find(
      (p) => p.id === id
    )?.playerName;
  const trail = response.events.flatMap((e) => {
    if (e.name === GameEventNames.PlayerMoved) {
      const who = name((e.data as { playerId: string }).playerId);
      return who ? [`pushed ${who}`] : [];
    }
    const roll = (e.data as { description?: string }).description ?? "";
    return e.name === GameEventNames.DiceRoll &&
      roll.startsWith("Armour Roll (")
      ? [`armour ${roll.slice("Armour Roll (".length, roll.indexOf(")"))}`]
      : [];
  });
  return {
    trail,
    violations: checkInvariants(
      before,
      game.snapshot(),
      response.pendingDecision !== null
    ),
  };
}

/** A player whose second Armour Roll came with no push since the first. */
function rolledTwiceForOneHit(trail: string[]): string | null {
  const since = new Map<string, boolean>();
  for (const step of trail) {
    const [kind, ...rest] = step.split(" ");
    const who = rest.join(" ");
    if (kind === "pushed") since.set(who, true);
    else if (since.get(who) === false) return who;
    else if (kind === "armour") since.set(who, false);
  }
  return null;
}

describe("a Ball & Chain lurch through a pile of players", () => {
  it("rolls each hit's Armour before the Fanatic moves on", async () => {
    let hitTwice = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { trail, violations } = await lurch(seed);
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(rolledTwiceForOneHit(trail), `seed ${seed}`).toBeNull();
      expect(violations, `seed ${seed}`).toEqual([]);
    }
    // The pile is there to hit someone twice; make sure it does
    expect(hitTwice).toBeGreaterThanOrEqual(5);
  });
});
