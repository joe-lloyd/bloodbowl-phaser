/**
 * Rule scenarios — Agility skills (Dodge, Catch).
 * Assertions migrated from skill-rerolls.test.ts / skill-triggers.test.ts.
 */

import { SkillType } from "../../types/Skills";
import {
  RuleScenarioEntry,
  playSetup,
  skillRerollConfig,
  blockConfig,
  assert,
  skillTriggered,
  reactionOffered,
  playerStanding,
  playerAt,
  playerOf,
  sawEvent,
  blockDiceCount,
} from "../../game/rules-lab";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";

/** Straight path of `steps` squares heading right from (fromX, y). */
const straightPath = (fromX: number, y: number, steps: number) =>
  Array.from({ length: steps }, (_, i) => ({ x: fromX + 1 + i, y }));

export const AGILITY_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DODGE,
    configs: [
      skillRerollConfig({
        id: "dodge-reroll",
        name: "Dodge away from a marker",
        description: "A failed dodge offers the Dodge skill re-roll",
        skill: SkillType.DODGE,
        rollKind: "dodge",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.DODGE] },
          ],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
      }),
      blockConfig({
        id: "dodge-stumble-becomes-push",
        name: "Defender Stumbles vs Dodge",
        description: "Without Tackle, the stumble is treated as a push",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.DODGE] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow-dodge",
        outcomes: [
          {
            id: "stumble-becomes-push",
            name: "Dodger pushed but not floored",
            matches: (r) =>
              r.decisions.some(
                (d) =>
                  d.type === "push-direction" && d.resultType === "pow-dodge"
              ) && skillTriggered(r, SkillType.DODGE),
            verify: (r) =>
              assert(
                playerStanding(r, "team2:0"),
                "the dodger must stay on their feet"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.SURE_FEET,
    configs: [
      skillRerollConfig({
        id: "sure-feet-rush",
        name: "Rush one square past MA",
        description: "A failed Rush offers the Sure Feet re-roll",
        skill: SkillType.SURE_FEET,
        rollKind: "rush",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 2, y: 5, skills: [SkillType.SURE_FEET] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // MA 6 + 1 rush = 7 squares
          { type: "move", playerId: "team1:0", path: straightPath(2, 5, 7) },
        ],
      }),
    ],
  },
  {
    skill: SkillType.SPRINT,
    configs: [
      {
        id: "sprint-three-rushes",
        name: "Move MA + 3 with Sprint",
        description: "A third Rush is allowed (nine squares on MA 6)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 2, y: 5, skills: [SkillType.SPRINT] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // MA 6 + 3 rushes = 9 squares — rejected without Sprint
          { type: "move", playerId: "team1:0", path: straightPath(2, 5, 9) },
        ],
        outcomes: [
          {
            id: "nine-squares-moved",
            name: "All three rushes taken",
            matches: (r) =>
              r.responses.every((resp) => resp.ok) &&
              playerAt(r, "team1:0", { x: 11, y: 5 }),
            verify: (r) =>
              assert(
                playerAt(r, "team1:0", { x: 11, y: 5 }),
                "player must reach MA+3 squares"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.JUMP_UP,
    configs: [
      {
        id: "jump-up-free-stand",
        name: "Prone player stands for free",
        description: "Standing up costs no movement with Jump Up",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 5,
              y: 5,
              status: PlayerStatus.PRONE,
              skills: [SkillType.JUMP_UP],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 6, y: 5 }] },
        ],
        outcomes: [
          {
            id: "stood-up-free",
            name: "Stand-up cost is zero",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.PlayerStoodUp,
                (d) => (d as { cost: number }).cost === 0
              ),
            verify: (r) => {
              const mover = r.snapshot.teams[0].players[0];
              assert(
                mover.movementUsed === 1,
                "one square moved must cost exactly 1 movement"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.DEFENSIVE,
    configs: [
      blockConfig({
        id: "defensive-cancels-guard",
        name: "Defensive cancels an enemy Guard",
        description:
          "On the assister's Turn, a Defensive marker denies their Guard (back to 1 die)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 }, // attacker
            { playerIndex: 1, x: 11, y: 6, skills: [SkillType.GUARD] }, // Guard assister
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5 }, // defender
            { playerIndex: 1, x: 10, y: 7, skills: [SkillType.DEFENSIVE] }, // Defensive marker
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "guard-denied",
            name: "Guard denied — no extra die",
            matches: (r) => blockDiceCount(r) === 1,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 1,
                "Defensive must cancel the Guard assist, leaving a single die"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.CATCH,
    configs: [
      skillRerollConfig({
        id: "catch-reroll",
        name: "Catch a pass",
        description: "A dropped catch offers the Catch skill re-roll",
        skill: SkillType.CATCH,
        rollKind: "catch",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 }, // passer, holding the ball
            { playerIndex: 1, x: 7, y: 5, skills: [SkillType.CATCH] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 7, y: 5 },
        ],
      }),
    ],
  },
  {
    skill: SkillType.DIVING_TACKLE,
    configs: [
      {
        id: "diving-tackle-drops-dodger",
        name: "Diving Tackle after the dodge roll",
        description:
          "-2 after re-rolls brings the dodger down; the tackler drops Prone in the vacated square",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 16, y: 4 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 16,
              y: 5,
              skills: [SkillType.DIVING_TACKLE],
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "dodger-down",
            name: "The succeeded dodge is flipped to a failure",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.DIVING_TACKLE }) &&
              skillTriggered(r, SkillType.DIVING_TACKLE),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 15, y: 3 }) &&
                  !playerStanding(r, "team1:0"),
                "the dodger must be down in the destination square"
              );
              assert(
                playerAt(r, "team2:0", { x: 16, y: 4 }),
                "the tackler must be Prone in the vacated square"
              );
              assert(
                playerOf(r, "team2:0").status === PlayerStatus.PRONE,
                "the tackler is placed Prone (no Armour Roll for them)"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SIDESTEP,
    configs: [
      blockConfig({
        id: "sidestep-picks-square",
        name: "Pushed player Sidesteps",
        description:
          "The pushed player's coach picks any adjacent unoccupied square",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.SIDESTEP] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "defender-chooses",
            name: "The defender's coach places the push",
            matches: (r) =>
              reactionOffered(r, {
                skill: SkillType.SIDESTEP,
                chooser: "team2",
              }),
            verify: (r) => {
              const push = r.decisions.find(
                (d) => d.type === "push-direction"
              ) as
                | {
                    options: { x: number; y: number }[];
                    chooserTeamId?: string;
                  }
                | undefined;
              assert(!!push, "a push-direction decision must be raised");
              assert(
                push!.chooserTeamId === r.game.ctx.team2.id,
                "the PUSHED player's coach must choose the square"
              );
              const opts = push!.options;
              assert(
                opts.some((o) => o.x === 11 && o.y === 4) &&
                  opts.some((o) => o.x === 11 && o.y === 6),
                "any adjacent unoccupied square must be offered"
              );
              assert(
                !opts.some((o) => o.x === 10 && o.y === 5),
                "the blocker's own square is occupied and never offered"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "sidestep-cancelled-by-grab",
        name: "Grab cancels Sidestep",
        description:
          "A blocker with Grab denies the pushed player their Sidestep",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.GRAB] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.SIDESTEP] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "no-sidestep",
            name: "No Sidestep reaction is offered",
            matches: (r) => skillTriggered(r, SkillType.GRAB),
            verify: (r) =>
              assert(
                !reactionOffered(r, { skill: SkillType.SIDESTEP }),
                "Sidestep cannot be used against a Grab block"
              ),
          },
        ],
      }),
    ],
  },
];
