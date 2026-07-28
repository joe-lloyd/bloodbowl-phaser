/**
 * Rule scenarios — General skills (Block, Wrestle, Stand Firm, Tackle).
 * Assertions migrated from skill-block.test.ts / skill-triggers.test.ts.
 */

import { SkillType } from "../../types/Skills";
import { RosterName } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { GamePhase, SubPhase } from "../../types/GameState";
import { PendingDecision } from "../../headless/protocol";
import {
  RuleScenarioEntry,
  ScriptResult,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  reactionOffered,
  turnoverHappened,
  playerStanding,
  playerDown,
  playerAt,
  playerOf,
  armourRolls,
  blockDiceCount,
} from "../../game/rules-lab";

/** A Steady Footing D6 was rolled (i.e. the player was about to fall). */
const steadyFootingRolled = (r: ScriptResult): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => !!(d as { rollType?: string }).rollType?.startsWith("Steady Footing")
  );

/** How many block-dice rolls happened (a Brawler re-roll adds a second). */
const blockRollCount = (r: ScriptResult): number =>
  r.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      (e.data as { rollType?: string }).rollType === "Block Roll"
  ).length;

/** Every `block-dice` pending decision the run raised, in order. */
const blockDiceDecisions = (
  r: ScriptResult
): Extract<PendingDecision, { type: "block-dice" }>[] =>
  r.decisions.filter(
    (d): d is Extract<PendingDecision, { type: "block-dice" }> =>
      d.type === "block-dice"
  );

/** Attacker team1:0 at (10,5) faces defender team2:0 at (11,5). */
const faceOff = (
  attackerSkills: SkillType[],
  defenderSkills: SkillType[]
) =>
  playSetup({
    team1Placements: [{ playerIndex: 0, x: 10, y: 5, skills: attackerSkills }],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5, skills: defenderSkills }],
    ballPosition: { x: 1, y: 1 },
  });

