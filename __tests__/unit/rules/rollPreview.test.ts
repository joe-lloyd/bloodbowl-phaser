import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import {
  pickupTarget,
  catchTarget,
  passTarget,
  bombInterceptPreviewLine,
  bombThrowTarget,
  interceptPreviewLine,
  rushRollModifier,
  dodgeTarget,
  secureBallTarget,
  throwConditions,
  blockPreviewLines,
  foulPreview,
  interceptTarget,
} from "../../../src/game/rules/rollPreview";
import { createTestPlayer } from "../../fixtures/players";
import { GameStateBuilder } from "../../utils/test-builders";
import type { Weather } from "../../../src/game/rules/weather";
import { passModifier } from "../../../src/game/kickoff/ballConditions";
import { getVariantInducements } from "../../../src/game/inducements/variantState";
import { PlayerStatus } from "../../../src/types/Player";
import { SkillType, getSkill } from "../../../src/types/Skills";
import { BlockValidator } from "../../../src/game/validators/BlockValidator";

const player = createTestPlayer({
  teamId: "ours",
  status: PlayerStatus.ACTIVE,
  stats: { MA: 6, ST: 3, AG: 3, PA: 4, AV: 9 },
  gridPosition: { x: 5, y: 5 },
});
const enemy = createTestPlayer({
  id: "enemy",
  teamId: "theirs",
  status: PlayerStatus.ACTIVE,
  gridPosition: { x: 6, y: 5 },
});

const inWeather = (weather: Weather) => ({
  ...new GameStateBuilder().build(),
  weather,
});

