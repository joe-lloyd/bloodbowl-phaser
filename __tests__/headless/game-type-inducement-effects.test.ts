import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { Inducement } from "../../src/types/Inducements";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { type Scenario } from "../../src/types/Scenario";
import { type MatchFormat } from "../../src/game/variants/activeMatch";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { InjuryResult } from "../../src/game/controllers/InjuryController";
import { CasualtyOperation } from "../../src/game/operations/CasualtyOperation";
import { CasualtyGrade } from "../../src/game/rules/injuryTables";
import { PreDriveInducementsOperation } from "../../src/game/inducements/driveInducements";
import { CastNoviceWizardOperation } from "../../src/game/inducements/noviceWizard";
import { addPotionEffect } from "../../src/game/inducements/variantState";
import {
  isFrog,
  rushModifier,
} from "../../src/game/inducements/matchInducements";
import { forceDice } from "../utils/test-helpers";

const BEACH: MatchFormat = { gameType: "beach-bowl", venue: "beach" };
const GUTTER: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-street" };

const midfield: Scenario = {
  id: "inducement-midfield",
  name: "Midfield",
  description: "team 1 to move, two of its players in midfield",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5 },
      { playerIndex: 1, x: 8, y: 0 },
    ],
    team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

async function settle(game: HeadlessGame): Promise<void> {
  for (let i = 0; i < 50 && !game.pendingDecision(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function induce(
  game: HeadlessGame,
  lines: readonly (readonly [Inducement, number])[]
): void {
  game.ctx.gameService.commitInducements(
    { id: "test", advancedLeague: false, starPlayersAllowed: false },
    {},
    lines.map(([inducement, quantity]) => ({
      inducement,
      ownerTeamId: game.ctx.teams[0].id,
      quantity,
      remainingUses: quantity,
      price: 0,
      provenance: "purchased" as const,
    }))
  );
}

const player = (game: HeadlessGame, index: number) =>
  fixtureValue(game.ctx.teams[0].players[index]);

async function carry(roll: number) {
  const game = new HeadlessGame({
    seed: 1,
    startingPhase: GamePhase.SETUP,
    format: BEACH,
  });
  forceDice(game.ctx.rng, [roll]);
  induce(game, [[Inducement.SOUVENIR, 1]]);
  await settle(game);
  const pending = game.pendingDecision();
  const carrier = player(game, 0);
  await game.execute({ type: "choose-inducement", playerId: carrier.id });
  await settle(game);
  return { game, carrier, pending };
}

function gutterGame() {
  return new HeadlessGame({
    seed: 1,
    startingPhase: GamePhase.SETUP,
    format: GUTTER,
  });
}

describe("Beach Bowl souvenirs (BB-S1 to BB-S8)", () => {
  it("rolls the souvenir and asks who carries it", async () => {
    const { pending } = await carry(6);
    expect(pending).toMatchObject({
      type: "inducement-choice",
      kind: "souvenir",
      item: "Puka Shell Necklace",
    });
  });

  it("a Puka Shell Necklace gives Pro until half time (BB-S6)", async () => {
    const { game, carrier } = await carry(6);
    expect(hasSkill(carrier.skills, SkillType.PRO)).toBe(true);
    game.ctx.eventBus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.HALFTIME,
    });
    expect(hasSkill(carrier.skills, SkillType.PRO)).toBe(false);
  });

  it("Sports Sandals add 1 to Rush (BB-S1)", async () => {
    const { game, carrier } = await carry(1);
    expect(rushModifier(game.ctx.gameService.getState(), carrier)).toBe(1);
  });

  it("Gatorcade gives Frenzy, Jump Up and No Ball (BB-S8)", async () => {
    const { carrier } = await carry(8);
    expect(
      [SkillType.FRENZY, SkillType.JUMP_UP, SkillType.NO_BALL].map((skill) =>
        hasSkill(carrier.skills, skill)
      )
    ).toEqual([true, true, true]);
  });
});

describe("Street Bowl potion effects in play", () => {
  it("Warpstone Tincture: no team-mate may act before the drinker (SB-P6)", async () => {
    const game = new HeadlessGame({ scenario: midfield, seed: 1 });
    const state = game.ctx.gameService.getState();
    addPotionEffect(state, player(game, 1).id, "act-first");
    expect(
      [0, 1].map((index) =>
        game.ctx.gameService.canActivate(player(game, index).id)
      )
    ).toEqual([false, true]);
    await game.execute({
      type: "declare-action",
      playerId: player(game, 1).id,
      action: "move",
    });
    await game.execute({
      type: "end-activation",
      playerId: player(game, 1).id,
    });
    expect(game.ctx.gameService.canActivate(player(game, 0).id)).toBe(true);
  });

  it("Orca-Cola: ending an action in a Wide Zone sends the drinker off for the drive (SB-P7)", async () => {
    const game = new HeadlessGame({ scenario: midfield, seed: 1 });
    const drinker = player(game, 1);
    addPotionEffect(game.ctx.gameService.getState(), drinker.id, "orca-cola");
    await game.execute({
      type: "declare-action",
      playerId: drinker.id,
      action: "move",
    });
    await game.execute({ type: "end-activation", playerId: drinker.id });
    expect(drinker.status).toBe(PlayerStatus.RESERVE);
    expect(game.snapshot().driveEffects?.playerModifiers[drinker.id]).toEqual({
      confinedToReserves: true,
    });
  });

  it("Fungus Beer: a 1 at the start of a turn kills the drinker (SB-P8)", () => {
    const game = new HeadlessGame({ scenario: midfield, seed: 1 });
    const drinker = player(game, 0);
    addPotionEffect(game.ctx.gameService.getState(), drinker.id, "fungus-beer");
    forceDice(game.ctx.rng, [1]);
    game.ctx.gameService.startTurn("team2");
    expect(drinker.status).toBe(PlayerStatus.DEAD);
    expect(drinker.injuries).toEqual([InjuryType.DEAD]);
  });
});

describe("Gutter Bowl inducements (GB-I1 to GB-I5)", () => {
  it("a Superior potion recovers a KO'd player with ST +1 and Stand Firm (GB-I2)", async () => {
    const game = gutterGame();
    induce(game, [[Inducement.SUPERIOR_MAGIC_POTION, 1]]);
    await settle(game);
    await game.execute({ type: "choose-inducement" });
    const patient = player(game, 2);
    const strength = patient.stats.ST;
    movePlayerToBox(patient, { box: "ko" });
    game.ctx.gameService.flowManager.add(new PreDriveInducementsOperation());
    await settle(game);
    forceDice(game.ctx.rng, [7]);
    await game.execute({ type: "choose-inducement", playerId: patient.id });
    await settle(game);
    expect(patient.status).toBe(PlayerStatus.RESERVE);
    expect(patient.stats.ST).toBe(strength + 1);
    expect(hasSkill(patient.skills, SkillType.STAND_FIRM)).toBe(true);
  });

  it("keeping a potion for later says so in the game log", async () => {
    const game = gutterGame();
    induce(game, [[Inducement.SUPERIOR_MAGIC_POTION, 1]]);
    const lines: string[] = [];
    game.ctx.eventBus.on(GameEventNames.UI_GameLog, (line) => {
      lines.push(line);
    });
    await settle(game);
    await game.execute({ type: "choose-inducement" });
    expect(lines).toContain(
      `${game.ctx.teams[0].name} keeps its Superior Magic Potion for later`
    );
  });

  it("a player drinks at most one Gutter Bowl potion a game (GB-I1)", async () => {
    const game = gutterGame();
    induce(game, [[Inducement.LESSER_MAGIC_POTION, 2]]);
    await settle(game);
    const drinker = player(game, 0);
    forceDice(game.ctx.rng, [4]);
    await game.execute({ type: "choose-inducement", playerId: drinker.id });
    await settle(game);
    const second = game.pendingDecision();
    expect(
      second?.type === "inducement-choice" &&
        second.playerIds.includes(drinker.id)
    ).toBe(false);
  });

  it("Sawbones: a 2+ rolls again and a Badly Hurt player goes to the Reserves (GB-I3)", async () => {
    const game = gutterGame();
    induce(game, [[Inducement.SAWBONES, 1]]);
    await settle(game);
    const victim = player(game, 3);
    game.ctx.gameService.flowManager.add(
      new CasualtyOperation(victim.id, InjuryResult.SERIOUSLY_HURT),
      true
    );
    await settle(game);
    expect(game.pendingDecision()).toMatchObject({
      type: "reaction",
      skill: "Sawbones",
    });
    forceDice(game.ctx.rng, [4, 3]);
    await game.execute({ type: "use-reaction", accept: true });
    await settle(game);
    expect(victim.status).toBe(PlayerStatus.RESERVE);
    expect(victim.injuries).toEqual([]);
  });

  it("Sawbones keeps a Lasting Injury from the second Casualty roll (GB-I3)", async () => {
    const game = gutterGame();
    game.ctx.gameService.getState().competition = true;
    game.ctx.teams[0].advancementMode = "advanced-league";
    induce(game, [[Inducement.SAWBONES, 1]]);
    await settle(game);
    const victim = player(game, 3);
    game.ctx.gameService.flowManager.add(
      new CasualtyOperation(victim.id, {
        result: InjuryResult.DEAD,
        grade: CasualtyGrade.DEAD,
      }),
      true
    );
    await settle(game);
    forceDice(game.ctx.rng, [4, 14, 3]);
    await game.execute({ type: "use-reaction", accept: true });
    await settle(game);
    expect(victim.status).toBe(PlayerStatus.INJURED);
    expect(victim.stats.MA).toBe(fixtureValue(victim.baseStats).MA - 1);
    expect(victim.injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
      InjuryType.STAT_DECREASE_MA,
    ]);
  });

  it("Potion of Endurance turns the next Casualty into a KO (GB-I2)", async () => {
    const game = gutterGame();
    const victim = player(game, 3);
    addPotionEffect(game.ctx.gameService.getState(), victim.id, "endurance");
    game.ctx.gameService.flowManager.add(
      new CasualtyOperation(victim.id, InjuryResult.DEAD),
      true
    );
    await settle(game);
    expect(victim.status).toBe(PlayerStatus.KO);
  });

  it("Snack Stand adds 1 to KO recovery (GB-I4)", async () => {
    const game = gutterGame();
    induce(game, [[Inducement.SNACK_STAND, 1]]);
    await settle(game);
    const dazed = player(game, 4);
    movePlayerToBox(dazed, { box: "ko" });
    forceDice(game.ctx.rng, [3]);
    await game.ctx.gameService.rollKORecovery(() => Promise.resolve());
    expect(dazed.status).toBe(PlayerStatus.RESERVE);
  });

  it("Novice Wizard Transmutation keeps the Frog for the next drive too (GB-I5)", async () => {
    const game = new HeadlessGame({ scenario: midfield, seed: 1 });
    induce(game, [[Inducement.NOVICE_WIZARD, 1]]);
    await settle(game);
    const target = fixtureValue(game.ctx.teams[1].players[0]);
    game.ctx.gameService.flowManager.add(
      new CastNoviceWizardOperation("team1"),
      true
    );
    await settle(game);
    forceDice(game.ctx.rng, [3]);
    await game.execute({
      type: "choose-inducement",
      playerId: target.id,
      skill: "Transmutation",
    });
    await settle(game);
    const state = game.ctx.gameService.getState();
    expect(target.stats.ST).toBe(1);
    game.ctx.gameService.resetDriveState();
    expect([isFrog(state, target.id), target.stats.ST]).toEqual([true, 1]);
    game.ctx.gameService.resetDriveState();
    expect(isFrog(state, target.id)).toBe(false);
    expect(target.stats.ST).toBeGreaterThan(1);
  });
});
