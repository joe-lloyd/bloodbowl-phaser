import { describe, expect, it } from "vitest";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { enumerateDecision } from "../../src/simulation/candidates";
import type { Coach } from "../../src/simulation/coach";
import { plannerCoach } from "../../src/simulation/ai/planner";
import { createSearchCoach } from "../../src/simulation/ai/search";
import { randomCoach } from "../../src/simulation/coaches/random";
import { createCoachRng } from "../../src/simulation/rng";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { SkillType, getSkill } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { choose, rehearse } from "../headless/kickoffRehearsal";
import { kickoffScenario } from "../headless/kickoffKicks";

const LANDING = { x: 17, y: 5 };

const EVENTS = [
  KickoffEvent.CHARGE,
  KickoffEvent.BLITZ,
  KickoffEvent.ALERT_DEFENCE,
  KickoffEvent.QUICK_SNAP,
  KickoffEvent.GET_READY_LADS,
  KickoffEvent.HIGH_KICK,
];

type Square = [number, number];

function lineUp(home: Square[], away: Square[]): Scenario {
  const place = (squares: Square[]) =>
    squares.map(([x, y], playerIndex) => ({ playerIndex, x, y }));
  return {
    ...kickoffScenario,
    setup: {
      ...kickoffScenario.setup,
      team1Placements: place(home),
      team2Placements: place(away),
    },
  };
}

async function coachPlays(game: HeadlessGame, coach: Coach = plannerCoach) {
  const rng = createCoachRng(1);
  const commands: string[] = [];
  const notes: string[] = [];
  for (let i = 0; i < 80; i++) {
    const { kick } = game.ctx.gameService.getState();
    if (!kick?.step) break;
    const point = await enumerateDecision(game, "team1");
    const { index, note } = await coach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng,
    });
    const candidate = fixtureValue(point.candidates[index]);
    if (note) notes.push(note);
    for (const command of candidate.commands) {
      const response = await game.execute(command);
      expect(
        response.ok,
        `${candidate.label}: ${String(response.reason)}`
      ).toBe(true);
      commands.push(command.type);
    }
  }
  return {
    commands,
    notes,
    open: !!game.ctx.gameService.getState().kick?.step,
  };
}

const reach = (game: HeadlessGame) =>
  game.ctx.teams[0].players
    .flatMap(({ gridPosition }) => gridPosition ?? [])
    .map(({ x, y }) =>
      Math.max(Math.abs(x - LANDING.x), Math.abs(y - LANDING.y))
    )
    .reduce((sum, away) => sum + away, 0);

