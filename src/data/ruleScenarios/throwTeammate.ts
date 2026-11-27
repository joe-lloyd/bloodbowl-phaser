import { z } from "zod";
import { fixtureValue } from "../../testing/fixtureValue";
import { SkillType, hasSkill } from "../../types/Skills";
import { RosterName } from "../../types/Team";
import { type PlayerStats } from "../../types/Player";
import { GameEventNames } from "../../types/events";
import { type ScenarioSetup } from "../../types/Scenario";
import { type SwoopFacing } from "../../game/rules/throwTeammate";
import {
  type RuleScenarioEntry,
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

const MATE = "team1:3";

const throwerRef = (mode: "throw" | "kick") =>
  mode === "kick" ? "team1:2" : "team1:0";

const saw = (r: Result, text: string): boolean =>
  sawEvent(
    r,
    GameEventNames.UI_Notification,
    (d) => typeof d === "string" && d.includes(text)
  );

const rolled = (r: Result, type: string): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      z.object({ rollType: z.string().exactOptional() }).parse(d).rollType ===
      type
  );

const landingRolls = (r: Result): number =>
  r.events.filter(
    (e) =>
      e.name === GameEventNames.DiceRoll &&
      !!z
        .object({ rollType: z.string().exactOptional() })
        .parse(e.data)
        .rollType?.startsWith("Landing")
  ).length;

interface TtmOpts {
  mode: "throw" | "kick";

  extraThrowerSkills?: SkillType[];

  extraMateSkills?: SkillType[];

  thrower?: { x: number; y: number };

  mate?: { x: number; y: number };
  mateST?: number;
  mateAG?: number;

  opponents?: {
    x: number;
    y: number;
    index?: number;
    stats?: Partial<PlayerStats>;
  }[];
  ball?: { x: number; y: number };
}

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
        ...(opts.extraThrowerSkills && { skills: opts.extraThrowerSkills }),
      },
      {
        playerIndex: 3,
        x: opts.mate?.x ?? 11,
        y: opts.mate?.y ?? 5,
        ...(opts.extraMateSkills && { skills: opts.extraMateSkills }),
        ...((Object.keys(mateStats).length > 0) && { stats: mateStats }),
      },
    ],
    team2Placements: (opts.opponents ?? [{ x: 1, y: 1 }]).map((o, i) => ({
      playerIndex: o.index ?? i,
      x: o.x,
      y: o.y,
      ...(o.stats && { stats: o.stats }),
    })),
    ballPosition: opts.ball ?? { x: 18, y: 9 },
  });
};

const script = ({
  mode,
  x,
  mateRef = MATE,
  swoopFacing,
}: {
  mode: "throw" | "kick";
  x: number;
  mateRef?: string;
  swoopFacing?: SwoopFacing;
}) => [
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
    y: 5,
    mode,
    ...(swoopFacing && { swoopFacing }),
  },
];

