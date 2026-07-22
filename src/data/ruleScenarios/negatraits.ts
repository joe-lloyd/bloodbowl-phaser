/**
 * Rule scenarios — Negatraits & activation traits (Bone Head, Really
 * Stupid, Unchannelled Fury, Take Root, Timmm-ber!, Drunkard, Loner, Pro,
 * Animal Savagery, Bloodlust, Animosity, Hatred, Pick-Me-Up, Trickster,
 * Always Hungry, My Ball) and the special activation actions (Hypnotic
 * Gaze, Breathe Fire, Projectile Vomit, Chomp).
 */

import { SkillType, hasSkill } from "../../types/Skills";
import { PlayerCondition, PlayerStatus, PositionKeyWord } from "../../types/Player";
import { RosterName } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  turnoverHappened,
  playerDown,
  playerAt,
  resolveRef,
  skillCheckDiff,
  ScriptResult,
} from "../../game/rules-lab";

type R = ScriptResult;

/** A gate/roll of the named kind was made (rollType begins with `name`). */
const rolled = (r: R, name: string): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => !!(d as { rollType?: string }).rollType?.startsWith(name)
  );

/** This player holds the named condition in the final snapshot. */
const hasCondition = (r: R, ref: string, cond: PlayerCondition): boolean => {
  const id = resolveRef(r.game, ref);
  return r.snapshot.teams.some((t) =>
    t.players.some(
      (p) => p.id === id && (p.conditions ?? []).some((c) => c.type === cond)
    )
  );
};

/** The player's activation ended (finishActivation emits PlayerActivated). */
const activationOver = (r: R, ref: string): boolean =>
  sawEvent(
    r,
    GameEventNames.PlayerActivated,
    (d) => d === resolveRef(r.game, ref)
  );

