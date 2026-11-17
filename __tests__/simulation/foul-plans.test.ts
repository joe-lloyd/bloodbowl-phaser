import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { availableActions } from "../../src/simulation/ai/planner";
import { activations } from "../../src/simulation/ai/activations";
import { readBoard } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { foulOdds } from "../../src/simulation/ai/foulActivations";

/** Exact odds over 36 Armour and 36 Injury faces, out of 1,296. */
const of1296 = (n: number) => n / 1296;

describe("foul odds", () => {
  const game = new HeadlessGame({ seed: 1 });
  const [fouler] = game.ctx.team1.players;
  const [target] = game.ctx.team2.players;
  const av9 = { ...target, stats: { ...target.stats, AV: 9 }, skills: [] };
  const plain = { ...fouler, skills: [] };

  it("prices an unassisted foul on AV 9+ face by face", () => {
    // Armour breaks on 9+, 10 faces. A casualty then needs 10+ (6 faces), a
    // KO 8 or 9 (9 faces). Spotted: 4 unbroken doubles, 2 broken doubles,
    // and an Injury double after the other 8 breaks.
    const odds = foulOdds(plain, av9, 0);
    expect(odds.casualty).toBeCloseTo(of1296(60), 12);
    expect(odds.ko).toBeCloseTo(of1296(90), 12);
    expect(odds.sentOff).toBeCloseTo(of1296(144 + 72 + 48), 12);
  });

  it("lets a Sneaky Git off an unbroken double", () => {
    const git = {
      ...plain,
      skills: [{ type: SkillType.SNEAKY_GIT }],
    } as typeof plain;
    expect(foulOdds(git, av9, 0).sentOff).toBeCloseTo(of1296(72 + 48), 12);
  });

  it("breaks more armour with each assist", () => {
    expect(foulOdds(plain, av9, 2).casualty).toBeGreaterThan(
      foulOdds(plain, av9, 0).casualty
    );
  });
});

/** An Ogre team beside a Prone opponent, with the ball far away. */
async function foulValues(fouler: PlayerPlacement) {
  const subject = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-plan",
      name: "Who fouls",
      description: "",
      setup: {
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        activeTeam: "team1",
        turn: 2,
        team1Roster: RosterName.OGRE,
        teamRerolls: { team1: 0, team2: 0 },
        team1Placements: [
          fouler,
          // Two Ogres beside the target give the Foul its assists.
          { playerIndex: 1, x: 11, y: 4 },
          { playerIndex: 2, x: 11, y: 6 },
        ],
        team2Placements: [
          { playerIndex: 0, x: 10, y: 5, status: PlayerStatus.PRONE },
          { playerIndex: 1, x: 16, y: 2, hasBall: true },
        ],
      },
    },
  });
  const point = await enumerateDecision(subject, null);
  const plans = activations(
    readBoard(subject, "team1"),
    DEFAULT_WEIGHTS,
    availableActions(point.candidates)
  ).filter(
    (a) =>
      a.action === "foul" &&
      a.player.id === subject.ctx.team1.players[fouler.playerIndex].id
  );
  return plans[0]?.value ?? null;
}

describe("who fouls", () => {
  it("prices a Gnoblar's foul well above a big guy's from the same square", async () => {
    // On the Ogre roster player 0 is an Ogre Blocker and player 3 a Gnoblar.
    const ogre = await foulValues({ playerIndex: 0, x: 9, y: 5 });
    const gnoblar = await foulValues({ playerIndex: 3, x: 9, y: 5 });

    expect(gnoblar).not.toBeNull();
    expect(gnoblar!).toBeGreaterThan(0);
    // A big guy Sent-off is far too costly to risk: no foul worth offering.
    expect(ogre).toBeNull();
  });
});