export const GENERAL_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DAUNTLESS,
    configs: [
      blockConfig({
        id: "dauntless-matches-strength",
        name: "Dauntless vs a stronger foe",
        description:
          "A D6 + own ST beating the target's ST matches it (even block, 1 die)",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.DAUNTLESS] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 4 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "strength-matched",
            name: "Strength matched — a single even die",
            matches: (r) =>
              skillTriggered(r, SkillType.DAUNTLESS) &&
              blockDiceCount(r) === 1,
            verify: (r) =>
              assert(
                blockDiceCount(r) === 1,
                "matching ST 4 makes the ST-3 blocker even (1 die)"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.FEND,
    configs: [
      blockConfig({
        id: "fend-denies-follow-up",
        name: "Fend denies the follow-up",
        description: "A pushed Fend player stops the blocker following up",
        setup: faceOff([], [SkillType.FEND]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "no-follow-up",
            name: "The blocker stays put",
            matches: (r) => skillTriggered(r, SkillType.FEND),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 10, y: 5 }),
                "the blocker must not follow up"
              );
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "the defender must be pushed back"
              );
              assert(
                !r.decisions.some((d) => d.type === "follow-up"),
                "no follow-up decision may be offered"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.STRIP_BALL,
    configs: [
      blockConfig({
        id: "strip-ball-drops-ball",
        name: "Strip Ball knocks the ball loose",
        description: "A pushed ball carrier drops the ball, which bounces",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.STRIP_BALL] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 11, y: 5 }, // the defender is holding it
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "ball-dropped",
            name: "The carrier no longer holds the ball",
            matches: (r) => skillTriggered(r, SkillType.STRIP_BALL),
            verify: (r) => {
              const defender = playerOf(r, "team2:0");
              const ball = r.snapshot.ballPosition;
              assert(
                !!ball &&
                  !!defender.gridPosition &&
                  (ball.x !== defender.gridPosition.x ||
                    ball.y !== defender.gridPosition.y),
                "the ball must have bounced off the pushed carrier"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.BRAWLER,
    configs: [
      blockConfig({
        id: "brawler-rerolls-both-down",
        name: "Brawler re-rolls a Both Down",
        description:
          "The block popup offers a Brawler button whenever a die reads " +
          "Both Down; clicking it re-rolls that single die once in place " +
          "(no separate yes/no popup — see BlockManager.brawlerRerollBlockDie).",
        setup: faceOff([SkillType.BRAWLER], []), // ST 3 v 3 → one die
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        // Brawler is no longer an auto-offered reaction: the block-dice
        // decision itself carries `brawlerAvailable`, and the coach spends it
        // with an explicit "brawler-reroll-block" command (the popup button
        // in the browser). Answer that first; the default handler then picks
        // the (possibly re-rolled) result via preferBlockResult as usual.
        decisionPolicy: {
          custom: (pending) => {
            if (pending.type === "block-dice" && pending.brawlerAvailable) {
              return { type: "brawler-reroll-block", attackerId: pending.attackerId };
            }
            return undefined;
          },
        },
        outcomes: [
          {
            id: "both-down-rerolled",
            name: "The Both Down die is re-rolled",
            matches: (r) => skillTriggered(r, SkillType.BRAWLER),
            verify: (r) =>
              assert(
                blockRollCount(r) === 2,
                "Brawler must roll a second block die"
              ),
          },
        ],
      }),
      blockConfig({
        id: "brawler-double-both-down",
        name: "Brawler re-rolls only ONE die when two show Both Down",
        description:
          "With 2 block dice and both reading Both Down, Brawler still " +
          "re-rolls exactly the first one — the second die is left " +
          "completely untouched and the button is gone afterward even " +
          "though a Both Down still shows (BlockManager.brawlerRerollBlockDie " +
          "uses findIndex, matching the FIRST both-down only).",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.BRAWLER],
              stats: { ST: 4 },
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { ST: 2 } }],
          ballPosition: { x: 1, y: 1 },
        }), // ST 4 v 2 → two dice, attacker chooses
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        decisionPolicy: {
          custom: (pending) => {
            if (pending.type === "block-dice" && pending.brawlerAvailable) {
              return { type: "brawler-reroll-block", attackerId: pending.attackerId };
            }
            return undefined;
          },
        },
        outcomes: [
          {
            id: "only-first-both-down-rerolled",
            name: "Both dice start Both Down; only the first is re-rolled",
            // The seed search needs BOTH initial dice to read Both Down —
            // narrow to that exact shape so the outcome is unambiguous.
            matches: (r) => {
              const decisions = blockDiceDecisions(r);
              const first = decisions[0];
              return (
                skillTriggered(r, SkillType.BRAWLER) &&
                !!first &&
                first.options.length === 2 &&
                first.options.every((o) => o.type === "both-down")
              );
            },
            verify: (r) => {
              const decisions = blockDiceDecisions(r);
              assert(
                decisions.length >= 2,
                "the block-dice decision must reappear after the Brawler re-roll"
              );
              const [before, after] = decisions;
              assert(
                before.options[0].type === "both-down" &&
                  before.options[1].type === "both-down",
                "both dice must start Both Down for this outcome"
              );
              // The SECOND die is untouched by BlockManager.brawlerRerollBlockDie
              // (it re-rolls only the first index findIndex finds) — still
              // exactly the same result it started as.
              assert(
                after.options[1].type === "both-down" &&
                  after.options[1].icon === before.options[1].icon,
                "the second Both Down die must be left exactly as rolled"
              );
              // Only one new die was drawn (the re-roll), not two.
              assert(
                blockRollCount(r) === 3,
                "Brawler must draw exactly one extra block die, not two"
              );
              // Spent — no longer offered even though the untouched second
              // die still legitimately reads Both Down.
              assert(
                after.brawlerAvailable === false,
                "Brawler must not be offered again after its one use per block"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.BLOCK,
    configs: [
      blockConfig({
        id: "block-attacker-both-down",
        name: "Attacker has Block",
        description: "Both Down knocks only the defender down — no turnover",
        setup: faceOff([SkillType.BLOCK], []),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "attacker-saved",
            name: "Attacker stays up on Both Down",
            matches: (r) =>
              skillTriggered(r, SkillType.BLOCK) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(playerDown(r, "team2:0"), "defender must still go down");
              assert(
                !turnoverHappened(r),
                "no turnover when Block saves the attacker"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "block-both-have-block",
        name: "Both players have Block",
        description: "Both Down knocks nobody down",
        setup: faceOff([SkillType.BLOCK], [SkillType.BLOCK]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "neither-falls",
            name: "Neither player falls",
            matches: (r) =>
              skillTriggered(r, SkillType.BLOCK) &&
              playerStanding(r, "team1:0") &&
              playerStanding(r, "team2:0"),
            verify: (r) =>
              assert(!turnoverHappened(r), "no turnover when nobody falls"),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.WRESTLE,
    configs: [
      blockConfig({
        id: "wrestle-accepted",
        name: "Defender uses Wrestle",
        description:
          "Both Down: both placed prone, no armour, overrides Block, no turnover",
        setup: faceOff([SkillType.BLOCK], [SkillType.WRESTLE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        outcomes: [
          {
            id: "both-prone-no-armour",
            name: "Both placed prone without armour rolls",
            matches: (r) =>
              reactionOffered(r, {
                skill: SkillType.WRESTLE,
                chooser: "team2",
              }) && skillTriggered(r, SkillType.WRESTLE),
            verify: (r) => {
              assert(
                playerDown(r, "team1:0"),
                "Wrestle overrides Block — attacker goes prone"
              );
              assert(playerDown(r, "team2:0"), "defender goes prone");
              assert(armourRolls(r) === 0, "placed prone: no armour rolls");
              assert(
                !turnoverHappened(r),
                "placed prone without the ball: no turnover"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "wrestle-declined",
        name: "Wrestle declined",
        description: "Declining applies the normal Both Down",
        setup: faceOff([], [SkillType.WRESTLE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "both-down",
        decisionPolicy: { acceptReactions: false },
        outcomes: [
          {
            id: "normal-both-down",
            name: "Normal Both Down applies",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.WRESTLE }) &&
              !skillTriggered(r, SkillType.WRESTLE),
            verify: (r) => {
              assert(playerDown(r, "team1:0"), "attacker knocked down");
              assert(playerDown(r, "team2:0"), "defender knocked down");
              assert(turnoverHappened(r), "attacker down = turnover");
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.STAND_FIRM,
    configs: [
      blockConfig({
        id: "stand-firm-accepted",
        name: "Stand Firm refuses the push",
        description: "The pushed player stays put; the reacting team decides",
        setup: faceOff([], [SkillType.STAND_FIRM]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "push-refused",
            name: "Push refused, defender unmoved",
            matches: (r) =>
              reactionOffered(r, {
                skill: SkillType.STAND_FIRM,
                chooser: "team2",
              }) && skillTriggered(r, SkillType.STAND_FIRM),
            verify: (r) => {
              assert(
                playerAt(r, "team2:0", { x: 11, y: 5 }),
                "defender must not move"
              );
              assert(playerStanding(r, "team2:0"), "a push never floors");
            },
          },
        ],
      }),
      blockConfig({
        id: "stand-firm-declined",
        name: "Stand Firm declined",
        description: "Declining lets the push proceed normally",
        setup: faceOff([], [SkillType.STAND_FIRM]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        decisionPolicy: { acceptReactions: false },
        outcomes: [
          {
            id: "push-proceeds",
            name: "Defender pushed back",
            matches: (r) =>
              reactionOffered(r, { skill: SkillType.STAND_FIRM }) &&
              !skillTriggered(r, SkillType.STAND_FIRM),
            verify: (r) =>
              assert(
                !playerAt(r, "team2:0", { x: 11, y: 5 }),
                "defender must have left the square"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.TACKLE,
    configs: [
      {
        id: "tackle-denies-dodge-reroll",
        name: "Tackle denies the Dodge re-roll",
        description:
          "Dodging out of a Tackle marker's zone: no Dodge skill re-roll",
        setup: playSetup({
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.DODGE] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 16, y: 5, skills: [SkillType.TACKLE] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "dodge-skill-denied",
            name: "Failed dodge gets no re-roll offer",
            matches: (r) =>
              skillTriggered(r, SkillType.TACKLE) && playerDown(r, "team1:0"),
            verify: (r) =>
              assert(
                r.decisions.length === 0,
                "no reroll decision may be offered"
              ),
          },
        ],
      },
      blockConfig({
        id: "tackle-cancels-stumble",
        name: "Tackle vs Defender Stumbles",
        description: "The defender does not count as having Dodge — floored",
        setup: faceOff([SkillType.TACKLE], [SkillType.DODGE]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow-dodge",
        outcomes: [
          {
            id: "defender-floored",
            name: "Stumble knocks the dodger down anyway",
            matches: (r) =>
              r.decisions.some(
                (d) =>
                  d.type === "push-direction" && d.resultType === "pow-dodge"
              ) && !skillTriggered(r, SkillType.DODGE),
            verify: (r) =>
              assert(
                playerDown(r, "team2:0"),
                "Tackle cancels the Dodge conversion"
              ),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.TAUNT,
    configs: [
      blockConfig({
        id: "taunt-forces-follow-up",
        name: "Taunt forces the blocker's follow-up",
        description:
          "The pushed player's coach makes the blocker follow up — no choice",
        setup: faceOff([], [SkillType.TAUNT]),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        outcomes: [
          {
            id: "follow-up-forced",
            name: "The blocker ends in the vacated square",
            matches: (r) => reactionOffered(r, { skill: SkillType.TAUNT }),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 11, y: 5 }),
                "the blocker must follow up into the vacated square"
              );
              assert(
                !r.decisions.some((d) => d.type === "follow-up"),
                "no follow-up choice may be offered"
              );
              assert(
                playerStanding(r, "team2:0"),
                "a plain push leaves the taunter standing"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.KICK,
    configs: [
      {
        id: "kick-deviation-d3",
        name: "Kick halves the kickoff deviation",
        description:
          "A nominated kicker with Kick deviates the ball only D3 squares instead of the usual D6",
        setup: {
          // Team 1's line of scrimmage is x=6; the kicker must stand at
          // least one square back from it (here x=4), with team-mates on
          // the line, or the kick is illegal.
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.KICK] },
            { playerIndex: 1, x: 6, y: 4 },
            { playerIndex: 2, x: 6, y: 5 },
            { playerIndex: 3, x: 6, y: 6 },
            { playerIndex: 4, x: 3, y: 7 },
          ],
          team2Placements: [
            { playerIndex: 0, x: 13, y: 4 },
            { playerIndex: 1, x: 13, y: 5 },
            { playerIndex: 2, x: 13, y: 6 },
            { playerIndex: 3, x: 16, y: 8 },
          ],
          activeTeam: "team1",
          phase: GamePhase.KICKOFF,
          subPhase: SubPhase.ROLL_KICKOFF,
        },
        script: [{ type: "kick-ball", playerId: "team1:0", x: 16, y: 5 }],
        outcomes: [
          {
            id: "deviates-d3",
            name: "The kick Deviates only D3 squares",
            matches: (r) => skillTriggered(r, SkillType.KICK),
            verify: (r) => {
              const roll = r.events.find(
                (e) =>
                  e.name === GameEventNames.DiceRoll &&
                  (e.data as { rollType?: string }).rollType ===
                    "Kickoff Deviate Distance (Kick)"
              );
              assert(!!roll, "the deviation distance is rolled as a Kick D3");
              assert(
                (roll!.data as { value: number }).value <= 3,
                "a D3 deviation never exceeds 3 squares"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.STEADY_FOOTING,
    configs: [
      {
        id: "steady-footing-dodge",
        name: "Steady Footing on a failed Dodge",
        description:
          "A Bretonnian Grail Knight (Steady Footing) who fails a Dodge rolls a D6: on a 6 they keep their feet and move on with no Turnover; on 1-5 they Fall Over as usual",
        setup: playSetup({
          team1Roster: RosterName.BRETONIAN,
          // Grail Knight (index 0) has Steady Footing natively; an opponent
          // marks it so leaving the square needs a Dodge.
          team1Placements: [{ playerIndex: 0, x: 16, y: 4 }],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        seedSearch: { from: 1, limit: 1000 },
        outcomes: [
          {
            id: "saves",
            name: "Rolls a 6 — stays on their feet, no turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.STEADY_FOOTING) &&
              playerStanding(r, "team1:0") &&
              !turnoverHappened(r),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 15, y: 3 }),
                "a saved Grail Knight completes the move and keeps going"
              );
              assert(
                !turnoverHappened(r),
                "Steady Footing prevents the failed-Dodge turnover"
              );
            },
          },
          {
            id: "fails",
            name: "Rolls 1-5 — Falls Over, turnover",
            matches: (r) =>
              steadyFootingRolled(r) &&
              !skillTriggered(r, SkillType.STEADY_FOOTING) &&
              playerDown(r, "team1:0"),
            verify: (r) => {
              assert(
                playerDown(r, "team1:0"),
                "a non-6 leaves the Grail Knight Prone"
              );
              assert(
                turnoverHappened(r),
                "a Fall Over that Steady Footing did not save is a turnover"
              );
            },
          },
        ],
      },
    ],
  },
];