describe("the computer coach plays its kick-off moves", () => {
  it.each(EVENTS)("%s: plays it to the end without skipping", async (event) => {
    const { game } = await rehearse(event, { players: 3 });
    const { commands, notes, open } = await coachPlays(game);
    expect(open).toBe(false);
    expect(commands).not.toContain("kickoff-skip");
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.startsWith(`${event}: `))).toBe(true);
    expect(notes.join(',')).not.toMatch(/%|\d in \d/);
  });

  it("High Kick: places the player it had picked when the match resumes", async () => {
    const { game } = await rehearse(KickoffEvent.HIGH_KICK, { players: 1 });
    const point = await enumerateDecision(game, "team1");
    const { index } = await plannerCoach.choose({
      game,
      snapshot: game.snapshot(),
      point,
      rng: createCoachRng(1),
    });
    const [pick] = fixtureValue(point.candidates[index]).commands;
    expect(pick.type).toBe("kickoff-select-player");
    await game.execute(pick);

    const { commands, open } = await coachPlays(game);
    expect(commands).toEqual(["kickoff-place-player"]);
    expect(open).toBe(false);
    const playerId = "playerId" in pick ? pick.playerId : "";
    expect(game.ctx.gameService.getPlayerById(playerId)?.gridPosition).toEqual(
      LANDING
    );
  });

  it.each([KickoffEvent.CHARGE, KickoffEvent.BLITZ])(
    "%s: closes on the ball without rolling a die",
    async (event) => {
      const { game } = await rehearse(event, { players: 3 });
      const before = reach(game);
      const { commands } = await coachPlays(game);
      expect(reach(game)).toBeLessThan(before - 12);
      expect(commands.filter((c) => c === "declare-action")).toHaveLength(3);
      expect(commands).not.toContain("use-reroll");
    }
  );

  it("Charge!: gets a runner under a ball it can reach", async () => {
    const { game } = await rehearse(KickoffEvent.CHARGE, {
      players: 2,
      scenario: lineUp(
        [
          [12, 5],
          [2, 2],
          [2, 8],
        ],
        [
          [19, 1],
          [19, 9],
          [18, 9],
        ]
      ),
    });
    await coachPlays(game);
    expect(game.ctx.teams[0].players.map((p) => p.gridPosition)).toContainEqual(
      LANDING
    );
  });

  it("Charge!: blitzes a weak receiver under the ball", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 2,
      scenario: lineUp(
        [
          [12, 5],
          [12, 4],
        ],
        [
          [16, 5],
          [19, 9],
          [19, 1],
        ]
      ),
    });
    home(0).stats.ST = 5;
    away(0).stats.ST = 2;
    const { commands, notes } = await coachPlays(game);
    expect(commands).toContain("block");
    expect(notes.join(',')).toContain("Charge!: blitzes");
  });

  it("Charge!: a declared Blitz carries on past the landing square", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 1,
      scenario: lineUp([[12, 5]], [[19, 5]]),
    });
    home(0).stats.ST = 5;
    away(0).stats.ST = 2;
    const playerId = home(0).id;
    await choose(game, [playerId]);
    await game.execute({ type: "declare-action", playerId, action: "blitz" });
    home(0).gridPosition = { ...LANDING };
    const played = await coachPlays(game);
    expect(played.commands).toContain("block");
  });

  it("Charge!: a No Ball player walks on past the landing square", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.CHARGE, {
      players: 1,
      scenario: lineUp([[12, 5]], [[19, 5]]),
    });
    home(0).skills = [getSkill(SkillType.NO_BALL)];
    away(0).stats.ST = 2;
    const playerId = home(0).id;
    await choose(game, [playerId]);
    await game.execute({ type: "declare-action", playerId, action: "move" });
    home(0).gridPosition = { ...LANDING };
    await coachPlays(game);
    expect(home(0).gridPosition).not.toEqual(LANDING);
  });

  it("Quick Attack: team-mates who cannot act do not put it off a block", async () => {
    const { game, home, away } = await rehearse(KickoffEvent.QUICK_ATTACK, {
      scenario: lineUp(
        [
          [9, 5],
          [2, 1],
          [2, 3],
          [2, 5],
          [2, 7],
          [2, 9],
          [3, 8],
        ],
        [[10, 5]]
      ),
    });
    home(0).skills = [...home(0).skills, getSkill(SkillType.BLOCK)];
    away(0).skills = [];
    const played = await coachPlays(game);
    expect(played.commands).toContain("block");
  });

  it("Alert Defence: steps towards the ball and stays out of contact", async () => {
    const { game } = await rehearse(KickoffEvent.ALERT_DEFENCE, { players: 3 });
    const before = reach(game);
    const { commands } = await coachPlays(game);
    expect(commands.filter((c) => c === "kickoff-move-player")).toHaveLength(3);
    expect(reach(game)).toBeLessThan(before);
  });

  it("Quick Snap: steps under the ball", async () => {
    const { game } = await rehearse(KickoffEvent.QUICK_SNAP, {
      players: 2,
      scenario: lineUp(
        [
          [5, 2],
          [5, 8],
        ],
        [
          [16, 5],
          [14, 1],
        ]
      ),
    });
    await coachPlays(game);
    expect(game.ctx.teams[1].players.map((p) => p.gridPosition)).toContainEqual(
      LANDING
    );
  });

  it("Quick Snap: leaves a catcher already under the ball where they are", async () => {
    const { game, away } = await rehearse(KickoffEvent.QUICK_SNAP, {
      players: 2,
      scenario: lineUp(
        [
          [5, 2],
          [5, 8],
        ],
        [
          [17, 5],
          [12, 1],
        ]
      ),
    });
    await coachPlays(game);
    expect(away(0).gridPosition).toEqual(LANDING);
  });

  it("High Kick: puts the best open catcher under the ball", async () => {
    const { game, away } = await rehearse(KickoffEvent.HIGH_KICK);
    away(4).stats.AG = 2;
    const { commands } = await coachPlays(game);
    expect(commands).toEqual(["kickoff-select-player", "kickoff-place-player"]);
    expect(away(4).gridPosition).toEqual(LANDING);
  });

  it("Quick Attack: blocks only when the odds favour it", async () => {
    const adjacent = lineUp(
      [
        [9, 5],
        [3, 2],
      ],
      [
        [10, 5],
        [18, 2],
      ]
    );
    const strong = await rehearse(KickoffEvent.QUICK_ATTACK, {
      scenario: adjacent,
    });
    strong.home(0).stats.ST = 5;
    strong.away(0).stats.ST = 2;
    const strongPlayed = await coachPlays(strong.game);
    expect(strongPlayed.commands).toContain("block");

    const weak = await rehearse(KickoffEvent.QUICK_ATTACK, {
      scenario: adjacent,
    });
    weak.home(0).stats.ST = 2;
    weak.away(0).stats.ST = 5;
    const weakPlayed = await coachPlays(weak.game);
    expect(weakPlayed.commands).toEqual(["kickoff-skip"]);
  });

  it.each([
    KickoffEvent.CHARGE,
    KickoffEvent.QUICK_SNAP,
    KickoffEvent.HIGH_KICK,
  ])("%s: hard and legend play it too", async (event) => {
    const { game } = await rehearse(event, { players: 3 });
    const coach = createSearchCoach({ budget: { samples: 1, options: 2 } });
    const { commands, open } = await coachPlays(game, coach);
    expect(open).toBe(false);
    expect(commands).not.toContain("kickoff-skip");
  });

  it.each([...EVENTS, KickoffEvent.QUICK_ATTACK])(
    "%s: every candidate a random coach takes is legal",
    async (event) => {
      const { game } = await rehearse(event, { players: 3 });
      const randomPlayed = await coachPlays(game, randomCoach);
      expect(randomPlayed.open).toBe(false);
    }
  );
});
