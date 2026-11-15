import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import {
  HeadlessCommand,
  PendingDecision,
} from "../../../src/headless/protocol";
import { stabilizeIds } from "../../../src/headless/createHeadlessGame";
import { PlayerStatus } from "../../../src/types/Player";
import { createReadyMadeTeam } from "../../../src/simulation/lineups";
import { GamePhase, SubPhase } from "../../../src/types/GameState";
import { SkillType } from "../../../src/types/Skills";
import { RosterName } from "../../../src/types/Team";
import {
  Answer,
  SEEDS,
  acceptAll,
  acrossSeeds,
  playOut,
  skipKickoffEvent,
  turnGame,
} from "./eventOrder";

/**
 * The literal events of the Block, ball and setup managers, across seeds
 * that reach their branches.
 */

const SPARE = { x: 2, y: 12 };

/** A touchback goes to the receiving team's first Standing player. */
function touchbackToFirstStanding(
  game: HeadlessGame,
  pending: PendingDecision
): HeadlessCommand | undefined {
  if (pending.type !== "touchback") return undefined;
  const team = [game.ctx.team1, game.ctx.team2].find(
    (candidate) => candidate.id === pending.teamId
  );
  const receiver = team?.players.find(
    (p) => p.gridPosition && p.status === PlayerStatus.ACTIVE
  );
  if (!receiver) throw new Error("a touchback with nobody to take it");
  return { type: "touchback", playerId: receiver.id };
}

/** Take the Both Down whenever the dice offer one, else as acceptAll. */
const bothDown: Answer = (pending: PendingDecision) => {
  if (pending.type !== "block-dice" || pending.choiceStage !== "pick") {
    return acceptAll(pending);
  }
  const index = pending.options.findIndex((o) => o.type === "both-down");
  return { type: "choose-block-result", index: Math.max(0, index) };
};

async function block(
  seed: number,
  attackerSkills: SkillType[],
  defenderSkills: SkillType[],
  answer: Answer
): Promise<string[]> {
  const game = turnGame(
    seed,
    [{ x: 10, y: 5, skills: attackerSkills, stats: { ST: 4 } }, SPARE],
    [
      { x: 11, y: 5, skills: defenderSkills },
      { x: 12, y: 7 },
    ],
    { x: 11, y: 5 }
  );
  const [attacker] = game.ctx.team1.players;
  const [defender] = game.ctx.team2.players;
  return playOut(
    game,
    [
      { type: "declare-action", playerId: attacker.id, action: "block" },
      { type: "block", attackerId: attacker.id, defenderId: defender.id },
    ],
    answer
  );
}

describe("manager events keep their order", () => {
  for (const variant of [
    { name: "plain", attacker: [], defender: [] },
    {
      name: "Wrestle and Steady Footing",
      attacker: [SkillType.STEADY_FOOTING],
      defender: [SkillType.WRESTLE],
    },
    {
      name: "Block and Pile Driver",
      attacker: [SkillType.BLOCK, SkillType.PILE_DRIVER],
      defender: [],
    },
  ]) {
    it(`Both Down: ${variant.name}`, async () => {
      const bySeed = await acrossSeeds(SEEDS, (seed) =>
        block(seed, variant.attacker, variant.defender, bothDown)
      );
      expect(bySeed).toMatchSnapshot();
    });
  }

  it("a Block on a Trickster", async () => {
    const bySeed = await acrossSeeds(SEEDS, (seed) =>
      block(seed, [], [SkillType.TRICKSTER], acceptAll)
    );
    expect(bySeed).toMatchSnapshot();
  });

  it("a kick-off with On the Ball", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = new HeadlessGame({
        seed,
        scenario: {
          id: "kickoff-on-the-ball",
          name: "kickoff-on-the-ball",
          description: "",
          setup: {
            team1Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
              playerIndex,
              x: 5,
              y: playerIndex + 2,
            })),
            team2Placements: Array.from({ length: 7 }, (_, playerIndex) => ({
              playerIndex,
              x: 14,
              y: playerIndex + 2,
              skills: playerIndex === 3 ? [SkillType.ON_THE_BALL] : [],
            })),
            activeTeam: "team2",
            turn: 2,
            phase: GamePhase.KICKOFF,
            subPhase: SubPhase.ROLL_KICKOFF,
          },
        },
      });
      game.ctx.gameService.seedTurnCounts(2);
      return playOut(
        game,
        [
          {
            type: "kick-ball",
            playerId: game.ctx.team1.players[0].id,
            x: 16,
            y: 1,
          },
        ],
        (pending) =>
          skipKickoffEvent(pending) ??
          touchbackToFirstStanding(game, pending) ??
          acceptAll(pending)
      );
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("a pass scattered off the pitch is thrown in", async () => {
    const bySeed = await acrossSeeds(SEEDS, async (seed) => {
      const game = turnGame(seed, [{ x: 6, y: 1 }, SPARE], [{ x: 15, y: 9 }], {
        x: 6,
        y: 1,
      });
      const [passer] = game.ctx.team1.players;
      return playOut(game, [
        { type: "declare-action", playerId: passer.id, action: "pass" },
        { type: "pass", playerId: passer.id, x: 9, y: 0 },
      ]);
    });
    expect(bySeed).toMatchSnapshot();
  });

  it("setup swaps", async () => {
    const game = new HeadlessGame({
      seed: 1,
      // Ready-made ids embed the clock; pin them so the trace is stable.
      team1: stabilizeIds(
        createReadyMadeTeam(RosterName.HUMAN, "Home", 1),
        "team1"
      ),
      team2: stabilizeIds(
        createReadyMadeTeam(RosterName.ORC, "Away", 2),
        "team2"
      ),
    });
    const [a, b, c] = game.ctx.team1.players;
    const order = await playOut(game, [
      { type: "start-setup", kickingTeamId: game.ctx.team1.id },
      { type: "place-player", playerId: a.id, x: 4, y: 5 },
      { type: "place-player", playerId: b.id, x: 4, y: 6 },
      { type: "swap-players", player1Id: a.id, player2Id: b.id },
      { type: "swap-players", player1Id: a.id, player2Id: c.id },
      { type: "swap-players", player1Id: c.id, player2Id: a.id },
    ]);
    expect(order).toMatchSnapshot();
  });
});
