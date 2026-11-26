import { describe, expect, it } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase } from "../../src/types/GameState";
import { Inducement } from "../../src/types/Inducements";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { type MatchFormat } from "../../src/game/variants/activeMatch";
import { movePlayerToBox } from "../../src/game/rules/playerLocation";
import { PreDriveInducementsOperation } from "../../src/game/inducements/driveInducements";
import { inducementUsesLeft } from "../../src/game/inducements/inventory";
import { forceDice } from "../utils/test-helpers";

const STREET: MatchFormat = { gameType: "street-bowl", venue: "street" };
const BEACH: MatchFormat = { gameType: "beach-bowl", venue: "beach" };
const GUTTER: MatchFormat = { gameType: "gutter-bowl", venue: "gutter-street" };

function newGame(format: MatchFormat): HeadlessGame {
  return new HeadlessGame({ seed: 1, startingPhase: GamePhase.SETUP, format });
}

async function settle(game: HeadlessGame): Promise<void> {
  for (let i = 0; i < 50 && !game.pendingDecision(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function commit(
  game: HeadlessGame,
  lines: readonly (readonly [Inducement, number])[]
): Promise<void> {
  game.ctx.gameService.commitInducements(
    { id: "test", advancedLeague: false, starPlayersAllowed: false },
    {},
    lines.map(([inducement, quantity]) => ({
      inducement,
      ownerTeamId: game.ctx.team1.id,
      quantity,
      remainingUses: quantity,
      price: 0,
      provenance: "purchased" as const,
    }))
  );
  await settle(game);
}

async function declineAll(game: HeadlessGame): Promise<void> {
  while (game.pendingDecision()?.type === "inducement-choice") {
    await game.execute({ type: "choose-inducement" });
    await settle(game);
  }
}

async function catalogOf(format: MatchFormat): Promise<string[]> {
  const game = newGame(format);
  const result = await game.execute({ type: "offer-inducements" });
  const offer = fixtureValue(result.inducementOffer);
  return fixtureValue(offer.catalogs[game.ctx.team1.id]).map(
    (entry) =>
      `${entry.inducement} ${String(entry.price)} x${String(entry.maxCount)}`
  );
}

describe("game type inducement lists (SB-D5, BB-D5, GB-D5)", () => {
  it("Street Bowl offers only Magic Potions and the Master Chef", async () => {
    expect(await catalogOf(STREET)).toEqual([
      "Magic Potion 50000 x99",
      "Halfling Master Chef 300000 x1",
    ]);
  });

  it("Beach Bowl offers Kegs, the Master Chef and Souvenirs", async () => {
    expect(await catalogOf(BEACH)).toEqual([
      "Blitzer's Best Kegs 50000 x2",
      "Halfling Master Chef 300000 x1",
      "Souvenir 50000 x99",
    ]);
  });

  it("Gutter Bowl offers its potions, Sawbones, Snack Stand and Novice Wizard", async () => {
    expect(await catalogOf(GUTTER)).toEqual([
      "Lesser Magic Potion 50000 x99",
      "Superior Magic Potion 100000 x99",
      "Sawbones 50000 x1",
      "Snack Stand 100000 x1",
      "Novice Wizard 100000 x1",
    ]);
  });

  it("each Street Bowl team gets one Magic Potion free", async () => {
    const game = newGame(STREET);
    await commit(game, []);
    await declineAll(game);
    const state = game.ctx.gameService.getState();
    expect(
      [game.ctx.team1.id, game.ctx.team2.id].map((teamId) =>
        inducementUsesLeft(state, teamId, Inducement.MAGIC_POTION)
      )
    ).toEqual([1, 1]);
  });
});

async function potionForKnockedOut(roll: number) {
  const game = newGame(STREET);
  await commit(game, []);
  await declineAll(game);
  const patient = fixtureValue(game.ctx.team1.players[2]);
  movePlayerToBox(patient, { box: "ko" });
  game.ctx.gameService.flowManager.add(new PreDriveInducementsOperation());
  await settle(game);
  const pending = game.pendingDecision();
  forceDice(game.ctx.rng, [roll]);
  await game.execute({ type: "choose-inducement", playerId: patient.id });
  await settle(game);
  await declineAll(game);
  return { game, patient, pending };
}

describe("Street Bowl Magic Potions (SB-P1 to SB-P8)", () => {
  it("offers the free potion to the KO'd player first after a drive", async () => {
    const { pending, patient } = await potionForKnockedOut(5);
    expect(pending).toMatchObject({
      type: "inducement-choice",
      kind: "magic-potion",
      chooserTeamId: "team1",
      optional: true,
    });
    expect(
      pending?.type === "inducement-choice" ? pending.playerIds[0] : null
    ).toBe(patient.id);
  });

  it("Squig Pish kills the player (SB-P1)", async () => {
    const { patient } = await potionForKnockedOut(1);
    expect(patient.status).toBe(PlayerStatus.DEAD);
    expect(patient.injuries).toEqual([InjuryType.DEAD]);
  });

  it("Tap Water leaves a KO'd player KO'd (SB-P2)", async () => {
    const { patient } = await potionForKnockedOut(2);
    expect(patient.status).toBe(PlayerStatus.KO);
  });

  it("Laudanum returns the player Really Stupid, Thick Skulled and 2 worse at Agility (SB-P3)", async () => {
    const before = fixtureValue(newGame(STREET).ctx.team1.players[2]).stats.AG;
    const { patient } = await potionForKnockedOut(3);
    expect(patient.status).toBe(PlayerStatus.RESERVE);
    expect(hasSkill(patient.skills, SkillType.REALLY_STUPID)).toBe(true);
    expect(hasSkill(patient.skills, SkillType.THICK_SKULL)).toBe(true);
    expect(patient.stats.AG).toBe(before + 2);
  });

  it("Healing Balm heals a Badly Hurt player back to the Reserves (SB-P5)", async () => {
    const game = newGame(STREET);
    await commit(game, []);
    await declineAll(game);
    const patient = fixtureValue(game.ctx.team1.players[3]);
    patient.injuries.push(InjuryType.BADLY_HURT);
    movePlayerToBox(patient, { box: "casualty" });
    game.ctx.gameService.flowManager.add(new PreDriveInducementsOperation());
    await settle(game);
    forceDice(game.ctx.rng, [5]);
    await game.execute({ type: "choose-inducement", playerId: patient.id });
    await settle(game);
    expect(patient.status).toBe(PlayerStatus.RESERVE);
    expect(patient.injuries).toEqual([]);
  });

  it("Fungus Beer gives +2 ST, Frenzy and Animal Savagery for the match (SB-P8)", async () => {
    const before = fixtureValue(newGame(STREET).ctx.team1.players[2]).stats.ST;
    const { patient } = await potionForKnockedOut(8);
    expect(patient.stats.ST).toBe(before + 2);
    expect(hasSkill(patient.skills, SkillType.FRENZY)).toBe(true);
    expect(hasSkill(patient.skills, SkillType.ANIMAL_SAVAGERY)).toBe(true);
  });
});
