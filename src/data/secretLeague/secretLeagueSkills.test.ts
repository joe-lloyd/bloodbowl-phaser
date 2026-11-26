import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../RosterTemplates";
import { DiceController } from "../../game/controllers/DiceController";
import { AnimosityRule } from "../../game/skills/rules/AnimosityRule";
import { HatredRule } from "../../game/skills/rules/HatredRule";
import { EventBus } from "../../services/EventBus";
import { RNGService } from "../../services/rng/RNGService";
import { type Player, createPlayer } from "../../types/Player";
import { type RosterName } from "../../types/Team";
import { GameEventNames } from "../../types/events";

function player(
  rosterName: RosterName,
  positionName: string,
  teamId: string
): Player {
  const template = getRosterByRosterName(rosterName).playerTemplates.find(
    (candidate) => candidate.positionName === positionName
  );
  if (!template) throw new Error(`${rosterName} has no ${positionName}`);
  return createPlayer(template, teamId, 1);
}

function dice() {
  const bus = new EventBus();
  const rolls: string[] = [];
  bus.on(GameEventNames.DiceRoll, (roll: { rollType: string }) =>
    rolls.push(roll.rollType)
  );
  return { controller: new DiceController(bus, new RNGService(7)), rolls };
}

describe("Secret League skills in a match", () => {
  it("lets a Grudgebearer re-roll a Player Down against an Orc, one of the kinds he hates", async () => {
    const grudgebearer = player(
      "Dwarf Everpeak (karaz-a-karak)",
      "Grudgebearers",
      "home"
    );
    const orc = player("Orc", "Orc Lineman", "away");
    const ctx = {
      triggers: [],
      dice: dice().controller,
      attacker: grudgebearer,
      defender: orc,
      results: [{ type: "skull" as const, icon: "", label: "Player Down" }],
      isAttackerChoice: true,
      rerolls: [],
    };

    await HatredRule.onBlockDiceRolled?.(ctx, grudgebearer);

    expect(ctx.rerolls).toHaveLength(1);
  });

  it("makes a Long Drongs Slayer roll Animosity before handing off to a Black Ark Corsair", () => {
    const slayer = player("Pirate", "Long Drongs Slayer", "home");
    const corsair = player("Pirate", "Black Ark Corsair", "home");
    const { controller, rolls } = dice();

    void AnimosityRule.onHandoffDeclared?.(
      { triggers: [], dice: controller, player: slayer, targetPlayer: corsair },
      slayer
    );

    expect(rolls).toEqual(["Animosity"]);
  });
});
