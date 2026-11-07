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
  // Each square the Fanatic lurches into, and each Armour and Injury Roll,
  // in order
  const trail = response.events.flatMap((e) => {
    const roll = (e.data as { description?: string }).description ?? "";
    if (e.name !== GameEventNames.DiceRoll) return [];
    if (roll.startsWith("Ball & Chain Deviation")) return ["lurch"];
    const match = /^(Armour|Injury) Roll \(([^)]+)\)/.exec(roll);
    return match ? [`${match[1].toLowerCase()} ${match[2]}`] : [];
  });
  return {
    trail,
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
 * A player rolled for twice with no lurch between: one square can hit a
 * player once, so the second roll belongs to a later square, and was held
 * back past the Fanatic's next move.
 */
function rolledTwiceForOneLurch(trail: string[]): string | null {
  const rolled = new Set<string>();
  for (const step of trail) {
    if (step === "lurch") rolled.clear();
    else if (step.startsWith("armour ")) {
      const who = step.slice("armour ".length);
      if (rolled.has(who)) return who;
      rolled.add(who);
    }
  }
  return null;
}

describe("a Ball & Chain lurch through a pile of players", () => {
  it("rolls each Prone player's Armour before the Fanatic moves on", async () => {
    let hitTwice = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const { trail, violations } = await lurch(seed, PlayerStatus.PRONE);
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(rolledTwiceForOneLurch(trail), `seed ${seed}`).toBeNull();
      expect(violations, `seed ${seed}`).toEqual([]);
    }
    // The pile is there to hit someone twice; make sure it does
    expect(hitTwice).toBeGreaterThanOrEqual(5);
  });

  it("blocks Standing players one square at a time, and falls last", async () => {
    // ST 5 Ogres give the ST 7 Fanatic two dice, so it sometimes falls
    let hitTwice = 0;
    let fellAfterHitting = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { trail, fanatic, turnedOver, violations } = await lurch(
        seed,
        PlayerStatus.ACTIVE,
        RosterName.OGRE
      );
      const armoured = trail.filter((t) => t.startsWith("armour "));
      if (armoured.length > new Set(armoured).size) hitTwice++;
      expect(rolledTwiceForOneLurch(trail), `seed ${seed}`).toBeNull();
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
});
