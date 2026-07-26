import { describe, expect, it } from "vitest";
import { RULE_SCENARIOS } from "../../src/data/ruleScenarios";
import { findSeed, runRuleConfig } from "../../src/game/rules-lab";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { SkillType, hasSkill } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";

const replacements = [
  {
    skill: SkillType.STAB,
    direct: "stab-basic",
    directOutcome: "armour-broken",
    blitz: "stab-blitz",
  },
  {
    skill: SkillType.CHAINSAW,
    direct: "chainsaw-attack",
    directOutcome: "attack-armour-roll",
    blitz: "chainsaw-blitz",
  },
  {
    skill: SkillType.BREATHE_FIRE,
    direct: "breathe-fire-action",
    directOutcome: "target-down",
    blitz: "breathe-fire-blitz",
  },
  {
    skill: SkillType.PROJECTILE_VOMIT,
    direct: "projectile-vomit-action",
    directOutcome: "vomits",
    blitz: "projectile-vomit-blitz",
  },
  {
    skill: SkillType.MONSTROUS_MOUTH,
    direct: "chomp-action",
    directOutcome: "chomped",
    blitz: "chomp-blitz",
  },
] as const;

const config = (skill: SkillType, id: string) =>
  RULE_SCENARIOS.find((entry) => entry.skill === skill)!.configs.find(
    (candidate) => candidate.id === id
  )!;

describe("roster-authentic block-replacement scenario catalog", () => {
  it.each(replacements)(
    "documents legal skill provenance for $skill fixtures",
    ({ skill, direct, blitz }) => {
      for (const id of [direct, blitz]) {
        const fixture = config(skill, id);
        const game = new HeadlessGame({
          scenario: {
            id,
            name: fixture.name,
            description: fixture.description,
            setup: fixture.setup,
          } satisfies Scenario,
          seed: 1,
        });
        expect(fixture.skillProvenance!.length).toBeGreaterThan(0);

        for (const provenance of fixture.skillProvenance!) {
          expect(provenance.skill).toBe(skill);
          expect(provenance.reason.length).toBeGreaterThan(20);
          expect(fixture.setup.team1Roster).toBe(provenance.roster);

          const playerIndex = Number(provenance.playerRef.split(":")[1]);
          const player = game.ctx.team1.players[playerIndex];
          expect(player.positionName).toBe(provenance.positionName);
          expect(hasSkill(player.skills, skill)).toBe(true);

          if (provenance.source === "roster-default") {
            const placement = fixture.setup.team1Placements.find(
              (candidate) => candidate.playerIndex === playerIndex
            )!;
            expect(
              placement.skills?.some((granted) =>
                typeof granted === "string"
                  ? granted === skill
                  : granted.type === skill
              ) ?? false
            ).toBe(false);
          }
        }
      }
    }
  );

  it.each(replacements)(
    "runs seeded direct and move-then-attack coverage for $skill",
    async ({ skill, direct, directOutcome, blitz }) => {
      const directConfig = config(skill, direct);
      const directSeed = await findSeed(directConfig, directOutcome);
      const directRun = await runRuleConfig(directConfig, directSeed.seed);
      expect(directRun.responses.every((response) => response.ok)).toBe(true);

      const blitzConfig = config(skill, blitz);
      const blitzSeed = await findSeed(blitzConfig, "replaces-block");
      const blitzRun = await runRuleConfig(blitzConfig, blitzSeed.seed);
      expect(blitzRun.responses.every((response) => response.ok)).toBe(true);
      expect(
        blitzRun.events.some(
          (event) => event.name === GameEventNames.BlockDiceRolled
        )
      ).toBe(false);
    },
    20_000
  );

  it("fields two eligible Assassins and spends the team Blitz for the second one", async () => {
    const fixture = config(SkillType.STAB, "stab-blitz");
    const game = new HeadlessGame({
      scenario: {
        id: fixture.id,
        name: fixture.name,
        description: fixture.description,
        setup: fixture.setup,
      },
      seed: 1,
    });
    const firstAssassin = game.ctx.team1.players[0];
    const secondAssassin = game.ctx.team1.players[1];
    const firstTarget = game.ctx.team2.players[0];
    const snapshot = game.snapshot();

    expect(
      snapshot.teams[0].players.filter((player) => player.position)
    ).toHaveLength(5);
    expect(
      snapshot.teams[1].players.filter((player) => player.position)
    ).toHaveLength(5);

    const before = await game.execute({
      type: "legal-actions",
      playerId: secondAssassin.id,
    });
    const beforeSecond = before.legalActions!.players.find(
      (player) => player.playerId === secondAssassin.id
    )!;
    expect(beforeSecond.actions).toContain("blitz");
    expect(beforeSecond.replacementActions).toContainEqual(
      expect.objectContaining({
        blockReplacement: "stab",
        label: "Blitz (with Stab)",
        blitz: true,
      })
    );

    await game.execute({
      type: "declare-action",
      playerId: firstAssassin.id,
      action: "blitz",
      blockReplacement: "stab",
    });
    await game.execute({
      type: "move",
      playerId: firstAssassin.id,
      path: [{ x: 11, y: 5 }],
    });
    const resolved = await game.execute({
      type: "stab",
      attackerId: firstAssassin.id,
      defenderId: firstTarget.id,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.snapshot.turn.hasBlitzed).toBe(true);
    expect(resolved.snapshot.turn.activatedPlayerIds).toContain(
      firstAssassin.id
    );
    expect(resolved.snapshot.turn.activatedPlayerIds).not.toContain(
      secondAssassin.id
    );

    const after = await game.execute({
      type: "legal-actions",
      playerId: secondAssassin.id,
    });
    const afterSecond = after.legalActions!.players.find(
      (player) => player.playerId === secondAssassin.id
    )!;
    expect(afterSecond.actions).not.toContain("blitz");
    expect(afterSecond.replacementActions?.some((action) => action.blitz)).toBe(
      false
    );

    const beforeForgedDeclaration = JSON.stringify(game.snapshot());
    const forgedSecondBlitz = await game.execute({
      type: "declare-action",
      playerId: secondAssassin.id,
      action: "blitz",
      blockReplacement: "stab",
    });
    expect(forgedSecondBlitz.ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(beforeForgedDeclaration);
  });
});
