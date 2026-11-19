import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";
import { RosterName } from "../../src/types/Team";
import type { PlayerPlacement } from "../../src/types/Scenario";
import { enumerateDecision } from "../../src/simulation/candidates";
import { availableActions } from "../../src/simulation/ai/planner";
import { activations } from "../../src/simulation/ai/activations";
import { readBoard } from "../../src/simulation/ai/board";
import { DEFAULT_WEIGHTS } from "../../src/simulation/ai/weights";
import { foulOdds } from "../../src/simulation/ai/foulActivations";

const of1296 = (n: number) => n / 1296;

describe("foul odds", () => {
  const game = new HeadlessGame({ seed: 1 });
  const [fouler] = game.ctx.team1.players;
  const [target] = game.ctx.team2.players;
  const av9 = {
    ...fixtureValue(target),
    stats: { ...fixtureValue(target).stats, AV: 9 },
    skills: [],
  };
  const plain = { ...fixtureValue(fouler), skills: [] };
  const alone = { modifier: 0, none: true };

  it("prices an unassisted foul on AV 9+ face by face", () => {
    const odds = foulOdds(plain, av9, alone);
    expect(odds.casualty).toBeCloseTo(of1296(60), 12);
    expect(odds.ko).toBeCloseTo(of1296(90), 12);
    expect(odds.spotted).toBeCloseTo(of1296(144 + 72 + 48), 12);
  });

  it("lets a Sneaky Git off an unbroken double", () => {
    const git = {
      ...plain,
      skills: [getSkill(SkillType.SNEAKY_GIT)],
    };
    expect(foulOdds(git, av9, alone).spotted).toBeCloseTo(of1296(72 + 48), 12);
  });

  it("gives Lone Fouler its re-roll only with no assists on either side", () => {
    const lone = {
      ...plain,
      skills: [getSkill(SkillType.LONE_FOULER)],
    };
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

async function foulValues(
  fouler: PlayerPlacement,
  target: Partial<PlayerPlacement> = {},
  bribes = 0
) {
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
        bribes: { team1: bribes },
        team1Placements: [
          fouler,

          { playerIndex: 1, x: 11, y: 4 },
          { playerIndex: 2, x: 11, y: 6 },
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 10,
            y: 5,
            status: PlayerStatus.PRONE,
            ...target,
          },
          { playerIndex: 1, x: 16, y: 2, hasBall: true },
        ],
      },
    },
  });
  const point = await enumerateDecision(subject, null);
  const plans = activations({
    board: readBoard(subject, "team1"),
    w: DEFAULT_WEIGHTS,
    available: availableActions(point.candidates),
  }).filter(
    (a) =>
      a.action === "foul" &&
      a.player.id ===
        fixtureValue(subject.ctx.team1.players[fouler.playerIndex]).id
  );
  return plans[0]?.value ?? null;
}

describe("who fouls", () => {
  it("prices a Gnoblar's foul well above a big guy's from the same square", async () => {
    const ogre = await foulValues({ playerIndex: 0, x: 9, y: 5 });
    const gnoblar = await foulValues({ playerIndex: 3, x: 9, y: 5 });

    expect(gnoblar).not.toBeNull();
    expect(fixtureValue(gnoblar)).toBeGreaterThan(0);

    expect(ogre).toBeNull();
  });

  it("never offers a big guy a Foul, even with a Bribe and soft armour", async () => {
    const soft = { stats: { AV: 3 }, skills: [] };
    const gnoblar = await foulValues({ playerIndex: 3, x: 9, y: 5 }, soft, 1);
    const ogre = await foulValues({ playerIndex: 0, x: 9, y: 5 }, soft, 1);

    expect(gnoblar).toBeGreaterThan(10);
    expect(ogre).toBeNull();
  });

  it("fouls alone with an Orc Lineman, since an argued call often keeps it on the pitch", async () => {
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

    const fouls = activations({
      board: readBoard(subject, "team1"),
      w: DEFAULT_WEIGHTS,
      available: availableActions(point.candidates),
    }).filter((a) => a.action === "foul");

    expect(fouls).toHaveLength(1);
    expect(fixtureValue(fouls[0]).value).toBeCloseTo(1.574, 3);
  });

  it("fouls with a held Bribe, which keeps both the player and the turn", async () => {
    const subject = new HeadlessGame({
      seed: 1,
      scenario: {
        id: "bribed-foul",
        name: "A bribed foul",
        description: "",
        setup: {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
          activeTeam: "team1",
          turn: 2,
          team1Roster: RosterName.HUMAN,
          teamRerolls: { team1: 0, team2: 0 },
          bribes: { team1: 1 },
          team1Placements: [
            { playerIndex: 0, x: 9, y: 5 },
            { playerIndex: 1, x: 1, y: 1 },
            { playerIndex: 2, x: 1, y: 3 },
            { playerIndex: 3, x: 1, y: 7 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 9 },
              skills: [],
            },
            { playerIndex: 1, x: 16, y: 2, hasBall: true },
          ],
        },
      },
    });
    const point = await enumerateDecision(subject, null);
    const [fouler] = subject.ctx.team1.players;

    const fouls = activations({
      board: readBoard(subject, "team1"),
      w: DEFAULT_WEIGHTS,
      available: availableActions(point.candidates),
    }).filter(
      (a) => a.action === "foul" && a.player.id === fixtureValue(fouler).id
    );

    expect(fouls).toHaveLength(1);
    expect(fixtureValue(fouls[0]).value).toBeCloseTo(0.1502, 4);
  });
});
