import { fixtureValue } from "../../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import {
  pickupTarget,
  catchTarget,
  passTarget,
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

    expect(interceptTarget(interceptor, -3, [player], "Nice")).toBe(6);
    const legs = {
      ...interceptor,
      skills: [getSkill(SkillType.VERY_LONG_LEGS)],
      gridPosition: { x: 9, y: 9 },
    };
    expect(interceptTarget(legs, -3, [player], "Nice")).toBe(4);
    expect(interceptTarget(legs, -3, [player], "Pouring Rain")).toBe(5);
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
    expect(blockPreviewLines(analysis, player, defender, "attacker")).toEqual(
      expect.arrayContaining([
        "2 dice, you pick",
        "Our ST 4 (3 +1) vs their ST 3",
        "Our assists: #8",
        "They have Dodge: Stumble becomes Push",
      ])
    );
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
      blockPreviewLines(analysis, player, strong, "attacker").slice(0, 4)
    ).toEqual([
      "2 dice, they pick",
      "Our ST 3 vs their ST 4",
      "Our assists: none",
      "Their assists: none",
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