const ring = (count = 7) =>
  [
    { x: 13, y: 4 },
    { x: 14, y: 4 },
    { x: 15, y: 4 },
    { x: 13, y: 5 },
    { x: 15, y: 5 },
    { x: 13, y: 6 },
    { x: 14, y: 6 },
    { x: 15, y: 6 },
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
          opponents: ring(8).map((opponent) => ({
            ...opponent,
            stats: { AV: 5 },
          })),
        }),
        script: script({ mode: "throw", x: 14 }),
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
          "An Ogre Blocker throws a Gnoblar at a nearby square: it scatters and attempts to land; a fumble bounces from the Ogre and attempts to land at -1",
        setup: ttm({ mode: "throw" }),
        script: script({ mode: "throw", x: 14 }),
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
            name: "Fails the landing without the ball — Prone, no turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              saw(r, "fails to land"),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "a Fall Over without the ball is no turnover (p.82)"
              );
            },
          },
          {
            id: "fumbled-throw",
            name: "Fumbled throw — bounces and attempts to land",
            matches: (r) =>
              skillTriggered(r, SkillType.THROW_TEAM_MATE) &&
              saw(r, "Fumbled throw"),
            verify: (r) => {
              assert(
                rolled(r, "Bounce") && landingRolls(r) === 1,
                "a fumbled throw bounces and makes a Landing roll"
              );
              assert(
                !turnoverHappened(r),
                "a fumble without the ball is no automatic turnover"
              );
              const mate = fixtureValue(playerOf(r, MATE).gridPosition);
              const thrower = fixtureValue(playerOf(r, "team1:0").gridPosition);
              assert(
                mate.x !== thrower.x || mate.y !== thrower.y,
                "the dropped player must not share the thrower's square"
              );
            },
          },
          {
            id: "short-range-penalty",
            name: "Short range applies -1 to the throw",
            matches: (r) => skillCheckDiff(r, "Throw Team-mate") === -1,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Throw Team-mate") === -1,
                "a Short-range throw takes -1 to the PA test"
              );
            },
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
        script: script({ mode: "throw", x: 13 }),
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
        script: script({ mode: "throw", x: 12 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "marking-penalty",
            name: "Two markers apply -2 to the throw",
            matches: (r) => skillCheckDiff(r, "Throw Team-mate") === -2,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Throw Team-mate") === -2,
                "each marker subtracts 1 from the PA test"
              );
            },
          },
        ],
      },
      {
        id: "ttm-crash",
        name: "Throw Team-mate — crash into an occupied square",
        description:
          "When the thrown Gnoblar scatters onto an occupied square, both it and the occupant are Knocked Down and take an Armour Roll — no turnover without the ball",
        setup: ttm({ mode: "throw", opponents: ring() }),
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 1200 },
        outcomes: [
          {
            id: "crash-knocks-both-down",
            name: "Both players crash to the ground — no turnover",
            matches: (r) => saw(r, "crashes into"),
            verify: (r) => {
              assert(
                !playerStanding(r, MATE),
                "the thrown player is Knocked Down in a crash"
              );
              assert(
                !turnoverHappened(r),
                "a crash without the ball is no turnover (p.82)"
              );
            },
          },
        ],
      },
      {
        id: "ttm-carrier-fumble",
        name: "Throw Team-mate — a ball-carrying Gnoblar is fumbled",
        description:
          "A fumbled ball carrier bounces with the ball; if they fail to land, the ball bounces from their landing square",
        setup: ttm({
          mode: "throw",
          ball: { x: 11, y: 5 },
        }),
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "carried-ball-bounces",
            name: "The carried ball bounces after a failed fumble landing",
            matches: (r) =>
              saw(r, "Fumbled throw") && rolled(r, "Bounce Direction"),
            verify: (r) => {
              assert(
                !playerStanding(r, MATE),
                "the ball carrier failed to land"
              );
              assert(
                turnoverHappened(r),
                "a failed landing with the ball is a turnover"
              );
            },
          },
          {
            id: "carried-ball-kept",
            name: "A fumbled carrier lands safely and keeps the ball",
            matches: (r) => saw(r, "Fumbled throw") && saw(r, "lands safely"),
            verify: (r) => {
              const mate = fixtureValue(playerOf(r, MATE).gridPosition);
              const ball = r.game.ctx.gameService.getState().balls[0].at;
              assert(
                ball?.x === mate.x && ball.y === mate.y,
                "the safely landed carrier keeps the ball"
              );
              assert(
                !turnoverHappened(r),
                "a safe fumble landing is not a turnover"
              );
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
          mateAG: 5,
          ball: { x: 11, y: 5 },
        }),
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "lands-with-ball",
            name: "The ball lands with the standing Gnoblar",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) => {
              const mate = playerOf(r, MATE);
              const ball = r.game.ctx.gameService.getState().balls[0].at;
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
        script: script({ mode: "kick", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "kick-lands-standing",
            name: "Kicked Gnoblar lands Standing",
            matches: (r) =>
              skillTriggered(r, SkillType.KICK_TEAM_MATE) &&
              saw(r, "lands safely"),
            verify: (r) => {
              assert(
                playerStanding(r, MATE),
                "the kicked Gnoblar lands Standing"
              );
            },
          },
          {
            id: "kick-lands-prone",
            name: "Kicked Gnoblar fails the landing — no turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.KICK_TEAM_MATE) &&
              saw(r, "fails to land"),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "a Fall Over without the ball is no turnover (p.82)"
              );
            },
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
        setup: ttm({ mode: "kick", opponents: ring() }),
        script: script({ mode: "kick", x: 14 }),
        seedSearch: { from: 1, limit: 1200 },
        outcomes: [
          {
            id: "kick-crash",
            name: "Kicked player crashes — no turnover",
            matches: (r) => saw(r, "crashes into"),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "a crash without the ball is no turnover (p.82)"
              );
            },
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
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "landing-succeeds",
            name: "Lands Standing on a successful landing roll",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) => {
              assert(
                playerStanding(r, MATE),
                "a successful landing leaves the player Standing"
              );
            },
          },
          {
            id: "landing-fails",
            name: "Placed Prone on a failed landing roll",
            matches: (r) => saw(r, "fails to land"),
            verify: (r) => {
              assert(
                !turnoverHappened(r),
                "a failed landing without the ball is no turnover (p.82)"
              );
            },
          },
        ],
      },
      {
        id: "right-stuff-agile-mate",
        name: "Right Stuff — an agile team-mate lands reliably",
        description:
          "A thrown Gnoblar with high Agility passes the landing roll on most results",
        setup: ttm({ mode: "throw", mateAG: 5 }),
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "agile-lands",
            name: "The agile Gnoblar lands Standing",
            matches: (r) => saw(r, "lands safely"),
            verify: (r) => {
              assert(playerStanding(r, MATE), "an AG 5 Gnoblar lands Standing");
            },
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
            { playerIndex: 0, x: 10, y: 5 },
            { playerIndex: 1, x: 11, y: 5 },
          ],
          team2Placements: [{ playerIndex: 0, x: 1, y: 1 }],
          ballPosition: { x: 18, y: 9 },
        }),
        script: script({ mode: "throw", x: 14, mateRef: "team1:1" }),
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
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 400 },
        outcomes: [
          {
            id: "too-strong-rejected",
            name: "A Strength 4 Gnoblar is rejected",
            matches: (r) => saw(r, "cannot be thrown"),
            verify: (r) => {
              assert(
                !skillTriggered(r, SkillType.THROW_TEAM_MATE),
                "a ST 4 team-mate is never thrown"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SWOOP,
    configs: [
      {
        id: "swoop-template",
        name: "Swoop throw-in template",
        description:
          "A thrown Gnoblar with Swoop travels by the Throw-in Template (a D6 direction, then a D6 distance) instead of Scattering",
        setup: ttm({ mode: "throw", extraMateSkills: [SkillType.SWOOP] }),
        script: script({
          mode: "throw",
          x: 14,
          mateRef: MATE,
          swoopFacing: "east",
        }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "swoop-applies",
            name: "The template replaces the Scatter",
            matches: (r) =>
              skillTriggered(r, SkillType.SWOOP) && saw(r, "lands safely"),
            verify: (r) => {
              assert(
                rolled(r, "Swoop Direction") && rolled(r, "Swoop Distance"),
                "Swoop rolls a template direction and a distance"
              );
              assert(
                !rolled(r, "Team-mate Scatter"),
                "Swoop does not use the standard 3-square Scatter template"
              );
            },
          },
        ],
      },
      {
        id: "swoop-landing-reroll",
        name: "Swoop landing re-roll",
        description: "A Swooping Gnoblar may re-roll the Agility Test to land",
        setup: ttm({ mode: "throw", extraMateSkills: [SkillType.SWOOP] }),
        script: script({
          mode: "throw",
          x: 14,
          mateRef: MATE,
          swoopFacing: "east",
        }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "landing-rerolled",
            name: "A failed landing is rolled again",
            matches: (r) => landingRolls(r) === 2,
            verify: (r) => {
              assert(
                landingRolls(r) === 2,
                "Swoop re-rolls the failed landing once"
              );
            },
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
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 2000 },
        outcomes: [
          {
            id: "no-scatter-on-target",
            name: "The thrown Gnoblar lands on the target square, no Scatter",

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
                !rolled(r, "Team-mate Scatter"),
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
        script: script({ mode: "throw", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "strong-arm-applied",
            name: "Strong Arm's +1 is applied",
            matches: (r) => skillTriggered(r, SkillType.STRONG_ARM),
            verify: (r) => {
              assert(
                skillTriggered(r, SkillType.STRONG_ARM),
                "Strong Arm must fire on a Throw Team-mate"
              );
            },
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
        script: script({ mode: "throw", x: 12 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "quick-plus-one",
            name: "The throw is modified by exactly +1",
            matches: (r) =>
              skillTriggered(r, SkillType.STRONG_ARM) &&
              skillCheckDiff(r, "Throw Team-mate") === 1,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Throw Team-mate") === 1,
                "an unmarked Quick throw with Strong Arm is roll + 1"
              );
            },
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
        script: script({ mode: "kick", x: 14 }),
        seedSearch: { from: 1, limit: 800 },
        outcomes: [
          {
            id: "kick-ignores-strong-arm",
            name: "No Strong Arm modifier on a kick",
            matches: (r) => skillTriggered(r, SkillType.KICK_TEAM_MATE),
            verify: (r) => {
              assert(
                !skillTriggered(r, SkillType.STRONG_ARM),
                "Strong Arm must not modify a Kick Team-mate Action"
              );
            },
          },
        ],
      },
    ],
  },
];
