import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { ActionType } from "../../src/types/events";
import type { CommandResponse, EmittedEvent } from "../../src/headless/protocol";

/**
 * Pile Driver (2025 rulebook p.133): "When an opposition player is Knocked
 * Down by this player during a Block Action, this player may perform a free
 * Foul Action against the opposition player so long as they are still
 * Standing and are still Marking the opposition player. This player is then
 * Placed Prone and their activation immediately ends." The free Foul is the
 * coach's choice, on a Block and on a Blitz alike.
 */

const scenario: Scenario = {
  id: "pile-driver",
  name: "Pile Driver",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PILE_DRIVER] },
      // A spare player keeps team1's turn open after the activation.
      { playerIndex: 1, x: 2, y: 12 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

/** One block die, a POW; armour 1+3 holds; the free Foul's armour 1+5 holds. */
const POW_SEED = 3;

async function knockDownAndFollowUp(action: ActionType) {
  const game = new HeadlessGame({ scenario, seed: POW_SEED });
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const attacker = game.ctx.team1.players[0];
  const defender = game.ctx.team2.players[0];
  await run({ type: "declare-action", playerId: attacker.id, action });
  await run({ type: "block", attackerId: attacker.id, defenderId: defender.id });
  await run({ type: "choose-block-result", index: 0 });
  await run({ type: "choose-push-direction", x: 12, y: 5 });
  const offer = await run({ type: "choose-follow-up", followUp: true });
  const dice = () =>
    events
      .filter((e) => e.name === "diceRoll")
      .map((e) => (e.data as { description: string }).description);
  return { game, run, dice, offer, attacker, defender };
}

const BLOCK_DICE = [
  "Rolled 1 block dice: pow",
  "Armour Roll (Human Lineman #1): 1 + 3 = 4",
];

describe("Pile Driver", () => {
  for (const action of ["block", "blitz"] as const) {
    it(`is offered after a ${action} knocks the target down`, async () => {
      const { offer, attacker } = await knockDownAndFollowUp(action);

      expect(offer.pendingDecision).toMatchObject({
        type: "reaction",
        playerId: attacker.id,
        chooserTeamId: "team1",
        skill: SkillType.PILE_DRIVER,
      });
    });

    it(`fouls and lies the player down when accepted on a ${action}`, async () => {
      const { run, dice, attacker, defender } =
        await knockDownAndFollowUp(action);

      const response = await run({ type: "use-reaction", accept: true });

      expect(dice()).toEqual([
        ...BLOCK_DICE,
        "Human Lineman #1 Armor Check: 1+5 = 6 (AV: 9)",
      ]);
      expect(attacker.status).toBe(PlayerStatus.PRONE);
      expect(defender.status).toBe(PlayerStatus.PRONE);
      expect(response.snapshot.activePlayer).toBeNull();
    });
  }

  it("ends a declined Block's activation with the player on their feet", async () => {
    const { run, dice, attacker } = await knockDownAndFollowUp("block");

    const response = await run({ type: "use-reaction", accept: false });

    expect(dice()).toEqual(BLOCK_DICE);
    expect(attacker.status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activePlayer).toBeNull();
  });

  it("lets a declined Blitz keep moving", async () => {
    const { run, dice, attacker } = await knockDownAndFollowUp("blitz");

    const response = await run({ type: "use-reaction", accept: false });

    expect(dice()).toEqual(BLOCK_DICE);
    expect(attacker.status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activePlayer).toMatchObject({
      id: attacker.id,
      action: "blitz",
    });
  });
});
