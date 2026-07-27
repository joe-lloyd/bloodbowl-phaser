/**
 * Rule scenarios — the Throw Team-mate family (Throw Team-mate, Kick
 * Team-mate, Right Stuff, Swoop, Strong Arm). Always Hungry's Throw Team-mate
 * clause lives with the negatraits.
 *
 * Themed on the Ogre roster: an Ogre Blocker (Throw Team-mate) or Ogre Runt
 * Punter (Kick Team-mate) throws a Gnoblar Lineman (Right Stuff, ST 1). Because
 * Ogres carry Bone Head, a declared throw first rolls the activation gate, so
 * outcomes are seed-hunted across those extra dice.
 *
 * Team indices (see TeamFactory OGRE composition): 0-1 Ogre Blocker, 2 Ogre
 * Runt Punter, 3-6 Gnoblar Lineman.
 */

import { SkillType, hasSkill } from "../../types/Skills";
import { RosterName } from "../../types/Team";
import { PlayerStats } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { ScenarioSetup } from "../../types/Scenario";
import {
  RuleScenarioEntry,
  playSetup,
  assert,
  sawEvent,
  skillTriggered,
  skillCheckDiff,
  turnoverHappened,
  playerOf,
  playerStanding,
} from "../../game/rules-lab";

type Result = Parameters<typeof skillTriggered>[0];

/** The thrown Gnoblar (Right Stuff, ST 1) — index 3 of the Ogre team. */
const MATE = "team1:3";
/** The thrower: an Ogre Blocker for a throw, the Runt Punter for a kick. */
const throwerRef = (mode: "throw" | "kick") =>
  mode === "kick" ? "team1:2" : "team1:0";

/** A UI notification containing `text` was emitted during the run. */
const saw = (r: Result, text: string): boolean =>
  sawEvent(
    r,
    GameEventNames.UI_Notification,
    (d) => typeof d === "string" && d.includes(text)
  );

/** A dice roll whose rollType exactly equals `type` was made. */
const rolled = (r: Result, type: string): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => (d as { rollType?: string }).rollType === type
  );

interface TtmOpts {
  mode: "throw" | "kick";
  /** Extra skills granted to the thrower (Strong Arm, Swoop, Always Hungry). */
  extraThrowerSkills?: SkillType[];
  /** Extra skills granted to the thrown Right Stuff player. */
  extraMateSkills?: SkillType[];
  /** thrower square (defaults 10,5) */
  thrower?: { x: number; y: number };
  /** Gnoblar square (defaults 11,5) */
  mate?: { x: number; y: number };
  mateST?: number;
  mateAG?: number;
  /** opponents (defaults one far away, no marking) */
  opponents?: {
    x: number;
    y: number;
    index?: number;
    stats?: Partial<PlayerStats>;
  }[];
  ball?: { x: number; y: number };
}

/** Build a Throw / Kick Team-mate scenario on the Ogre roster. */
const ttm = (opts: TtmOpts): ScenarioSetup => {
  const throwerIndex = opts.mode === "kick" ? 2 : 0;
  const mateStats: Partial<PlayerStats> = {};
  if (opts.mateST !== undefined) mateStats.ST = opts.mateST;
  if (opts.mateAG !== undefined) mateStats.AG = opts.mateAG;
  return playSetup({
    team1Roster: RosterName.OGRE,
    team1Placements: [
      {
        playerIndex: throwerIndex,
        x: opts.thrower?.x ?? 10,
        y: opts.thrower?.y ?? 5,
        ...(opts.extraThrowerSkills ? { skills: opts.extraThrowerSkills } : {}),
      },
      {
        playerIndex: 3,
        x: opts.mate?.x ?? 11,
        y: opts.mate?.y ?? 5,
        ...(opts.extraMateSkills ? { skills: opts.extraMateSkills } : {}),
        ...(Object.keys(mateStats).length ? { stats: mateStats } : {}),
      },
    ],
    team2Placements: (opts.opponents ?? [{ x: 1, y: 1 }]).map((o, i) => ({
      playerIndex: o.index ?? i,
      x: o.x,
      y: o.y,
      ...(o.stats ? { stats: o.stats } : {}),
    })),
    ballPosition: opts.ball ?? { x: 18, y: 9 },
  });
};

