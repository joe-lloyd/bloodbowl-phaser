import { z } from "zod";
import { fixtureValue } from "../../testing/fixtureValue";
import { SkillType } from "../../types/Skills";
import { RosterName } from "../../types/Team";
import {
  type RuleScenarioEntry,
  type RuleConfig,
  playSetup,
  skillRerollConfig,
  blockConfig,
  assert,
  skillTriggered,
  skillCheckDiff,
  reactionOffered,
  playerStanding,
  playerAt,
  playerDown,
  playerOf,
  turnoverHappened,
  sawEvent,
  blockDiceCount,
} from "../../game/rules-lab";
import { GameEventNames } from "../../types/events";
import { PlayerStatus } from "../../types/Player";

const straightPath = (steps: number) =>
  Array.from({ length: steps }, (_, i) => ({ x: 3 + i, y: 5 }));

export const AGILITY_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.LEAP,
    configs: [
      {
        id: "leap-softens-penalty",
        name: "Leap reduces the Jump penalty",
        description:
          "A -2 marking penalty on a Jump over a Prone player is reduced to -1",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.LEAP] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 10, y: 4, status: PlayerStatus.PRONE },
            { playerIndex: 1, x: 9, y: 3 },
            { playerIndex: 2, x: 11, y: 3 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "jump", playerId: "team1:0", x: 10, y: 3 },
        ],
        seedSearch: { from: 1, limit: 50 },
        outcomes: [
          {
            id: "penalty-reduced",
            name: "Net Jump modifier is -1, not -2",
            matches: (r) =>
              skillTriggered(r, SkillType.LEAP) &&
              skillCheckDiff(r, "Jump") === -1,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Jump") === -1,
                "Leap must reduce the -2 marking penalty to -1"
              );
            },
          },
        ],
      },
      {
        id: "leap-over-standing-player",
        name: "Leap can Jump over a Standing player",
        description:
          "Base Jump only clears Prone/Stunned; Leap clears a Standing player too",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.LEAP] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "jump", playerId: "team1:0", x: 12, y: 5 },
        ],
        seedSearch: { from: 1, limit: 50 },
        outcomes: [
          {
            id: "jump-resolved",
            name: "The Jump over a Standing player is rolled",

            matches: (r) =>
              r.events.some(
                (e) =>
                  e.name === GameEventNames.DiceRoll &&
                  !!z
                    .object({ rollType: z.string().exactOptional() })
                    .parse(e.data)
                    .rollType?.startsWith("Jump")
              ),
            verify: (r) => {
              assert(
                r.events.some(
                  (e) =>
                    e.name === GameEventNames.DiceRoll &&
                    !!z
                      .object({ rollType: z.string().exactOptional() })
                      .parse(e.data)
                      .rollType?.startsWith("Jump")
                ),
                "Leap must allow the Jump over a Standing player to resolve"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.POGO,
    configs: [
      {
        id: "pogo-ignores-penalty",
        name: "Pogo ignores the Jump penalty",
        description: "A -2 marking penalty on a Jump is ignored (net 0)",
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.POGO,
            roster: RosterName.NIGHT_GOBLIN,
            positionName: "Squig Hopper",
            source: "scenario-isolation",
            reason:
              "A lineman isolates the Jump modifier from the Hopper's Squig Rage roll.",
          },
        ],
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.POGO] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 10, y: 4, status: PlayerStatus.PRONE },
            { playerIndex: 1, x: 9, y: 3 },
            { playerIndex: 2, x: 11, y: 3 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "jump", playerId: "team1:0", x: 10, y: 3 },
        ],
        seedSearch: { from: 1, limit: 50 },
        outcomes: [
          {
            id: "penalty-ignored",
            name: "Net Jump modifier is 0",
            matches: (r) =>
              skillTriggered(r, SkillType.POGO) &&
              skillCheckDiff(r, "Jump") === 0,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Jump") === 0,
                "Pogo must ignore the -2 marking penalty"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.VERY_LONG_LEGS,
    configs: [
      {
        id: "very-long-legs-jump-bonus",
        name: "Very Long Legs adds +1 to the Jump",
        description:
          "+1 to the Agility Test on an unmarked Jump over a Prone player",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.VERY_LONG_LEGS],
            },
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "jump", playerId: "team1:0", x: 12, y: 5 },
        ],
        seedSearch: { from: 1, limit: 100 },
        outcomes: [
          {
            id: "plus-one-applied",
            name: "Net Jump modifier is +1",
            matches: (r) =>
              skillTriggered(r, SkillType.VERY_LONG_LEGS) &&
              skillCheckDiff(r, "Jump") === 1,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Jump") === 1,
                "Very Long Legs must add +1 to the Jump Agility Test"
              );
            },
          },
          {
            id: "lands-standing",
            name: "A passed Jump lands the player Standing beyond",
            matches: (r) =>
              playerAt(r, "team1:0", { x: 12, y: 5 }) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 12, y: 5 }),
                "the jumper must land in the target square"
              );
              assert(
                playerStanding(r, "team1:0"),
                "a successful Jump leaves the player Standing"
              );
            },
          },
        ],
      },
      {
        id: "very-long-legs-intercept-bonus",
        name: "Very Long Legs adds +2 to an interception",
        description:
          "A Very Long Legs defender on the pass line intercepts at +2 (accurate -3 → -1)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5 },
            { playerIndex: 1, x: 10, y: 5 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 7,
              y: 5,
              skills: [SkillType.VERY_LONG_LEGS],
            },
          ],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 10, y: 5 },
        ],
        decisionPolicy: { acceptInterceptions: false },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "plus-two-offered",
            name: "An accurate pass offers the interception at -1 (-3 + 2)",
            matches: (r) =>
              skillTriggered(r, SkillType.VERY_LONG_LEGS) &&
              r.decisions.some(
                (d) =>
                  d.type === "interception" &&
                  d.candidates.some((c) => c.modifier === -1)
              ),
            verify: (r) => {
              const d = r.decisions.find((x) => x.type === "interception");
              assert(d !== undefined, "an interception is raised");

              assert(
                d.candidates.some((c) => c.modifier === -1),
                "Very Long Legs must turn the -3 accurate interception into -1"
              );
            },
          },
        ],
      },
      {
        id: "very-long-legs-ignores-cloud-burster",
        name: "Very Long Legs ignores Cloud Burster",
        description:
          "A Cloud Burster pass may still be Intercepted by a Very Long Legs defender",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.CLOUD_BURSTER] },
            { playerIndex: 1, x: 10, y: 5 },
          ],
          team2Placements: [
            {
              playerIndex: 0,
              x: 7,
              y: 5,
              skills: [SkillType.VERY_LONG_LEGS],
            },
          ],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "pass" },
          { type: "pass", playerId: "team1:0", x: 10, y: 5 },
        ],
        decisionPolicy: { acceptInterceptions: false },
        seedSearch: { from: 1, limit: 200 },
        outcomes: [
          {
            id: "intercept-still-offered",
            name: "The Very Long Legs defender is still offered the interception",
            matches: (r) =>
              skillTriggered(r, SkillType.CLOUD_BURSTER) &&
              skillTriggered(r, SkillType.VERY_LONG_LEGS) &&
              r.decisions.some((d) => d.type === "interception"),
            verify: (r) => {
              assert(
                r.decisions.some((d) => d.type === "interception"),
                "Very Long Legs must be offered the interception despite Cloud Burster"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SAFE_PAIR_OF_HANDS,
    configs: [
      blockConfig({
        id: "safe-pair-of-hands-places-ball",
        name: "Safe Pair of Hands places the ball, not bounces it",
        description:
          "A knocked-down carrier with Safe Pair of Hands sets the ball in an adjacent empty square",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.SAFE_PAIR_OF_HANDS],
            },
          ],
          ballPosition: { x: 11, y: 5 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "ball-placed-adjacent",
            name: "The ball ends adjacent to the downed carrier",
            matches: (r) => {
              if (!skillTriggered(r, SkillType.SAFE_PAIR_OF_HANDS))
                return false;
              const ball = r.snapshot.ballPosition;
              const dp = playerOf(r, "team2:0").gridPosition;
              if (!ball || !dp) return false;
              const dx = Math.abs(ball.x - dp.x);
              const dy = Math.abs(ball.y - dp.y);
              return dx <= 1 && dy <= 1 && dx + dy > 0;
            },
            verify: (r) => {
              const ball = fixtureValue(r.snapshot.ballPosition);
              const dp = fixtureValue(playerOf(r, "team2:0").gridPosition);
              assert(
                !(ball.x === dp.x && ball.y === dp.y),
                "the ball must not stay on the downed carrier's square"
              );
              const dx = Math.abs(ball.x - dp.x);
              const dy = Math.abs(ball.y - dp.y);
              assert(
                dx <= 1 && dy <= 1 && dx + dy > 0,
                "the ball must be placed in an adjacent square"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.HIT_AND_RUN,
    configs: [
      blockConfig({
        id: "hit-and-run-free-square",
        name: "Hit and Run takes a free square after a Block",
        description:
          "A still-Standing blocker with Hit and Run moves one free square after knocking the target down",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.HIT_AND_RUN] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "moved-free",
            name: "The blocker ends off its block square, still Standing",
            matches: (r) =>
              skillTriggered(r, SkillType.HIT_AND_RUN) &&
              !playerAt(r, "team1:0", { x: 10, y: 5 }) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              const pos = fixtureValue(playerOf(r, "team1:0").gridPosition);
              assert(
                !(pos.x === 10 && pos.y === 5),
                "the Hit and Run blocker must leave its block square"
              );
              assert(
                playerStanding(r, "team1:0"),
                "the Hit and Run move keeps the player Standing"
              );

              assert(
                Math.abs(pos.x - 10) <= 1 && Math.abs(pos.y - 5) <= 1,
                "Hit and Run is a single free square"
              );
            },
          },
        ],
      }),
    ],
  },
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
            verify: (r) => {
              assert(
                playerStanding(r, "team2:0"),
                "the dodger must stay on their feet"
              );
            },
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

          { type: "move", playerId: "team1:0", path: straightPath(7) },
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

          { type: "move", playerId: "team1:0", path: straightPath(9) },
        ],
        outcomes: [
          {
            id: "nine-squares-moved",
            name: "All three rushes taken",
            matches: (r) =>
              r.responses.every((resp) => resp.ok) &&
              playerAt(r, "team1:0", { x: 11, y: 5 }),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 11, y: 5 }),
                "player must reach MA+3 squares"
              );
            },
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
                (d) => z.object({ cost: z.number() }).parse(d).cost === 0
              ),
            verify: (r) => {
              const mover = fixtureValue(r.snapshot.teams[0]).players[0];
              assert(
                fixtureValue(mover).movementUsed === 1,
                "one square moved must cost exactly 1 movement"
              );
            },
          },
        ],
      },
      {
        id: "jump-up-prone-block",
        name: "Block declared while Prone",
        description:
          "Jump Up's second clause: a Prone player may declare a Block. " +
          "Standing up to make it needs an Agility Test with a +1 modifier. " +
          "Passed, they stand for free and the Block is thrown; failed, the " +
          "Action is wasted — and crucially that is NOT a Turnover, so the " +
          "team-mate at (3,8) can still act. Attacker and defender are both " +
          "ST 3, so the Block is a single die and the seed decides whether " +
          "the defender is pushed, knocked down, or the blocker goes " +
          "straight back down again.",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              status: PlayerStatus.PRONE,
              skills: [SkillType.JUMP_UP],
              stats: { AG: 4, ST: 3 },
            },

            { playerIndex: 1, x: 3, y: 8 },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 3 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "block" },
          { type: "stand-up", playerId: "team1:0" },
          {
            type: "block",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],

        decisionPolicy: { followUp: false },
        outcomes: [
          {
            id: "stand-up-failed",
            name: "Failed Agility Test — Action wasted, NOT a Turnover",
            matches: (r) =>
              blockDiceCount(r) === undefined && playerDown(r, "team1:0"),
            verify: (r) => {
              assert(
                sawEvent(
                  r,
                  GameEventNames.DiceRoll,
                  (d) =>
                    z
                      .object({ rollType: z.string().exactOptional() })
                      .parse(d)
                      .rollType?.startsWith("Jump Up") ?? false
                ),
                "the Jump Up stand-up test was rolled"
              );
              assert(
                playerDown(r, "team1:0"),
                "a failed test leaves the player Prone"
              );
              assert(
                blockDiceCount(r) === undefined,
                "no Block is thrown when the player never stood up"
              );
              assert(
                !turnoverHappened(r),
                "a failed Jump Up stand-up is NOT a Turnover"
              );

              assert(
                r.snapshot.activeTeamId === r.game.ctx.team1.id,
                "the blocking team still holds the turn"
              );
              const mate = playerOf(r, "team1:1");
              assert(
                r.game.ctx.gameService.canActivate(mate.id),
                "the team-mate can still be activated — the turn did not end"
              );
            },
          },
          {
            id: "stood-and-pushed",
            name: "Passed — stands for free and pushes the defender back",
            matches: (r) =>
              blockDiceCount(r) !== undefined &&
              playerStanding(r, "team1:0") &&
              playerStanding(r, "team2:0") &&
              !playerAt(r, "team2:0", { x: 11, y: 5 }),
            verify: (r) => {
              assert(
                playerStanding(r, "team1:0"),
                "a passed test leaves the blocker Standing"
              );
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "the defender was pushed out of their square"
              );
              assert(
                fixtureValue(fixtureValue(r.snapshot.teams[0]).players[0])
                  .movementUsed === 0,
                "standing up via Jump Up spends no movement"
              );
              assert(!turnoverHappened(r), "a push is not a Turnover");
            },
          },
          {
            id: "stood-and-knocked-down",
            name: "Passed — stands and knocks the defender down",
            matches: (r) =>
              blockDiceCount(r) !== undefined &&
              playerStanding(r, "team1:0") &&
              playerDown(r, "team2:0"),
            verify: (r) => {
              assert(
                playerStanding(r, "team1:0"),
                "the blocker is left Standing"
              );
              assert(playerDown(r, "team2:0"), "the defender is knocked down");
              assert(
                !turnoverHappened(r),
                "knocking an opponent down is not a Turnover"
              );
            },
          },
          {
            id: "blocker-back-down",
            name: "Passed, blocked, and went straight back down (Turnover)",
            matches: (r) =>
              blockDiceCount(r) !== undefined && playerDown(r, "team1:0"),
            verify: (r) => {
              assert(
                blockDiceCount(r) !== undefined,
                "the Block was thrown, so the stand-up test had passed"
              );
              assert(
                playerDown(r, "team1:0"),
                "the blocker ends the Block on the floor again"
              );
              assert(
                turnoverHappened(r),
                "the active team's player going down IS a Turnover — the " +
                  "contrast with a failed stand-up"
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
            { playerIndex: 0, x: 10, y: 5 },
            { playerIndex: 1, x: 11, y: 6, skills: [SkillType.GUARD] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5 },
            { playerIndex: 1, x: 10, y: 7, skills: [SkillType.DEFENSIVE] },
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
            verify: (r) => {
              assert(
                blockDiceCount(r) === 1,
                "Defensive must cancel the Guard assist, leaving a single die"
              );
            },
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
            { playerIndex: 0, x: 4, y: 5 },
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
              const push:
                | {
                    options: { x: number; y: number }[];
                    chooserTeamId?: string;
                  }
                | undefined = r.decisions.find(
                (d) => d.type === "push-direction"
              );
              assert(!!push, "a push-direction decision must be raised");
              assert(
                push.chooserTeamId === r.game.ctx.team2.id,
                "the PUSHED player's coach must choose the square"
              );
              const opts = push.options;
              assert(
                opts.some((o) => o.x === 11 && o.y === 4) &&
                  opts.some((o) => o.x === 11 && o.y === 6),
                "any adjacent unoccupied square must be offered"
              );
              assert(
                opts.every((o) => !(o.x === 10 && o.y === 5)),
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
            verify: (r) => {
              assert(
                !reactionOffered(r, { skill: SkillType.SIDESTEP }),
                "Sidestep cannot be used against a Grab block"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.FUMBLEROOSKI,
    configs: [
      {
        id: "fumblerooski-leaves-ball",
        name: "Fumblerooski leaves the ball behind",
        description:
          "During a Move, the carrier places the ball in the square they just vacated without causing a Turnover",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 4,
              y: 5,
              skills: [SkillType.FUMBLEROOSKI],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 4, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
          { type: "fumblerooski", playerId: "team1:0", x: 4, y: 5 },
        ],
        outcomes: [
          {
            id: "ball-left-no-turnover",
            name: "The ball remains in the vacated square",
            matches: (r) =>
              skillTriggered(r, SkillType.FUMBLEROOSKI) &&
              !turnoverHappened(r) &&
              r.snapshot.ballPosition?.x === 4 &&
              r.snapshot.ballPosition.y === 5 &&
              playerAt(r, "team1:0", { x: 5, y: 5 }),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "Fumblerooski must not cause a Turnover"
              );
              assert(
                r.snapshot.ballPosition?.x === 4 &&
                  r.snapshot.ballPosition.y === 5,
                "the ball must be left in the vacated square"
              );
            },
          },
        ],
      },
    ],
  },
];

export const JUMP_OVER_PRONE_SCENARIO: RuleConfig = {
  id: "jump-over-prone",
  name: "Jump over a Prone player",
  description:
    "The basic Jump: cross an adjacent Prone player into the empty square beyond",
  setup: playSetup({
    team1Placements: [{ playerIndex: 0, x: 10, y: 5, stats: { AG: 4 } }],
    team2Placements: [
      { playerIndex: 0, x: 11, y: 5, status: PlayerStatus.PRONE },
    ],
    ballPosition: { x: 1, y: 1 },
  }),
  script: [
    { type: "declare-action", playerId: "team1:0", action: "move" },
    { type: "jump", playerId: "team1:0", x: 12, y: 5 },
  ],
  seedSearch: { from: 1, limit: 500 },
  outcomes: [
    {
      id: "cleared",
      name: "A passed Jump lands the player Standing beyond the Prone player",
      matches: (r) =>
        playerAt(r, "team1:0", { x: 12, y: 5 }) && playerStanding(r, "team1:0"),
      verify: (r) => {
        assert(
          playerAt(r, "team1:0", { x: 12, y: 5 }),
          "the jumper lands in the target square"
        );
        assert(
          playerStanding(r, "team1:0"),
          "a passed Jump leaves the player Standing"
        );
        assert(!turnoverHappened(r), "a successful Jump is not a Turnover");
      },
    },
    {
      id: "falls-in-target",
      name: "A failed Jump Falls Over in the target square (Turnover)",
      matches: (r) =>
        playerDown(r, "team1:0") && playerAt(r, "team1:0", { x: 12, y: 5 }),
      verify: (r) => {
        assert(
          playerAt(r, "team1:0", { x: 12, y: 5 }),
          "a failed Jump still moves the player into the target square"
        );
        assert(playerDown(r, "team1:0"), "the player Falls Over");
        assert(turnoverHappened(r), "a failed Jump is a Turnover");
      },
    },
    {
      id: "natural-one-falls-in-place",
      name: "A natural 1 Falls Over in the square the player started in",
      matches: (r) =>
        playerDown(r, "team1:0") && playerAt(r, "team1:0", { x: 10, y: 5 }),
      verify: (r) => {
        assert(
          playerAt(r, "team1:0", { x: 10, y: 5 }),
          "a natural 1 leaves the player in their original square, not the target"
        );
        assert(playerDown(r, "team1:0"), "the player Falls Over");
        assert(turnoverHappened(r), "a natural-1 Jump is a Turnover");
      },
    },
  ],
};

export const JUMP_SCENARIOS: RuleConfig[] = [JUMP_OVER_PRONE_SCENARIO];