describe("roll preview analysis", () => {
  it("includes marking and rain for pickups and catches", () => {
    expect(
      pickupTarget(
        player,
        fixtureValue(player.gridPosition),
        [enemy],
        inWeather("Pouring Rain")
      )
    ).toBe(5);
    expect(catchTarget(player, [enemy], inWeather("Nice"), "handoff")).toBe(4);
  });
  it("lets Big Hand ignore the conch's pick-up penalty, as the engine does", () => {
    const conch = { ...inWeather("Nice"), lostBall: "conch" as const };
    const square = fixtureValue(player.gridPosition);
    const bigHand = { ...player, skills: [getSkill(SkillType.BIG_HAND)] };
    expect([
      pickupTarget(player, square, [], conch),
      pickupTarget(bigHand, square, [], conch),
      pickupTarget(bigHand, square, [enemy], inWeather("Nice")),
    ]).toEqual([4, 3, 3]);
  });

  it("adds a Sticky Bun's bonus to the carrier's catch, as the engine does", () => {
    const state = inWeather("Nice");
    const bare = catchTarget(player, [], state, "pass");
    getVariantInducements(state).souvenirs.push({
      teamId: player.teamId,
      souvenir: "Sticky Bun",
      playerId: player.id,
    });
    expect([bare, catchTarget(player, [], state, "pass")]).toEqual([3, 2]);
  });

  it("adds a Sticky Bun to Secure the Ball and takes it off a pass", () => {
    const rain = inWeather("Pouring Rain");
    const square = fixtureValue(player.gridPosition);
    const before = [
      secureBallTarget(player, square, [], rain),
      throwConditions(rain, player, "Quick Pass"),
    ];
    getVariantInducements(rain).souvenirs.push({
      teamId: player.teamId,
      souvenir: "Sticky Bun",
      playerId: player.id,
    });
    expect([
      ...before,
      secureBallTarget(player, square, [], rain),
      throwConditions(rain, player, "Quick Pass"),
    ]).toEqual([3, 0, 2, -1]);
  });

  it("applies ball and passing skills before showing the target", () => {
    const skilled = {
      ...player,
      skills: [
        getSkill(SkillType.EXTRA_ARMS),
        getSkill(SkillType.NERVES_OF_STEEL),
      ],
    };
    expect(catchTarget(skilled, [enemy], inWeather("Nice"), "pass")).toBe(2);
    expect(
      passTarget(
        skilled,
        [enemy],
        passModifier(inWeather("Very Sunny"), "Short Pass"),
        {
          type: "Short Pass",
          modifier: -1,
          minDistance: 4,
          maxDistance: 6,
        }
      )
    ).toBe(6);
  });
  it("gives each interceptor its own target from marking, rain and skills", () => {
    const interceptor = {
      ...enemy,
      number: 4,
      stats: { ...enemy.stats, AG: 3 },
    };

    expect(interceptTarget(interceptor, -3, [player], inWeather("Nice"))).toBe(
      6
    );
    const legs = {
      ...interceptor,
      skills: [getSkill(SkillType.VERY_LONG_LEGS)],
      gridPosition: { x: 9, y: 9 },
    };
    expect(interceptTarget(legs, -3, [player], inWeather("Nice"))).toBe(4);
    expect(interceptTarget(legs, -3, [player], inWeather("Pouring Rain"))).toBe(
      5
    );
  });

  it("prices every roll the engine adjusts for the conch, the beach ball and souvenirs", () => {
    const square = fixtureValue(player.gridPosition);
    const legs = {
      ...enemy,
      skills: [getSkill(SkillType.VERY_LONG_LEGS)],
      gridPosition: { x: 9, y: 9 },
    };
    const souvenir = (
      state: ReturnType<typeof inWeather>,
      playerId: string
    ) => {
      getVariantInducements(state).souvenirs.push({
        teamId: "any",
        souvenir: "Sticky Bun",
        playerId,
      });
      return state;
    };
    const conch = { ...inWeather("Nice"), lostBall: "conch" as const };
    const beachBall = { ...inWeather("Nice"), lostBall: "beach-ball" as const };
    expect({
      pickup: [
        pickupTarget(player, square, [], conch),
        pickupTarget(player, square, [], beachBall),
        pickupTarget(
          player,
          square,
          [],
          souvenir(inWeather("Nice"), player.id)
        ),
      ],
      catch: [
        catchTarget(player, [], conch, "pass"),
        catchTarget(player, [], beachBall, "pass"),
      ],
      intercept: [
        interceptTarget(legs, -3, [player], conch),
        interceptTarget(legs, -3, [player], beachBall),
        interceptTarget(
          legs,
          -3,
          [player],
          souvenir(inWeather("Nice"), legs.id)
        ),
      ],
      pass: [
        throwConditions(beachBall, player, "Short Pass"),
        throwConditions(
          souvenir(inWeather("Nice"), player.id),
          player,
          "Short Pass"
        ),
      ],
      dodge: [
        dodgeTarget(player, { from: square, to: { x: 5, y: 6 } }, [enemy]),
        dodgeTarget(player, { from: square, to: { x: 5, y: 6 } }, [enemy], 1),
      ],
    }).toEqual({
      pickup: [4, 2, 2],
      catch: [4, 2],
      intercept: [5, 3, 3],
      pass: [-1, -1],
      dodge: [4, 3],
    });
  });
  it("rolls a Bomb by range, marking and weather only, and its interceptions by the corridor and marking", () => {
    const conch = {
      ...inWeather("Pouring Rain"),
      lostBall: "conch" as const,
    };
    const thrower = {
      ...player,
      skills: [
        getSkill(SkillType.ACCURATE),
        getSkill(SkillType.NERVES_OF_STEEL),
      ],
    };
    const quick = {
      type: "Quick Pass" as const,
      modifier: 0,
      minDistance: 0,
      maxDistance: 3,
    };
    const interceptor = {
      ...enemy,
      number: 4,
      stats: { ...enemy.stats, AG: 2 },
      skills: [
        getSkill(SkillType.VERY_LONG_LEGS),
        getSkill(SkillType.EXTRA_ARMS),
      ],
      gridPosition: { x: 9, y: 9 },
    };
    const drunk = { ...player, skills: [getSkill(SkillType.DRUNKARD)] };
    expect({
      throw: [
        bombThrowTarget(thrower, [enemy], quick.modifier - 1),
        passTarget(
          thrower,
          [enemy],
          throwConditions(conch, thrower, "Quick Pass"),
          quick
        ),
      ],
      intercept: [
        bombInterceptPreviewLine(interceptor, [player]).line,
        interceptPreviewLine(interceptor, [player], conch).line,
      ],
      rush: [
        rushRollModifier(inWeather("Nice"), player),
        rushRollModifier(inWeather("Nice"), drunk),
      ],
    }).toEqual({
      throw: [6, 3],
      intercept: [
        "Intercept #4: 5+, if inaccurate 4+",
        "Intercept #4: 4+, if inaccurate 3+",
      ],
      rush: [0, -1],
    });
  });

  it("uses the block analysis for the chooser and numbered assists", () => {
    const assist = createTestPlayer({
      id: "assist",
      number: 8,
      teamId: "ours",
      status: PlayerStatus.ACTIVE,
      gridPosition: { x: 7, y: 5 },
    });
    const defender = {
      ...enemy,
      stats: { ...enemy.stats, ST: 3 },
      skills: [getSkill(SkillType.DODGE)],
    };
    const analysis = new BlockValidator().analyzeBlock({
      attacker: player,
      defender: defender,
      allPlayers: [player, defender, assist],
      activeTeamId: "ours",
    });
    expect(analysis.attackerAssists.map((p) => p.number)).toEqual([8]);
    expect(blockPreviewLines(analysis, player, defender, "ours")).toEqual(
      expect.arrayContaining([
        "2 dice, you pick",
        "ST 4 (3 +1) vs 3",
        "Our assists: #8",
        "Their Dodge: Stumble becomes Push",
      ])
    );
  });
  it("says a coach picks when their Fanatic hits their own teammate", () => {
    const teammate = { ...enemy, teamId: "ours" };
    const strong = { ...teammate, stats: { ...enemy.stats, ST: 5 } };
    const dice = (target: typeof teammate, viewer: string) =>
      blockPreviewLines(
        new BlockValidator().analyzeBlock({
          attacker: player,
          defender: target,
          allPlayers: [player, target],
          activeTeamId: "ours",
        }),
        player,
        target,
        viewer
      )[0];
    expect(dice(teammate, "ours")).toBe("1 die, you pick");
    expect(dice(strong, "ours")).toBe("2 dice, you pick");
    expect(dice(teammate, "theirs")).toBe("1 die, they pick");
  });
  it("counts one die as a die", () => {
    const analysis = new BlockValidator().analyzeBlock({
      attacker: player,
      defender: enemy,
      allPlayers: [player, enemy],
      activeTeamId: "ours",
    });
    expect(blockPreviewLines(analysis, player, enemy, "ours")).toEqual([
      "1 die, you pick",
      "ST 3 vs 3",
    ]);
  });
  it("says the defender picks when they are stronger", () => {
    const strong = { ...enemy, stats: { ...enemy.stats, ST: 4 } };
    const analysis = new BlockValidator().analyzeBlock({
      attacker: player,
      defender: strong,
      allPlayers: [player, strong],
      activeTeamId: "ours",
    });
    expect(
      blockPreviewLines(analysis, player, strong, "ours")
    ).toEqual([
      "2 dice, they pick",
      "ST 3 vs 4",
    ]);
  });
  it("shows the foul's assisted armour target", () => {
    const target = {
      ...enemy,
      status: PlayerStatus.PRONE,
      stats: { ...enemy.stats, AV: 9 },
    };
    const assist = createTestPlayer({
      id: "a",
      number: 8,
      teamId: "ours",
      status: PlayerStatus.ACTIVE,
      gridPosition: { x: 7, y: 5 },
    });
    const preview = foulPreview(
      player,
      target,
      [player, target, assist],
      new GameStateBuilder().build()
    );
    expect(preview.lines[0]).toBe("Armour: 8+");
    expect(preview.lines).toContain("Our assists: #8");
  });
});
