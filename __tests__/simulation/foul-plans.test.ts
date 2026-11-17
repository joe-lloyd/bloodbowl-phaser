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
  const alone = { modifier: 0, none: true };

  it("prices an unassisted foul on AV 9+ face by face", () => {
    // Armour breaks on 9+, 10 faces. A casualty then needs 10+ (6 faces), a
    // KO 8 or 9 (9 faces). Spotted: 4 unbroken doubles, 2 broken doubles,
    // and an Injury double after the other 8 breaks.
    const odds = foulOdds(plain, av9, alone);
    expect(odds.casualty).toBeCloseTo(of1296(60), 12);
    expect(odds.ko).toBeCloseTo(of1296(90), 12);
    expect(odds.spotted).toBeCloseTo(of1296(144 + 72 + 48), 12);
  });

  it("lets a Sneaky Git off an unbroken double", () => {
    const git = {
      ...plain,
      skills: [{ type: SkillType.SNEAKY_GIT }],
    } as typeof plain;
    expect(foulOdds(git, av9, alone).spotted).toBeCloseTo(of1296(72 + 48), 12);
  });

  it("gives Lone Fouler its re-roll only with no assists on either side", () => {
    const lone = {
      ...plain,
      skills: [{ type: SkillType.LONE_FOULER }],
    } as typeof plain;
    const cancelled = { modifier: 0, none: false };
    expect(foulOdds(lone, av9, cancelled).casualty).toBeCloseTo(of1296(60), 12);
    expect(foulOdds(lone, av9, alone).casualty).toBeGreaterThan(of1296(60));
  });

  it("breaks more armour with each assist", () => {
    expect(
      foulOdds(plain, av9, { modifier: 2, none: false }).casualty
    ).toBeGreaterThan(foulOdds(plain, av9, alone).casualty);
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

  it("fouls alone with an Orc Lineman, since an argued call often keeps it on the pitch", async () => {
    // No assists, a skill-free AV 8 target. A spotted Foul still costs the
    // turn, but the 5+ argument keeps the Lineman a third of the time.
    const subject = new HeadlessGame({
      seed: 1,
      scenario: {
        id: "lone-foul",
        name: "A lone foul",
        description: "",
        setup: {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          activeTeam: "team1",
          turn: 2,
          team1Roster: RosterName.ORC,
          teamRerolls: { team1: 0, team2: 0 },
          team1Placements: [{ playerIndex: 0, x: 9, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 8 },
              skills: [],
            },
            { playerIndex: 1, x: 16, y: 2, hasBall: true },
          ],
        },
      },
    });
    const point = await enumerateDecision(subject, null);

    const fouls = activations(
      readBoard(subject, "team1"),
      DEFAULT_WEIGHTS,
      availableActions(point.candidates)
    ).filter((a) => a.action === "foul");

    expect(fouls).toHaveLength(1);
    expect(fouls[0].value).toBeCloseTo(1.574, 3);
  });
});
