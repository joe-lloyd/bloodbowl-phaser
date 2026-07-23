/**
 * Rule scenarios — Devious skills (Shadowing).
 */

import { SkillType } from "../../types/Skills";
import {
  PlayerStatus,
  PlayerCondition,
  hasCondition,
} from "../../types/Player";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
  ScriptResult,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  reactionOffered,
  playerOf,
  playerAt,
  playerStanding,
} from "../../game/rules-lab";

/** How many Armour Checks were rolled in the run (Lone Fouler's re-roll). */
const armourCheckCount = (r: ScriptResult): number =>
  r.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType?: string }).rollType === "Armor Check"
  ).length;

export const DEVIOUS_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.PUT_THE_BOOT_IN,
    configs: [
      {
        id: "put-the-boot-in-marked-assist",
        name: "Put the Boot In assists a Foul while marked",
        description:
          "A marked team-mate still lends an offensive assist to the Foul",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 }, // fouler
            {
              playerIndex: 1,
              x: 12,
              y: 5,
              skills: [SkillType.PUT_THE_BOOT_IN],
            }, // marked assister
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE }, // target
            { playerIndex: 1, x: 12, y: 4 }, // marks the assister
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "foul" },
          { type: "foul", playerId: "team1:0", x: 11, y: 5 },
        ],
        outcomes: [
          {
            id: "assist-counts",
            name: "The marked assister still counts",
            // Assist counting mutates `negated`, not the event log, so the
            // observable is the Foul's assist tally: the marked assister is
            // negated without Put the Boot In (0 offensive), counted with it.
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.UI_Notification,
                (d) =>
                  typeof d === "string" && d.includes("+1 Offensive")
              ),
            verify: (r) =>
              assert(
                sawEvent(
                  r,
                  GameEventNames.UI_Notification,
                  (d) =>
                    typeof d === "string" && d.includes("+1 Offensive")
                ),
                "Put the Boot In must let the marked player assist the Foul"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.EYE_GOUGE,
    configs: [
      blockConfig({
        id: "eye-gouge-pushed-cannot-assist",
        name: "Eye Gouge marks a pushed opponent",
        description:
          "A player Pushed Back by an Eye Gouge blocker cannot assist until next activated",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.EYE_GOUGE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "condition-applied",
            name: "The pushed opponent is Eye Gouged",
            matches: (r) =>
              skillTriggered(r, SkillType.EYE_GOUGE) &&
              hasCondition(playerOf(r, "team2:0"), PlayerCondition.EYE_GOUGED),
            verify: (r) =>
              assert(
                hasCondition(
                  playerOf(r, "team2:0"),
                  PlayerCondition.EYE_GOUGED
                ),
                "the pushed opponent must be marked unable to assist"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.DIRTY_PLAYER,
    configs: [
      {
        id: "dirty-player-modifier",
        name: "Dirty Player adds +1 to a Foul roll",
        description: "+1 applied to the Armour or Injury Roll after the roll",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.DIRTY_PLAYER] },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 7 },
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "foul" },
          { type: "foul", playerId: "team1:0", x: 11, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "modifier-applied",
            name: "Dirty Player's +1 is applied",
            matches: (r) => skillTriggered(r, SkillType.DIRTY_PLAYER),
            verify: (r) =>
              assert(
                skillTriggered(r, SkillType.DIRTY_PLAYER),
                "Dirty Player must contribute a +1 to a Foul roll"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.LONE_FOULER,
    configs: [
      {
        id: "lone-fouler-reroll",
        name: "Lone Fouler re-rolls a failed Armour Roll",
        description:
          "With no assists, a failed Foul Armour Roll is re-rolled once",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.LONE_FOULER] },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 11 }, // high AV → the first roll usually fails
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "foul" },
          { type: "foul", playerId: "team1:0", x: 11, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "armour-rerolled",
            name: "A second Armour Check is rolled",
            matches: (r) =>
              skillTriggered(r, SkillType.LONE_FOULER) &&
              armourCheckCount(r) >= 2,
            verify: (r) =>
              assert(
                armourCheckCount(r) >= 2,
                "Lone Fouler must re-roll the failed Armour Roll"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SNEAKY_GIT,
    configs: [
      {
        id: "sneaky-git-unbroken-double",
        name: "Sneaky Git avoids the send-off on an unbroken double",
        description:
          "A natural double that does not break the armour does not Send-off the fouler",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.SNEAKY_GIT] },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              status: PlayerStatus.PRONE,
              stats: { AV: 11 }, // most doubles (2..10) do not break AV 11
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "foul" },
          { type: "foul", playerId: "team1:0", x: 11, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "not-sent-off",
            name: "The fouler is spared the send-off",
            matches: (r) =>
              skillTriggered(r, SkillType.SNEAKY_GIT) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(
                skillTriggered(r, SkillType.SNEAKY_GIT),
                "Sneaky Git must fire on an unbroken double"
              );
              assert(
                !!r.snapshot.teams
                  .flatMap((t) => t.players)
                  .find(
                    (p) =>
                      p.id ===
                        r.game.ctx.team1.players[0].id && !!p.position
                  ),
                "the fouler stays on the pitch (not Sent-off)"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SHADOWING,
    configs: [
      {
        id: "shadowing-follows-dodger",
        name: "Shadowing chases the dodger",
        description:
          "A 4+ places the shadower in the vacated square after a successful dodge",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 16, y: 4 }],
          team2Placements: [
            { playerIndex: 0, x: 16, y: 5, skills: [SkillType.SHADOWING] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "follows",
            name: "The shadower ends in the vacated square",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.SHADOWING }) &&
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.SHADOWING &&
                  !!(d as { effect?: string }).effect?.includes("follows")
              ) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(
                playerAt(r, "team2:0", { x: 16, y: 4 }),
                "the shadower must occupy the vacated square"
              );
              assert(
                playerStanding(r, "team2:0"),
                "the shadower arrives Standing"
              );
              assert(
                playerAt(r, "team1:0", { x: 15, y: 3 }),
                "the dodger completes their move"
              );
            },
          },
          {
            id: "fails-to-follow",
            name: "A 1-3 leaves the shadower behind",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.SHADOWING }) &&
              sawEvent(
                r,
                GameEventNames.SkillTriggered,
                (d) =>
                  (d as { skill?: string }).skill === SkillType.SHADOWING &&
                  !!(d as { effect?: string }).effect?.includes("fails")
              ),
            verify: (r) =>
              assert(
                playerAt(r, "team2:0", { x: 16, y: 5 }),
                "the shadower must stay where they were"
              ),
          },
        ],
      },
    ],
  },
];