/** declare + throw/kick the Gnoblar at (x,y). */
const script = (
  mode: "throw" | "kick",
  x: number,
  y: number,
  mateRef: string = MATE
) => [
  {
    type: "declare-action" as const,
    playerId: throwerRef(mode),
    action: "throwTeamMate" as const,
  },
  {
    type: "throw-teammate" as const,
    throwerId: throwerRef(mode),
    teammateId: mateRef,
    x,
    y,
    mode,
  },
];

/** An 8-neighbour ring of opponents around (cx,cy) — for crash scenarios. */
const ring = (cx: number, cy: number, count = 7) =>
  [
    { x: cx - 1, y: cy - 1 },
    { x: cx, y: cy - 1 },
    { x: cx + 1, y: cy - 1 },
    { x: cx - 1, y: cy },
    { x: cx + 1, y: cy },
    { x: cx - 1, y: cy + 1 },
    { x: cx, y: cy + 1 },
    { x: cx + 1, y: cy + 1 },
  ].slice(0, count);

const injuryOf = (r: Result, ref: string) =>
  rolled(r, `Injury Roll (${playerOf(r, ref).playerName})`);

export const THROW_TEAMMATE_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.LETHAL_FLIGHT,
    configs: [
      {
        id: "lethal-flight-crash-casualty",
        name: "Lethal Flight crash Casualty",
        description:
          "A thrown Right Stuff player gets +1 to the crash Armour/Injury roll and receives the Casualty SPP",
        setup: ttm({
          mode: "throw",
          extraMateSkills: [SkillType.LETHAL_FLIGHT],
          opponents: ring(14, 5, 8).map((opponent) => ({
            ...opponent,
            stats: { AV: 5 },
          })),
        }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 5000 },
        outcomes: [
          {
            id: "crash-casualty-credited",
            name: "The thrown player receives +1 and Casualty credit",
            matches: (r) =>
              skillTriggered(r, SkillType.LETHAL_FLIGHT) &&
              playerOf(r, MATE).spp >= 2,
            verify: (r) => {
              assert(
                hasSkill(playerOf(r, MATE).skills, SkillType.RIGHT_STUFF),
                "Lethal Flight requires Right Stuff"
              );
              assert(
                playerOf(r, MATE).spp === 2,
                "the thrown player must receive exactly 2 SPP for the Casualty"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.THROW_TEAM_MATE,
    configs: [
      {
        id: "ttm-throw",
        name: "Throw Team-mate — short throw",
        description:
          "An Ogre Blocker throws a Gnoblar at a nearby square: it scatters and makes a Right Stuff landing roll (Standing = no turnover, Prone = turnover); a fumble drops and injures it",
        setup: ttm({ mode: "throw" }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "lands-standing",
            name: "Lands Standing — no turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              saw(r, "lands safely"),
            verify: (r) => {
              assert(
                playerStanding(r, MATE),
                "the thrown Gnoblar must be Standing"
              );
              assert(
                !turnoverHappened(r),
                "landing Standing is not a turnover"
              );
            },
          },
          {
            id: "lands-prone",
            name: "Fails the landing — Prone, turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              saw(r, "fails to land"),
            verify: (r) =>
              assert(
                turnoverHappened(r),
                "a thrown player landing Prone is a turnover"
              ),
          },
          {
            id: "fumbled-throw",
            name: "Fumbled throw — dropped and injured",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              saw(r, "Fumbled throw"),
            verify: (r) => {
              assert(
                injuryOf(r, MATE),
                "a fumbled throw injures the dropped Gnoblar"
              );
              assert(turnoverHappened(r), "a fumbled throw is a turnover");
            },
          },
          {
            id: "short-range-penalty",
            name: "Short range applies -1 to the throw",
            matches: (r) => skillCheckDiff(r, "Pass") === -1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Pass") === -1,
                "a Short-range throw takes -1 to the PA test"
              ),
          },
        ],
      },
      {
        id: "ttm-out-of-range",
        name: "Throw Team-mate — Long range is out of range",
        description:
          "A Gnoblar is too heavy to throw beyond Short range: a Long-range aim is rejected with no roll (Throw Team-mate reaches only Quick and Short)",
        setup: ttm({
          mode: "throw",
          thrower: { x: 2, y: 5 },
          mate: { x: 3, y: 5 },
        }),
        script: script("throw", 13, 5),
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "long-throw-rejected",
            name: "The out-of-range throw is rejected",
            matches: (r) => saw(r, "Out of range"),
            verify: (r) => {
              assert(
                !skillTriggered(r, SkillType.THROW_TEAM_MATE),
                "no throw is performed out of range"
              );
              assert(!turnoverHappened(r), "and no turnover is caused");
            },
          },
        ],
      },
      {
        id: "ttm-marked-thrower",
        name: "Throw Team-mate — marked thrower (-2)",
        description:
          "Two opponents marking the Ogre thrower each subtract 1 from the Passing Ability Test",
        setup: ttm({
          mode: "throw",
          opponents: [
            { x: 9, y: 5 },
            { x: 9, y: 4 },
          ],
        }),
        script: script("throw", 12, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "marking-penalty",
            name: "Two markers apply -2 to the throw",
            matches: (r) => skillCheckDiff(r, "Pass") === -2,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Pass") === -2,
                "each marker subtracts 1 from the PA test"
              ),
          },
        ],
      },
      {
        id: "ttm-crash",
        name: "Throw Team-mate — crash into an occupied square",
        description:
          "When the thrown Gnoblar scatters onto an occupied square, both it and the occupant are Knocked Down and take an Armour Roll — a turnover",
        setup: ttm({ mode: "throw", opponents: ring(14, 5) }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 1200 },
        outcomes: [
          {
            id: "crash-knocks-both-down",
            name: "Both players crash to the ground — turnover",
            matches: (r) => saw(r, "crashes into"),
            verify: (r) => {
              assert(
                !playerStanding(r, MATE),
                "the thrown player is Knocked Down in a crash"
              );
              assert(turnoverHappened(r), "a crash is a turnover");
            },
          },
        ],
      },
      {
        id: "ttm-carrier-fumble",
        name: "Throw Team-mate — a ball-carrying Gnoblar is fumbled",
        description:
          "When a fumbled throw drops a Gnoblar carrying the ball, the ball bounces from the square it was dropped from",
        setup: ttm({
          mode: "throw",
          ball: { x: 11, y: 5 }, // on the Gnoblar being thrown
        }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "carried-ball-bounces",
            name: "The carried ball bounces on a fumble",
            matches: (r) =>
              saw(r, "Fumbled throw") && rolled(r, "Bounce Direction"),
            verify: (r) => {
              assert(injuryOf(r, MATE), "the dropped Gnoblar is injured");
              assert(turnoverHappened(r), "a fumbled throw is a turnover");
            },
          },
        ],
      },
      {
        id: "ttm-carry-ball",
        name: "Throw Team-mate — a ball carrier is thrown with the ball",
        description:
          "A thrown Gnoblar holding the ball takes it with them; on a Standing landing they keep possession in the landing square",
        setup: ttm({
          mode: "throw",
          mateAG: 5, // land reliably so possession is retained
          ball: { x: 11, y: 5 }, // on the Gnoblar being thrown
        }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "lands-with-ball",
            name: "The ball lands with the standing Gnoblar",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) => {
              const mate = playerOf(r, MATE);
              const ball = r.game.ctx.gameService.getState().ballPosition;
              assert(playerStanding(r, MATE), "the Gnoblar lands Standing");
              assert(
                !!ball &&
                  !!mate.gridPosition &&
                  ball.x === mate.gridPosition.x &&
                  ball.y === mate.gridPosition.y,
                "the ball stays with the thrown Gnoblar at the landing square"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.KICK_TEAM_MATE,
    configs: [
      {
        id: "ktm-kick",
        name: "Kick Team-mate Action",
        description:
          "An Ogre Runt Punter kicks a Gnoblar: it resolves like Throw Team-mate, but a fumble removes the kicked player from play and forces an immediate Injury Roll",
        setup: ttm({ mode: "kick" }),
        script: script("kick", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "kick-lands-standing",
            name: "Kicked Gnoblar lands Standing",
            matches: (r) =>
              skillTriggered(r, SkillType.KICK_TEAM_MATE) &&
              saw(r, "lands safely"),
            verify: (r) =>
              assert(
                playerStanding(r, MATE),
                "the kicked Gnoblar lands Standing"
              ),
          },
          {
            id: "kick-lands-prone",
            name: "Kicked Gnoblar fails the landing — turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.KICK_TEAM_MATE) &&
              saw(r, "fails to land"),
            verify: (r) =>
              assert(turnoverHappened(r), "landing Prone is a turnover"),
          },
          {
            id: "fumbled-kick-removes",
            name: "Fumbled kick removes and injures the player",
            matches: (r) =>
              skillTriggered(r, SkillType.KICK_TEAM_MATE) &&
              saw(r, "Fumbled kick"),
            verify: (r) => {
              assert(
                injuryOf(r, MATE),
                "a fumbled kick injures the kicked player"
              );
              assert(
                !playerOf(r, MATE).gridPosition,
                "the kicked player is removed from the pitch"
              );
              assert(turnoverHappened(r), "a fumbled kick is a turnover");
            },
          },
        ],
      },
      {
        id: "ktm-crash",
        name: "Kick Team-mate — crash into an occupied square",
        description:
          "A kicked Gnoblar scattering onto an occupied square crashes exactly like a thrown one",
        setup: ttm({ mode: "kick", opponents: ring(14, 5) }),
        script: script("kick", 14, 5),
        seedSearch: { from: 1, limit: 1200 },
        outcomes: [
          {
            id: "kick-crash",
            name: "Kicked player crashes — turnover",
            matches: (r) => saw(r, "crashes into"),
            verify: (r) => assert(turnoverHappened(r), "a crash is a turnover"),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.RIGHT_STUFF,
    configs: [
      {
        id: "right-stuff-landing",
        name: "Right Stuff landing roll",
        description:
          "A Gnoblar (Right Stuff) makes the landing roll after being thrown; a success lands it Standing, a failure Places it Prone",
        setup: ttm({ mode: "throw" }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "landing-succeeds",
            name: "Lands Standing on a successful landing roll",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) =>
              assert(
                playerStanding(r, MATE),
                "a successful landing leaves the player Standing"
              ),
          },
          {
            id: "landing-fails",
            name: "Placed Prone on a failed landing roll",
            matches: (r) => saw(r, "fails to land"),
            verify: (r) =>
              assert(turnoverHappened(r), "a failed landing is a turnover"),
          },
        ],
      },
      {
        id: "right-stuff-agile-mate",
        name: "Right Stuff — an agile team-mate lands reliably",
        description:
          "A thrown Gnoblar with high Agility passes the landing roll on most results",
        setup: ttm({ mode: "throw", mateAG: 5 }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "agile-lands",
            name: "The agile Gnoblar lands Standing",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) =>
              assert(playerStanding(r, MATE), "an AG 5 Gnoblar lands Standing"),
          },
        ],
      },
      {
        id: "right-stuff-required",
        name: "A team-mate without Right Stuff cannot be thrown",
        description:
          "The target must have Right Stuff; a second Ogre Blocker (no Right Stuff) is rejected with no roll",
        setup: playSetup({
          team1Roster: RosterName.OGRE,
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 }, // Ogre Blocker (thrower)
            { playerIndex: 1, x: 11, y: 5 }, // Ogre Blocker — no Right Stuff
          ],
          team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
          ballPosition: { x: 18, y: 9 },
        }),
        script: script("throw", 14, 5, "team1:1"),
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "ineligible-rejected",
            name: "The throw is rejected",
            matches: (r) => saw(r, "cannot be thrown"),
            verify: (r) => {
              assert(
                !skillTriggered(r, SkillType.THROW_TEAM_MATE),
                "no throw is performed against an ineligible team-mate"
              );
              assert(!turnoverHappened(r), "and no turnover is caused");
            },
          },
        ],
      },
      {
        id: "right-stuff-strength-limit",
        name: "Right Stuff — Strength 4 is too strong to throw",
        description:
          "Even with Right Stuff, a team-mate with Strength above 3 is not a legal Throw / Kick Team-mate target",
        setup: ttm({ mode: "throw", mateST: 4 }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "too-strong-rejected",
            name: "A Strength 4 Gnoblar is rejected",
            matches: (r) => saw(r, "cannot be thrown"),
            verify: (r) =>
              assert(
                !skillTriggered(r, SkillType.THROW_TEAM_MATE),
                "a ST 4 team-mate is never thrown"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SWOOP,
    configs: [
      {
        id: "swoop-scatter",
        name: "Swoop scatter template",
        description:
          "A thrower with Swoop scatters the thrown Gnoblar using the tighter throw-in template (a single step) instead of the standard 3-square Scatter template",
        setup: ttm({ mode: "throw", extraThrowerSkills: [SkillType.SWOOP] }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "swoop-applies",
            name: "Swoop's tighter scatter is used",
            matches: (r) =>
              skillTriggered(r, SkillType.SWOOP) && saw(r, "lands safely"),
            verify: (r) => {
              assert(
                rolled(r, "Bounce"),
                "Swoop uses a single throw-in-template scatter step"
              );
              assert(
                !rolled(r, "Scatter"),
                "Swoop does not use the standard 3-square Scatter template"
              );
            },
          },
        ],
      },
      {
        id: "swoop-landing-bonus",
        name: "Swoop landing +1",
        description:
          "Swoop adds +1 to the Right Stuff landing roll of the thrown Gnoblar",
        setup: ttm({ mode: "throw", extraThrowerSkills: [SkillType.SWOOP] }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "landing-plus-one",
            name: "The landing roll gets +1",
            matches: (r) =>
              skillTriggered(r, SkillType.SWOOP) &&
              skillCheckDiff(r, "Landing") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Landing") === 1,
                "Swoop adds +1 to the landing roll"
              ),
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BULLSEYE,
    configs: [
      {
        id: "bullseye-superb-throw",
        name: "Bullseye — a Superb Throw lands on target",
        description:
          "On a Superb Throw (a natural 6 on the Passing Ability Test), a thrower with Bullseye lands the Gnoblar dead on the target square with no Scatter — it still makes its Right Stuff landing roll there",
        setup: ttm({ mode: "throw", extraThrowerSkills: [SkillType.BULLSEYE] }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 2000 },
        outcomes: [
          {
            id: "no-scatter-on-target",
            name: "The thrown Gnoblar lands on the target square, no Scatter",
            // A Gnoblar Knocked Out by its landing leaves the pitch at once,
            // so the on-target square is only observable while it is there.
            matches: (r) =>
              skillTriggered(r, SkillType.BULLSEYE) &&
              !!playerOf(r, MATE).gridPosition,
            verify: (r) => {
              const mate = playerOf(r, MATE).gridPosition;
              assert(
                !!mate && mate.x === 14 && mate.y === 5,
                "a Superb Throw lands the Gnoblar on the target square"
              );
              assert(
                !rolled(r, "Scatter"),
                "Bullseye skips the Scatter template entirely"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.STRONG_ARM,
    configs: [
      {
        id: "strong-arm-throw",
        name: "Strong Arm helps a Throw Team-mate",
        description:
          "Strong Arm fires on a Throw Team-mate Passing Ability Test",
        setup: ttm({
          mode: "throw",
          extraThrowerSkills: [SkillType.STRONG_ARM],
        }),
        script: script("throw", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "strong-arm-applied",
            name: "Strong Arm's +1 is applied",
            matches: (r) => skillTriggered(r, SkillType.STRONG_ARM),
            verify: (r) =>
              assert(
                skillTriggered(r, SkillType.STRONG_ARM),
                "Strong Arm must fire on a Throw Team-mate"
              ),
          },
        ],
      },
      {
        id: "strong-arm-quick",
        name: "Strong Arm — a clean +1 on a Quick throw",
        description:
          "On an unmarked Quick throw the only modifier is Strong Arm's +1, so the PA test is exactly roll + 1",
        setup: ttm({
          mode: "throw",
          extraThrowerSkills: [SkillType.STRONG_ARM],
        }),
        script: script("throw", 12, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "quick-plus-one",
            name: "The throw is modified by exactly +1",
            matches: (r) =>
              skillTriggered(r, SkillType.STRONG_ARM) &&
              skillCheckDiff(r, "Pass") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Pass") === 1,
                "an unmarked Quick throw with Strong Arm is roll + 1"
              ),
          },
        ],
      },
      {
        id: "strong-arm-not-on-kick",
        name: "Strong Arm does not help a Kick Team-mate",
        description:
          "Strong Arm explicitly does not modify a Kick Team-mate Action",
        setup: ttm({
          mode: "kick",
          extraThrowerSkills: [SkillType.STRONG_ARM],
        }),
        script: script("kick", 14, 5),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "kick-ignores-strong-arm",
            name: "No Strong Arm modifier on a kick",
            matches: (r) => skillTriggered(r, SkillType.KICK_TEAM_MATE),
            verify: (r) =>
              assert(
                !skillTriggered(r, SkillType.STRONG_ARM),
                "Strong Arm must not modify a Kick Team-mate Action"
              ),
          },
        ],
      },
    ],
  },
];