export const NEGATRAIT_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.BONE_HEAD,
    configs: [
      {
        id: "bone-head-activation",
        name: "Bone Head roll on activation",
        description:
          "After declaring an Action, a D6: 2+ acts as normal, 1 becomes Distracted and the activation ends",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BONE_HEAD] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "distracted",
            name: "Rolls a 1 — Distracted, activation ends",
            matches: (r) => skillTriggered(r, SkillType.BONE_HEAD),
            verify: (r) => {
              assert(
                hasCondition(r, "team1:0", PlayerCondition.DISTRACTED),
                "the player becomes Distracted"
              );
              assert(
                activationOver(r, "team1:0"),
                "a failed Bone Head ends the activation"
              );
            },
          },
          {
            id: "acts",
            name: "Rolls 2+ — acts as normal",
            matches: (r) =>
              rolled(r, "Bone Head") && !skillTriggered(r, SkillType.BONE_HEAD),
            verify: (r) => {
              assert(
                !hasCondition(r, "team1:0", PlayerCondition.DISTRACTED),
                "a passed Bone Head leaves the player free to act"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.REALLY_STUPID,
    configs: [
      {
        id: "really-stupid-alone",
        name: "Really Stupid with no help",
        description: "Unassisted the target is 4+; 1-3 becomes Distracted",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.REALLY_STUPID] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "distracted",
            name: "Rolls 1-3 — Distracted",
            matches: (r) => skillTriggered(r, SkillType.REALLY_STUPID),
            verify: (r) =>
              assert(
                hasCondition(r, "team1:0", PlayerCondition.DISTRACTED),
                "the player becomes Distracted"
              ),
          },
          {
            id: "acts",
            name: "Rolls 4+ — acts as normal",
            matches: (r) =>
              rolled(r, "Really Stupid") &&
              !skillTriggered(r, SkillType.REALLY_STUPID),
          },
        ],
      },
      {
        id: "really-stupid-assisted",
        name: "Really Stupid with a team-mate",
        description:
          "A Standing, non-Really-Stupid team-mate adjacent grants +2 to the roll",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.REALLY_STUPID] },
            { playerIndex: 1, x: 10, y: 6 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        outcomes: [
          {
            id: "plus-two",
            name: "The roll is made at +2",
            matches: (r) => rolled(r, "Really Stupid"),
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Really Stupid") === 2,
                "an adjacent helper grants +2"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.UNCHANNELLED_FURY,
    configs: [
      {
        id: "unchannelled-fury-activation",
        name: "Unchannelled Fury roll on activation",
        description:
          "4+ (with +2 on a Block/Blitz) acts as normal; 1-3 rages and the activation ends",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.UNCHANNELLED_FURY],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "rages",
            name: "Rolls 1-3 — nothing happens, activation ends",
            matches: (r) => skillTriggered(r, SkillType.UNCHANNELLED_FURY),
            verify: (r) =>
              assert(
                activationOver(r, "team1:0"),
                "a failed Unchannelled Fury ends the activation"
              ),
          },
          {
            id: "acts",
            name: "Rolls 4+ — acts as normal",
            matches: (r) =>
              rolled(r, "Unchannelled Fury") &&
              !skillTriggered(r, SkillType.UNCHANNELLED_FURY),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.TAKE_ROOT,
    configs: [
      {
        id: "take-root-activation",
        name: "Take Root roll on activation",
        description:
          "2+ acts as normal; a 1 becomes Rooted (may still act in place, but not move)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.TAKE_ROOT] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "roots",
            name: "Rolls a 1 — Rooted",
            matches: (r) => skillTriggered(r, SkillType.TAKE_ROOT),
            verify: (r) => {
              assert(
                hasCondition(r, "team1:0", PlayerCondition.ROOTED),
                "the player becomes Rooted"
              );
              assert(
                !activationOver(r, "team1:0"),
                "a Rooted player may still perform their Action in place"
              );
            },
          },
          {
            id: "free",
            name: "Rolls 2+ — acts as normal",
            matches: (r) =>
              rolled(r, "Take Root") && !skillTriggered(r, SkillType.TAKE_ROOT),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.TIMMM_BER,
    configs: [
      {
        id: "timmber-stand-up",
        name: "Timmm-ber! aids a low-MA stand up",
        description:
          "An MA 2 player rolling to stand up gets +1 for each Open Standing adjacent team-mate",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              status: "Prone" as never,
              skills: [SkillType.TIMMM_BER],
              stats: { MA: 2 },
            },
            { playerIndex: 1, x: 10, y: 6 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "standUp" },
          { type: "stand-up", playerId: "team1:0" },
        ],
        outcomes: [
          {
            id: "gets-bonus",
            name: "The stand-up roll is aided",
            matches: (r) => skillTriggered(r, SkillType.TIMMM_BER),
            verify: (r) =>
              assert(
                (skillCheckDiff(r, "Stand Up") ?? 0) >= 1,
                "at least +1 to the stand-up roll"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.DRUNKARD,
    configs: [
      {
        id: "drunkard-rush",
        name: "Drunkard fumbles a Rush",
        description: "A -1 modifier applies to every Rush test",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 5,
              y: 5,
              skills: [SkillType.DRUNKARD],
              stats: { MA: 1 },
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          {
            type: "move",
            playerId: "team1:0",
            path: [
              { x: 6, y: 5 },
              { x: 7, y: 5 },
            ],
          },
        ],
        outcomes: [
          {
            id: "minus-one",
            name: "The Rush is rolled at -1",
            matches: (r) => skillTriggered(r, SkillType.DRUNKARD),
            verify: (r) =>
              assert(
                (skillCheckDiff(r, "Rush (GFI)") ?? 0) <= -1,
                "the Rush test is worsened by Drunkard"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.LONER,
    configs: [
      {
        id: "loner-team-reroll",
        name: "Loner may waste a Team Re-roll",
        description:
          "Using a Team Re-roll needs a D6 roll; below the threshold the re-roll is lost unused",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.LONER, parameter: "4+" }],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        rerolls: { team1: 1 },
        decisionPolicy: { acceptRerolls: "team" },
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 9, y: 4 }] },
        ],
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "reroll-lost",
            name: "Loner fails — the Team Re-roll is wasted",
            matches: (r) => skillTriggered(r, SkillType.LONER),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.PRO,
    configs: [
      {
        id: "pro-die-reroll",
        name: "Pro attempts a die-level re-roll",
        description:
          "On a failed dodge Pro may be offered; a 3+ re-rolls the die, a 1-2 wastes it and locks out other sources",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PRO] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 9, y: 4 }] },
        ],
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "pro-rerolls",
            name: "Pro succeeds — the die is re-rolled",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.RerollUsed,
                (d) => (d as { source?: string }).source === "pro"
              ),
          },
          {
            id: "pro-fails",
            name: "Pro fails — no other re-roll may be used",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.PRO &&
                  !!(d as { effect?: string }).effect?.includes("fails")
              ),
          },
        ],
      },
      {
        id: "pro-rerolls-a-pickup",
        name: "Pro re-rolls a single die (a pick-up)",
        description:
          "Pro is not limited to dodges: a 3+ re-rolls a failed pick-up too (a die rolled on its own)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PRO] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 11, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 5 }] },
        ],
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "rerolls-pickup",
            name: "A failed pick-up is re-rolled by Pro",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.RerollUsed,
                (d) =>
                  (d as { source?: string }).source === "pro" &&
                  (d as { rollKind?: string }).rollKind === "pickup"
              ),
          },
        ],
      },
      {
        id: "pro-locks-out-other-rerolls",
        name: "Once Pro is attempted, no other re-roll may be used",
        description:
          "With a Team Re-roll available, choosing Pro on a failed dodge locks the die — the Team Re-roll is never spent on it",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PRO] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        rerolls: { team1: 1 },
        decisionPolicy: { acceptRerolls: "pro" },
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 9, y: 4 }] },
        ],
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "team-reroll-locked-out",
            name: "Pro is attempted and the Team Re-roll is not spent on the die",
            matches: (r) =>
              (sawEvent(
                r,
                GameEventNames.RerollUsed,
                (d) => (d as { source?: string }).source === "pro"
              ) ||
                sawEvent(
                  r,
                  GameEventNames.SkillTriggered,
                  (d) =>
                    (d as { skill?: string }).skill === SkillType.PRO &&
                    !!(d as { effect?: string }).effect?.includes("fails")
                )) &&
              !sawEvent(
                r,
                GameEventNames.RerollUsed,
                (d) => (d as { source?: string }).source === "team"
              ),
            verify: (r) =>
              assert(
                !sawEvent(
                  r,
                  GameEventNames.RerollUsed,
                  (d) => (d as { source?: string }).source === "team"
                ),
                "the Team Re-roll must not be spent once Pro is attempted"
              ),
          },
        ],
      },
      {
        id: "pro-rerolls-a-block-die",
        name: "Pro re-rolls a single block die",
        description:
          "During a Block, Pro may re-roll ONE die (3+); the coach picks which die, and no other re-roll may follow",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.PRO],
              stats: { ST: 4 },
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        decisionPolicy: {
          // On the block-dice choice, spend Pro on the first die once, then
          // pick a result; other decisions (push, follow-up) fall through.
          custom: (pending, game) => {
            if (pending.type !== "block-dice") return undefined;
            const gs = game.ctx.gameService;
            const attacker = gs.getPlayerById(pending.attackerId);
            if (
              attacker &&
              hasSkill(attacker.skills, SkillType.PRO) &&
              gs.getRerollArbiter().onceAvailable(attacker, SkillType.PRO)
            ) {
              return {
                type: "pro-reroll-block",
                attackerId: pending.attackerId,
                dieIndex: 0,
              };
            }
            return { type: "choose-block-result", index: 0 };
          },
        },
        script: [
          { type: "declare-action", playerId: "team1:0", action: "block" },
          { type: "block", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "block-die-rerolled",
            name: "Pro re-rolls a block die (3+)",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.PRO &&
                  !!(d as { effect?: string }).effect?.includes(
                    "re-rolled a block die"
                  )
              ),
          },
          {
            id: "block-die-fails",
            name: "Pro fails on the block die (1-2)",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.PRO &&
                  !!(d as { effect?: string }).effect?.includes("fails")
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.ANIMAL_SAVAGERY,
    configs: [
      {
        id: "animal-savagery-activation",
        name: "Animal Savagery lashes out",
        description:
          "4+ (or +2 on a Block/Blitz) acts as normal; 1-3 Knocks Down an adjacent team-mate",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.ANIMAL_SAVAGERY],
            },
            { playerIndex: 1, x: 10, y: 6 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "lashes-out",
            name: "Rolls 1-3 — a team-mate is Knocked Down",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill ===
                    SkillType.ANIMAL_SAVAGERY &&
                  !!(d as { effect?: string }).effect?.includes("lashes out")
              ),
            verify: (r) =>
              assert(
                playerDown(r, "team1:1"),
                "the chosen team-mate is Knocked Down"
              ),
          },
          {
            id: "acts",
            name: "Rolls 4+ — acts as normal",
            matches: (r) =>
              rolled(r, "Animal Savagery") &&
              !skillTriggered(r, SkillType.ANIMAL_SAVAGERY),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BLOODLUST,
    configs: [
      {
        id: "bloodlust-activation",
        name: "Bloodlust on activation",
        description:
          "Below the threshold the coach may change the declared Action to a Move (the Thrall bite is out of scope)",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.BLOODLUST, parameter: "3+" }],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "thirst",
            name: "Fails the roll — the thirst takes hold",
            matches: (r) => skillTriggered(r, SkillType.BLOODLUST),
          },
          {
            id: "sated",
            name: "Makes the roll — activates as normal",
            matches: (r) =>
              rolled(r, "Bloodlust") && !skillTriggered(r, SkillType.BLOODLUST),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.ANIMOSITY,
    configs: [
      {
        id: "animosity-pass",
        name: "Animosity may refuse a pass",
        description:
          "Passing to a matching team-mate (here Animosity (all)) risks a 1: the player refuses and the activation ends",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 5,
              y: 5,
              skills: [{ type: SkillType.ANIMOSITY, parameter: "all" }],
            },
            { playerIndex: 1, x: 8, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 8, y: 5 },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "refuses",
            name: "Rolls a 1 — refuses to throw",
            matches: (r) => skillTriggered(r, SkillType.ANIMOSITY),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 5, y: 5 }),
                "the passer keeps their square"
              );
              assert(!turnoverHappened(r), "a refused pass is not a turnover");
              assert(
                activationOver(r, "team1:0"),
                "the refusal ends the activation"
              );
            },
          },
          {
            id: "throws",
            name: "Rolls 2+ — the pass proceeds",
            matches: (r) =>
              rolled(r, "Animosity") && !skillTriggered(r, SkillType.ANIMOSITY),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.HATRED,
    configs: [
      {
        id: "hatred-reroll",
        name: "Hatred re-rolls a Player Down",
        description:
          "Blocking a hated opponent (here Hatred (all)) lets the attacker re-roll a single Player Down die",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [{ type: SkillType.HATRED, parameter: "all" }],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "block" },
          {
            type: "block",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "rerolled",
            name: "A Player Down die is re-rolled",
            matches: (r) => skillTriggered(r, SkillType.HATRED),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.PICK_ME_UP,
    configs: [
      {
        id: "pick-me-up-end-turn",
        name: "Pick-Me-Up stands a team-mate at end of turn",
        description:
          "At the end of the opponent's turn, a 5+ stands a Prone team-mate within 3 squares of a Standing holder",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PICK_ME_UP] },
            { playerIndex: 1, x: 11, y: 5, status: "Prone" as never },
          ],
          team2Placements: [{ playerIndex: 0, x: 2, y: 2 }],
          activeTeam: "team2",
          ballPosition: { x: 1, y: 1 },
        }),
        script: [{ type: "end-turn" }],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "stands",
            name: "The Prone team-mate stands up",
            matches: (r) => skillTriggered(r, SkillType.PICK_ME_UP),
            verify: (r) =>
              assert(
                !playerDown(r, "team1:1"),
                "the Prone team-mate is Standing again"
              ),
          },
          {
            id: "stays-down",
            name: "The roll fails — still Prone",
            matches: (r) =>
              rolled(r, "Pick-Me-Up") &&
              !skillTriggered(r, SkillType.PICK_ME_UP),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.TRICKSTER,
    configs: [
      {
        id: "trickster-relocates",
        name: "Trickster slips away from a block",
        description:
          "Before the dice are determined the blocked player may move to an unoccupied square adjacent to the attacker",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.TRICKSTER] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "block" },
          {
            type: "block",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        outcomes: [
          {
            id: "slips",
            name: "The defender relocates before the dice",
            matches: (r) => skillTriggered(r, SkillType.TRICKSTER),
            verify: (r) =>
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "the Trickster left their original square"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.ALWAYS_HUNGRY,
    configs: [
      {
        id: "always-hungry-ttm",
        name: "Always Hungry on a Throw Team-mate Action",
        description:
          "Before completing a throw, an Always Hungry player rolls to eat the team-mate: 1 then 1 = eaten (removed, turnover); 1 then 2+ = squirm free (Fumbled Throw); 2+ = throw proceeds normally",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [
            // Trained Troll — Always Hungry + Throw Team-mate, both native.
            { playerIndex: 0, x: 10, y: 5 },
            // Goblin Lineman (Right Stuff) — the meal / the throw.
            { playerIndex: 1, x: 11, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
          ballPosition: { x: 18, y: 9 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "throwTeamMate" },
          {
            type: "throw-teammate",
            throwerId: "team1:0",
            teammateId: "team1:1",
            x: 14,
            y: 5,
            mode: "throw",
          },
        ],
        seedSearch: { from: 1, limit: 2000 },
        outcomes: [
          {
            id: "eats-teammate",
            name: "Eats the team-mate — removed, turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.ALWAYS_HUNGRY) &&
              sawEvent(
                r,
                GameEventNames.UI_Notification,
                (d) => typeof d === "string" && d.includes("EATS")
              ),
            verify: (r) =>
              assert(turnoverHappened(r), "eating a team-mate is a turnover"),
          },
          {
            id: "squirms-free",
            name: "Team-mate squirms free — Fumbled Throw",
            matches: (r) =>
              skillTriggered(r, SkillType.ALWAYS_HUNGRY) &&
              sawEvent(
                r,
                GameEventNames.UI_Notification,
                (d) => typeof d === "string" && d.includes("squirms free")
              ),
            verify: (r) =>
              assert(
                turnoverHappened(r),
                "a squirm-free Fumbled Throw is a turnover"
              ),
          },
          {
            id: "proceeds-normally",
            name: "Hungry roll of 2+ — the throw proceeds",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              !skillTriggered(r, SkillType.ALWAYS_HUNGRY),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.MY_BALL,
    configs: [
      {
        id: "my-ball-refuses-pass",
        name: "My Ball may not give up the ball",
        description:
          "A ball carrier with My Ball cannot declare a Pass Action",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 5, y: 5, skills: [SkillType.MY_BALL] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
        ],
        outcomes: [
          {
            id: "declaration-refused",
            name: "The Pass declaration is refused",
            matches: (r) =>
              r.responses.some(
                (resp) =>
                  !resp.ok &&
                  !!resp.reason?.includes("illegal-action-declaration")
              ),
            verify: (r) =>
              assert(
                r.game.ctx.gameService.getState().activePlayer?.id !==
                  resolveRef(r.game, "team1:0"),
                "no Pass Action may be declared for the My Ball carrier"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.HYPNOTIC_GAZE,
    configs: [
      {
        id: "hypnotic-gaze-action",
        name: "Hypnotic Gaze Special Action",
        description:
          "Against an adjacent Standing opponent: 1-2 nothing, 3+ the target becomes Distracted; the activation ends either way",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.HYPNOTIC_GAZE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "gaze" },
          {
            type: "special-action",
            action: "gaze",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "hypnotised",
            name: "Rolls 3+ — the target is Distracted",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.HYPNOTIC_GAZE &&
                  !!(d as { effect?: string }).effect?.includes("Distracted")
              ),
            verify: (r) =>
              assert(
                hasCondition(r, "team2:0", PlayerCondition.DISTRACTED),
                "the target becomes Distracted"
              ),
          },
          {
            id: "resisted",
            name: "Rolls 1-2 — nothing happens",
            matches: (r) =>
              rolled(r, "Hypnotic Gaze") &&
              !hasCondition(r, "team2:0", PlayerCondition.DISTRACTED),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BREATHE_FIRE,
    configs: [
      {
        id: "breathe-fire-action",
        name: "Breathe Fire Special Action",
        description:
          "Against a Marked Standing opponent: on 4+ the target is Placed Prone (natural 6 Knocks Down; natural 1 burns the breather)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BREATHE_FIRE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:0",
            action: "breatheFire",
          },
          {
            type: "special-action",
            action: "breatheFire",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "target-down",
            name: "The target is put down",
            matches: (r) =>
              skillTriggered(r, SkillType.BREATHE_FIRE) &&
              playerDown(r, "team2:0"),
          },
          {
            id: "no-effect",
            name: "Nothing happens (2-3)",
            matches: (r) =>
              skillTriggered(r, SkillType.BREATHE_FIRE) &&
              !playerDown(r, "team2:0") &&
              !playerDown(r, "team1:0"),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.PROJECTILE_VOMIT,
    configs: [
      {
        id: "projectile-vomit-action",
        name: "Projectile Vomit Special Action",
        description:
          "Against an adjacent Standing opponent: 2+ an unmodifiable Armour Roll on the target, a 1 douses the vomiter instead",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.PROJECTILE_VOMIT],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { AV: 3 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "vomit" },
          {
            type: "special-action",
            action: "vomit",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "vomits",
            name: "The vomit is aimed and an Armour Roll follows",
            matches: (r) =>
              skillTriggered(r, SkillType.PROJECTILE_VOMIT) &&
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) => (d as { rollType?: string }).rollType === "Armor Check"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.MONSTROUS_MOUTH,
    configs: [
      {
        id: "chomp-action",
        name: "Chomp Special Action",
        description:
          "Against a Marked Standing opponent: 1-2 nothing, 3+ the target is Chomped and pinned while Marked",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.MONSTROUS_MOUTH],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "chomp" },
          {
            type: "special-action",
            action: "chomp",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 300 },
        outcomes: [
          {
            id: "chomped",
            name: "Rolls 3+ — the target is Chomped",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill ===
                    SkillType.MONSTROUS_MOUTH &&
                  !!(d as { effect?: string }).effect?.includes("Chomped")
              ),
            verify: (r) =>
              assert(
                hasCondition(r, "team2:0", PlayerCondition.CHOMPED),
                "the target is Chomped"
              ),
          },
          {
            id: "missed",
            name: "Rolls 1-2 — nothing happens",
            matches: (r) =>
              rolled(r, "Chomp") &&
              !hasCondition(r, "team2:0", PlayerCondition.CHOMPED),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.PLAGUE_RIDDEN,
    configs: [
      blockConfig({
        id: "plague-ridden-reinforcement",
        name: "Plague Ridden — reinforcement on a Block kill",
        description:
          "When a Plague Ridden Nurgle player kills an eligible opponent (not Big Guy / Decay / Regeneration / Stunty) with a Block, their coach adds one Lineman to the Reserves Box — once per game",
        // Nurgle Rotter (Plague Ridden) vs a fragile Human Lineman with low
        // Armour so the block reaches a Casualty; seed-hunted to a Dead roll.
        setup: playSetup({
          team1Roster: RosterName.NURGLE,
          team2Roster: RosterName.HUMAN,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, stats: { ST: 1, AV: 3 } },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        decisionPolicy: { followUp: false },
        seedSearch: { from: 1, limit: 5000 },
        outcomes: [
          {
            id: "reserve-added",
            name: "A Lineman joins the Reserves after a Dead casualty",
            matches: (r) =>
              skillTriggered(r, SkillType.PLAGUE_RIDDEN) &&
              r.game.ctx.team1.players.length > 7,
            verify: (r) => {
              const team1 = r.game.ctx.team1;
              const team2 = r.game.ctx.team2;
              assert(
                team1.players.length === 8,
                "exactly one reinforcement is added to the killer's team"
              );
              assert(
                team2.players.length === 7,
                "the victim's team gains nothing — the Reserve is only on the killing side"
              );
              const added = team1.players[team1.players.length - 1];
              assert(
                added.status === PlayerStatus.RESERVE && !added.gridPosition,
                "the reinforcement waits in the Reserves Box"
              );
              assert(
                added.keywords.includes(PositionKeyWord.LINEMAN),
                "the reinforcement is a Lineman"
              );
              // The killed player leaves the pitch for the Casualty box.
              const victim = team2.players[0];
              assert(
                victim.status === PlayerStatus.DEAD && !victim.gridPosition,
                "the dead player is removed from the pitch"
              );
            },
          },
        ],
      }),
    ],
  },
];
