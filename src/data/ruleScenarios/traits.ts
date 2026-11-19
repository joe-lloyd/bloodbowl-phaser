import { z } from "zod";
import { SkillType } from "../../types/Skills";
import { PlayerStatus } from "../../types/Player";
import { RosterName } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { computeActionAvailability } from "../../game/rules/actionAvailability";
import {
  type RuleScenarioEntry,
  playSetup,
  blockConfig,
  assert,
  sawEvent,
  skillTriggered,
  skillCheckDiff,
  turnoverHappened,
  playerOf,
  playerAt,
  playerStanding,
  playerDown,
  resolveRef,
  type ScriptResult,
} from "../../game/rules-lab";

const blockRollCount = (r: ScriptResult): number =>
  r.events.filter((e) => e.name === GameEventNames.BlockDiceRolled).length;

const injuryTotal = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string,
  total: number
): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      z.object({ rollType: z.string().exactOptional() }).parse(d).rollType ===
        `Injury Roll (${playerOf(r, ref).playerName})` &&
      z.object({ total: z.number().exactOptional() }).parse(d).total === total
  );

const stabArmourRolled = (r: Parameters<typeof skillTriggered>[0]): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      z.object({ rollType: z.string().exactOptional() }).parse(d).rollType ===
      "Armor Check"
  );

const injuryRolled = (r: Parameters<typeof skillTriggered>[0]): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      !!z
        .object({ rollType: z.string().exactOptional() })
        .parse(d)
        .rollType?.startsWith("Injury Roll")
  );

const armourRolledFor = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string
): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      z.object({ rollType: z.string().exactOptional() }).parse(d).rollType ===
      `Armour Roll (${playerOf(r, ref).playerName})`
  );

const activationOver = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string
): boolean =>
  sawEvent(
    r,
    GameEventNames.PlayerActivated,
    (d) => d === resolveRef(r.game, ref)
  );

const availabilityFor = (
  r: ScriptResult,
  ref: string,
  hasMovedInAction: boolean
) => {
  const gs = r.game.ctx.gameService;
  const player = playerOf(r, ref);
  const state = gs.getState();
  return computeActionAvailability({
    player,
    ballPosition: state.ballPosition ?? null,
    opponents: gs.getOpponents(player.teamId),
    teammates: gs.getTeammates(player.id),
    reachable: gs.getAvailableMovements(player.id),
    turn: state.turn,
    hasMovedInAction,
  });
};

const lastCommandRefused = (r: ScriptResult, reason: string): boolean => {
  const last = r.responses[r.responses.length - 1];
  return !!last && !last.ok && !!last.reason?.includes(reason);
};

export const TRAIT_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.REGENERATION,
    configs: [
      blockConfig({
        id: "regeneration-save",
        name: "Casualty with Regeneration",
        description: "A 4+ ignores the casualty; the player goes to Reserves",

        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Roster: RosterName.SHAMBLING_UNDEAD,
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              stats: { AV: 4 },
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "regenerated",
            name: "Casualty ignored, player in Reserves",
            matches: (r) => skillTriggered(r, SkillType.REGENERATION),
            verify: (r) => {
              const player = playerOf(r, "team2:0");
              assert(
                player.status === PlayerStatus.RESERVE,
                "the player must be in Reserves"
              );
              assert(!player.gridPosition, "and off the pitch");
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.TITCHY,
    configs: [
      {
        id: "titchy-dodge-bonus",
        name: "Dodge with Titchy",
        description: "+1 to the dodge Agility Test",

        setup: playSetup({
          team1Roster: RosterName.OGRE,
          team1Placements: [{ playerIndex: 3, x: 16, y: 4 }],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:3", action: "move" },
          { type: "move", playerId: "team1:3", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "plus-one-applied",
            name: "+1 on the dodge roll",
            matches: (r) =>
              skillTriggered(r, SkillType.TITCHY) &&
              skillCheckDiff(r, "Dodge") === 1,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Dodge") === 1,
                "dodge total must be roll + 1"
              );
            },
          },
        ],
      },
      {
        id: "titchy-not-marking",
        name: "Dodge into a Titchy player's Tackle Zone",
        description:
          "The Titchy player does not apply the -1 marking modifier to the dodge",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Roster: RosterName.OGRE,
          team2Placements: [{ playerIndex: 3, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },

          { type: "move", playerId: "team1:0", path: [{ x: 10, y: 4 }] },
        ],
        outcomes: [
          {
            id: "marking-forgiven",
            name: "Dodge keeps its net 0 despite the marker",
            matches: (r) =>
              skillTriggered(r, SkillType.TITCHY) &&
              skillCheckDiff(r, "Dodge") === 0,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Dodge") === 0,
                "the Titchy marker's -1 must be forgiven"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.STUNTY,
    configs: [
      {
        id: "stunty-ignores-marking",
        name: "Marked dodge with Stunty",
        description: "No negative marking modifiers on the dodge",

        setup: playSetup({
          team1Roster: RosterName.LIZARDMEN,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },

          { type: "move", playerId: "team1:0", path: [{ x: 10, y: 4 }] },
        ],
        outcomes: [
          {
            id: "marking-ignored",
            name: "Dodge keeps its net 0 despite the marker",
            matches: (r) =>
              skillTriggered(r, SkillType.STUNTY) &&
              skillCheckDiff(r, "Dodge") === 0,
            verify: (r) => {
              assert(
                skillCheckDiff(r, "Dodge") === 0,
                "Stunty must forgive the marking modifier"
              );
            },
          },
        ],
      },
      blockConfig({
        id: "stunty-injury-table",
        name: "Injury Roll against a Stunty player",
        description: "A 7 Knocks Out on the Stunty Injury Table",

        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Roster: RosterName.LIZARDMEN,
          team2Placements: [
            {
              playerIndex: 1,
              x: 11,
              y: 5,
              stats: { AV: 4 },
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:1",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "seven-is-ko",
            name: "The 7 is a KO, not a Stunned",
            matches: (r) =>
              skillTriggered(r, SkillType.STUNTY) &&
              injuryTotal(r, "team2:1", 7),
            verify: (r) => {
              assert(
                playerOf(r, "team2:1").status === PlayerStatus.KO,
                "a 7 Knocks a Stunty player Out"
              );
            },
          },
          {
            id: "nine-is-badly-hurt",
            name: "The 9 is Badly Hurt",
            matches: (r) =>
              skillTriggered(r, SkillType.STUNTY) &&
              injuryTotal(r, "team2:1", 9),
            verify: (r) => {
              assert(
                playerOf(r, "team2:1").status === PlayerStatus.INJURED,
                "a 9 is a Casualty"
              );
              assert(
                !sawEvent(
                  r,
                  GameEventNames.DiceRoll,
                  (d) =>
                    !!z
                      .object({ rollType: z.string().exactOptional() })
                      .parse(d)
                      .rollType?.startsWith("Casualty Roll")
                ),
                "Sevens makes no Casualty Roll"
              );
            },
          },
        ],
      }),
      blockConfig({
        id: "stunty-thick-skull",
        name: "Stunty and Thick Skull together",
        description: "KO only on the 8; the 7 is a Stunned result",

        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Roster: RosterName.BLACK_ORC,
          team2Placements: [
            {
              playerIndex: 4,
              x: 11,
              y: 5,
              stats: { AV: 4 },
            },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:4",
        preferBlockResult: "pow",
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "seven-is-stunned",
            name: "The 7 is only a Stunned result",
            matches: (r) =>
              injuryTotal(r, "team2:4", 7) &&
              r.events.filter(
                (e) =>
                  e.name === GameEventNames.DiceRoll &&
                  !!z
                    .object({ rollType: z.string().exactOptional() })
                    .parse(e.data)
                    .rollType?.startsWith("Injury Roll")
              ).length === 1,
            verify: (r) => {
              assert(
                sawEvent(
                  r,
                  GameEventNames.UI_Notification,
                  (d) => d === "STUNNED!"
                ),
                "the 7 must be announced as a Stunned result"
              );
              assert(
                !sawEvent(
                  r,
                  GameEventNames.UI_Notification,
                  (d) => d === "KNOCKED OUT!"
                ),
                "the 7 must not Knock the player Out"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.NO_BALL,
    configs: [
      {
        id: "no-ball-pickup",
        name: "No Ball player enters the ball's square",
        description: "The pick-up automatically fails as a natural 1",

        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 4, x: 4, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:4", action: "move" },
          { type: "move", playerId: "team1:4", path: [{ x: 5, y: 5 }] },
        ],
        outcomes: [
          {
            id: "auto-fail",
            name: "Pick-up auto-fails, turnover",
            matches: (r) => skillTriggered(r, SkillType.NO_BALL),
            verify: (r) => {
              assert(turnoverHappened(r), "failed pick-up is a turnover");
              assert(
                !r.events.some(
                  (e) =>
                    e.name === "diceRoll" &&
                    z
                      .object({ rollType: z.string().exactOptional() })
                      .parse(e.data)
                      .rollType?.startsWith("Pickup") &&
                    z
                      .object({ description: z.string().exactOptional() })
                      .parse(e.data)
                      .description?.includes("needs")
                ),
                "no real pick-up roll may happen"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.STAB,
    configs: [
      {
        id: "stab-basic",
        name: "Stab Special Action",
        description:
          "An unmodifiable Armour Roll against an adjacent Standing opponent; broken armour means an Injury Roll, else nothing - never a turnover",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason: "Dark Elf Assassins begin with Stab.",
          },
        ],
        script: [
          { type: "declare-action", playerId: "team1:0", action: "stab" },
          { type: "stab", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        outcomes: [
          {
            id: "armour-broken",
            name: "Armour broken - an Injury Roll follows",
            matches: (r) => stabArmourRolled(r) && playerDown(r, "team2:0"),
            verify: (r) => {
              assert(
                injuryRolled(r),
                "broken armour must be followed by an Injury Roll"
              );
              assert(!turnoverHappened(r), "a Stab is never a turnover");
              assert(
                activationOver(r, "team1:0"),
                "the stabber's activation must be over"
              );
            },
          },
          {
            id: "armour-holds",
            name: "Armour holds - nothing happens",
            matches: (r) =>
              stabArmourRolled(r) &&
              playerStanding(r, "team2:0") &&
              !injuryRolled(r),
            verify: (r) => {
              assert(!turnoverHappened(r), "a Stab is never a turnover");
              assert(
                activationOver(r, "team1:0"),
                "the activation ends even when nothing happens"
              );
            },
          },
        ],
      },
      {
        id: "stab-unmodifiable",
        name: "The Stab Armour Roll cannot be modified",
        description:
          "Mighty Blow and Claws never apply - the roll is a straight 2D6 vs AV",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.MIGHTY_BLOW, SkillType.CLAWS],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason: "Dark Elf Assassins begin with Stab.",
          },
        ],
        script: [
          { type: "declare-action", playerId: "team1:0", action: "stab" },
          { type: "stab", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        outcomes: [
          {
            id: "no-modifiers",
            name: "Straight 2D6 - no armour skill fires",
            matches: (r) => stabArmourRolled(r),
            verify: (r) => {
              assert(
                !skillTriggered(r, SkillType.MIGHTY_BLOW),
                "Mighty Blow must not modify a Stab Armour Roll"
              );
              assert(
                !skillTriggered(r, SkillType.CLAWS),
                "Claws must not apply to a Stab Armour Roll"
              );
            },
          },
        ],
      },
      {
        id: "stab-blitz",
        name: "Stab replaces the Block of a Blitz",
        description:
          "During a Blitz the Stab replaces the Block; the activation still ends as soon as the Stab is performed",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5 },
            { playerIndex: 1, x: 10, y: 9 },
            { playerIndex: 2, x: 7, y: 3 },
            { playerIndex: 3, x: 7, y: 7 },
            { playerIndex: 4, x: 7, y: 11 },
          ],
          team2Placements: [
            { playerIndex: 0, x: 12, y: 5 },
            { playerIndex: 1, x: 12, y: 9 },
            { playerIndex: 2, x: 15, y: 3 },
            { playerIndex: 3, x: 15, y: 7 },
            { playerIndex: 4, x: 15, y: 11 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason: "Dark Elf Assassins begin with Stab.",
          },
          {
            playerRef: "team1:1",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason:
              "A second roster-legal Dark Elf Assassin begins with Stab and remains available to verify the team Blitz is spent.",
          },
        ],
        script: [
          {
            type: "declare-action",
            playerId: "team1:0",
            action: "blitz",
            blockReplacement: "stab",
          },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 5 }] },
          { type: "stab", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        outcomes: [
          {
            id: "replaces-block",
            name: "No Block dice - the activation ends with the Stab",
            matches: (r) => stabArmourRolled(r),
            verify: (r) => {
              assert(
                !sawEvent(r, GameEventNames.BlockDiceRolled),
                "no Block dice may be rolled"
              );
              assert(!turnoverHappened(r), "a Stab is never a turnover");
              assert(
                activationOver(r, "team1:0"),
                "the blitzer's activation must be over after the Stab"
              );
            },
          },
        ],
      },
      {
        id: "stab-after-move-refused",
        name: "A direct Stab may not follow a Move",
        description:
          "An Assassin that declares a Move and steps into contact is no longer offered the direct Stab Special Action, and the declaration is refused authoritatively — moving then attacking is what Blitz (with Stab) is for",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason: "Dark Elf Assassins begin with Stab.",
          },
        ],
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 5 }] },
          { type: "declare-action", playerId: "team1:0", action: "stab" },
        ],
        outcomes: [
          {
            id: "not-offered-or-accepted",
            name: "Stab is absent from the menu and the declaration is refused",
            matches: (r) => lastCommandRefused(r, "illegal-action-declaration"),
            verify: (r) => {
              assert(
                availabilityFor(r, "team1:0", false).stab,
                "the scenario must place a legal Stab target adjacent"
              );
              const moved = availabilityFor(r, "team1:0", true);
              assert(
                !moved.stab && moved.directBlockReplacements.length === 0,
                "a moved player is offered no direct block-replacing attack"
              );

              const state = r.game.ctx.gameService.getState();
              assert(
                state.activePlayer?.id === resolveRef(r.game, "team1:0") &&
                  state.activePlayer.action === "move" &&
                  !state.activePlayer.blockReplacement,
                "the refused Stab must leave the Move declaration untouched"
              );
              assert(
                !stabArmourRolled(r),
                "no Stab may be resolved after moving"
              );
            },
          },
        ],
      },
      {
        id: "stab-blitz-target-selection",
        name: "Selecting the target of a declared Stab Blitz never blocks",
        description:
          "With Blitz (with Stab) declared and the Assassin moved into contact, selecting the target resolves the Stab; a normal Block against the same target is refused",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:0",
            skill: SkillType.STAB,
            roster: RosterName.DARK_ELF,
            positionName: "Assassin",
            source: "roster-default",
            reason: "Dark Elf Assassins begin with Stab.",
          },
        ],
        script: [
          {
            type: "declare-action",
            playerId: "team1:0",
            action: "blitz",
            blockReplacement: "stab",
          },
          { type: "move", playerId: "team1:0", path: [{ x: 11, y: 5 }] },

          { type: "block", attackerId: "team1:0", defenderId: "team2:0" },

          { type: "stab", attackerId: "team1:0", defenderId: "team2:0" },
        ],
        outcomes: [
          {
            id: "stab-not-block",
            name: "The Block is refused and the Stab resolves",
            matches: (r) => stabArmourRolled(r),
            verify: (r) => {
              assert(
                r.responses.some(
                  (resp) =>
                    !resp.ok && !!resp.reason?.includes("block-not-declared")
                ),
                "a normal Block must be refused while the Stab is declared"
              );
              assert(
                !sawEvent(r, GameEventNames.BlockDiceRolled),
                "no Block dice may be rolled or previewed"
              );
              assert(
                activationOver(r, "team1:0"),
                "the Stab ends the Assassin's activation"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.UNSTEADY,
    configs: [
      {
        id: "unsteady-secure-ball",
        name: "Unsteady may not Secure the Ball",
        description: "Declaring a Secure the Ball Action is refused",

        setup: playSetup({
          team1Roster: RosterName.NECROMANTIC_HORROR,
          team1Placements: [{ playerIndex: 0, x: 4, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "secureBall" },
        ],
        outcomes: [
          {
            id: "declaration-refused",
            name: "The declaration is refused",
            matches: (r) =>
              r.responses.some(
                (resp) =>
                  !resp.ok &&
                  !!resp.reason?.includes("illegal-action-declaration")
              ),
            verify: (r) => {
              const state = r.game.ctx.gameService.getState();
              assert(
                state.activePlayer?.id !== resolveRef(r.game, "team1:0"),
                "no action may be declared for the Unsteady player"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.FRENZY,
    configs: [
      blockConfig({
        id: "frenzy-second-block",
        name: "Frenzy — forced follow-up and a second Block",
        description:
          "A Khorne Bloodborn Marauder (Frenzy) blocks: on a Push Back it must follow up, and if the target is still Standing it must throw a mandatory second Block at the same player",
        setup: playSetup({
          team1Roster: RosterName.KHORNE,
          team2Roster: RosterName.HUMAN,
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        attacker: "team1:0",
        defender: "team2:0",
        preferBlockResult: "push",
        seedSearch: { from: 1, limit: 600 },
        outcomes: [
          {
            id: "second-block",
            name: "A standing pushed target draws a mandatory second Block",

            matches: (r) =>
              blockRollCount(r) >= 2 &&
              !!playerOf(r, "team1:0").gridPosition &&
              !!playerOf(r, "team2:0").gridPosition,
            verify: (r) => {
              assert(
                !playerAt(r, "team1:0", { x: 10, y: 5 }),
                "Frenzy forces the blocker to follow up the push"
              );

              assert(
                blockRollCount(r) === 2,
                "Frenzy throws exactly one extra Block, not a third"
              );

              assert(
                !sawEvent(r, GameEventNames.UI_FollowUpPrompt),
                "Frenzy follow-ups are automatic — no follow-up prompt"
              );

              const atk = playerOf(r, "team1:0").gridPosition;
              const def = playerOf(r, "team2:0").gridPosition;
              assert(
                !!atk &&
                  !!def &&
                  Math.abs(atk.x - def.x) <= 1 &&
                  Math.abs(atk.y - def.y) <= 1,
                "the blocker follows up adjacent after the second Block"
              );
            },
          },
          {
            id: "followup-on-knockdown",
            name: "A knocked-down target still forces the follow-up (no second Block)",
            matches: (r) =>
              blockRollCount(r) === 1 &&
              playerDown(r, "team2:0") &&
              playerAt(r, "team1:0", { x: 11, y: 5 }),
            verify: (r) => {
              assert(
                playerAt(r, "team1:0", { x: 11, y: 5 }),
                "Frenzy follows the blocker up into the vacated square"
              );
              assert(
                blockRollCount(r) === 1,
                "a downed target is not Standing, so there is no second Block"
              );
            },
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.CHAINSAW,
    configs: [
      {
        id: "chainsaw-attack",
        name: "Chainsaw Attack",
        description:
          "A D6: on 2+ a +3 Armour Roll against an adjacent Standing opponent; on a 1 the chainsaw Kicks-back and Knocks the wielder Down",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 4, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { AV: 7 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:4",
            skill: SkillType.CHAINSAW,
            roster: RosterName.GOBLIN,
            positionName: "Loony",
            source: "roster-default",
            reason: "Goblin Looneys begin with Chainsaw.",
          },
        ],
        script: [
          { type: "declare-action", playerId: "team1:4", action: "chainsaw" },
          {
            type: "special-action",
            action: "chainsaw",
            attackerId: "team1:4",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "attack-armour-roll",
            name: "A 2+ makes the +3 Armour Roll on the target",
            matches: (r) =>
              skillTriggered(r, SkillType.CHAINSAW) &&
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) =>
                  !!z
                    .object({ rollType: z.string().exactOptional() })
                    .parse(d)
                    .rollType?.startsWith("Chainsaw Kick-back") &&
                  z.object({ resultState: z.string().exactOptional() }).parse(d)
                    .resultState === "success"
              ) &&
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) =>
                  z.object({ rollType: z.string().exactOptional() }).parse(d)
                    .rollType === "Armor Check"
              ) &&
              playerStanding(r, "team1:4"),
            verify: (r) => {
              assert(
                playerStanding(r, "team1:4"),
                "no kick-back on a 2+ — the wielder stays Standing"
              );
              assert(
                !turnoverHappened(r),
                "the Chainsaw Attack itself is not a Turnover"
              );
            },
          },
          {
            id: "kick-back",
            name: "A 1 kicks back and Knocks the wielder Down",
            matches: (r) =>
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) =>
                  !!z
                    .object({ rollType: z.string().exactOptional() })
                    .parse(d)
                    .rollType?.startsWith("Chainsaw Kick-back") &&
                  z.object({ resultState: z.string().exactOptional() }).parse(d)
                    .resultState === "failure"
              ) && playerDown(r, "team1:4"),
            verify: (r) => {
              assert(
                playerDown(r, "team1:4"),
                "a kick-back Knocks the wielder Down"
              );
              assert(
                turnoverHappened(r),
                "the wielder going down is a Turnover"
              );
            },
          },
        ],
      },
      {
        id: "chainsaw-blitz",
        name: "Chainsaw replaces the Block of a Blitz",
        description:
          "A rostered Goblin Loony moves, then resolves the declared Chainsaw attack instead of rolling Block dice.",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 4, x: 10, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:4",
            skill: SkillType.CHAINSAW,
            roster: RosterName.GOBLIN,
            positionName: "Loony",
            source: "roster-default",
            reason: "Goblin Looneys begin with Chainsaw.",
          },
        ],
        script: [
          {
            type: "declare-action",
            playerId: "team1:4",
            action: "blitz",
            blockReplacement: "chainsaw",
          },
          { type: "move", playerId: "team1:4", path: [{ x: 11, y: 5 }] },
          {
            type: "special-action",
            action: "chainsaw",
            attackerId: "team1:4",
            defenderId: "team2:0",
          },
        ],
        outcomes: [
          {
            id: "replaces-block",
            name: "The Chainsaw attack resolves with no Block dice",
            matches: (r) => skillTriggered(r, SkillType.CHAINSAW),
            verify: (r) => {
              assert(
                !sawEvent(r, GameEventNames.BlockDiceRolled),
                "no Block dice may be rolled"
              );
              assert(
                activationOver(r, "team1:4"),
                "the Loony's activation ends after the attack"
              );
            },
          },
        ],
      },
      {
        id: "chainsaw-illegal-target-refused",
        name: "A declared Chainsaw refuses an illegal target",
        description:
          "Selecting a Prone opponent while Blitz (with Chainsaw) is declared is refused — it never decays into a Block — and the declaration, the movement and the unspent attack all survive",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 4, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 12, y: 5 },
            { playerIndex: 1, x: 12, y: 6, status: PlayerStatus.PRONE },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        skillProvenance: [
          {
            playerRef: "team1:4",
            skill: SkillType.CHAINSAW,
            roster: RosterName.GOBLIN,
            positionName: "Loony",
            source: "roster-default",
            reason: "Goblin Looneys begin with Chainsaw.",
          },
        ],
        script: [
          {
            type: "declare-action",
            playerId: "team1:4",
            action: "blitz",
            blockReplacement: "chainsaw",
          },
          { type: "move", playerId: "team1:4", path: [{ x: 11, y: 5 }] },
          {
            type: "special-action",
            action: "chainsaw",
            attackerId: "team1:4",
            defenderId: "team2:1",
          },
        ],
        outcomes: [
          {
            id: "refused-intact",
            name: "The attack is refused and nothing is spent",
            matches: (r) =>
              lastCommandRefused(r, "illegal-special-action-target"),
            verify: (r) => {
              const gs = r.game.ctx.gameService;
              const state = gs.getState();
              const loonyId = resolveRef(r.game, "team1:4");
              assert(
                state.activePlayer?.id === loonyId &&
                  state.activePlayer.blockReplacement === "chainsaw" &&
                  state.activePlayer.blockReplacementUsed === false,
                "the declaration survives an illegal target"
              );
              assert(
                state.turn.movementUsed.get(loonyId) === 1,
                "the refusal costs no extra movement"
              );
              assert(
                !skillTriggered(r, SkillType.CHAINSAW),
                "no Chainsaw attack may resolve against an illegal target"
              );
              assert(
                !sawEvent(r, GameEventNames.BlockDiceRolled),
                "the refusal must never decay into a Block"
              );
              assert(
                playerAt(r, "team1:4", { x: 11, y: 5 }),
                "the Loony keeps its square and its remaining movement"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BOMBARDIER,
    configs: [
      {
        id: "throw-bomb",
        name: "Throw Bomb Special Action",
        description:
          "A bomb thrown like a Pass; when it comes to rest it explodes, hitting the square it lands in (Armour Rolls all round). A Fumble blows up in the Bomber's own square — a Turnover.",

        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 5, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 13, y: 5, status: PlayerStatus.PRONE },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:5", action: "throwBomb" },
          { type: "throw-bomb", throwerId: "team1:5", x: 13, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "accurate-explodes",
            name: "An on-target bomb explodes and rolls Armour for the player hit",
            matches: (r) =>
              skillTriggered(r, SkillType.BOMBARDIER) &&
              armourRolledFor(r, "team2:0") &&
              playerStanding(r, "team1:5"),
            verify: (r) => {
              assert(
                sawEvent(
                  r,
                  GameEventNames.UI_Notification,
                  (d) => d === "BOOM! The bomb explodes!"
                ),
                "the bomb must explode where it lands"
              );
              assert(
                !turnoverHappened(r),
                "a bomb landing on an opponent is not a Turnover"
              );
            },
          },
          {
            id: "fumble-self-detonates",
            name: "A Fumbled bomb blows up in the Bomber's own square",
            matches: (r) =>
              skillTriggered(r, SkillType.BOMBARDIER) &&
              playerDown(r, "team1:5") &&
              turnoverHappened(r),
            verify: (r) => {
              assert(
                playerDown(r, "team1:5"),
                "the Bomber is caught in their own blast"
              );
              assert(turnoverHappened(r), "a Fumbled bomb is a Turnover");
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.BALL_AND_CHAIN,
    configs: [
      {
        id: "ball-and-chain-block",
        name: "Ball & Chain lurches into a Standing player",
        description:
          "The Fanatic (ST 7) swings toward an End Zone and Blocks the first Standing player it lurches into: a normal Block Action, so its coach picks the die and may re-roll it. Each command is one square of the Throw-in Template.",

        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 6, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 4 },
            { playerIndex: 1, x: 11, y: 5 },
            { playerIndex: 2, x: 11, y: 6 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },

          { type: "ball-and-chain", playerId: "team1:6", x: 1, y: 0 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "auto-block",
            name: "The Fanatic Blocks whoever it lurches into",
            matches: (r) =>
              skillTriggered(r, SkillType.BALL_AND_CHAIN) &&
              sawEvent(
                r,
                GameEventNames.BlockDiceRolled,
                (d) =>
                  z.object({ attackerId: z.string().exactOptional() }).parse(d)
                    .attackerId === playerOf(r, "team1:6").id
              ),
            verify: (r) => {
              assert(
                r.decisions.some((d) => d.type === "block-dice"),
                "the Fanatic's coach must be offered the block dice"
              );
            },
          },
        ],
      },
      {
        id: "ball-and-chain-stand-firm",
        name: "Ball & Chain into a Stand Firm player",
        description:
          "The Fanatic lurches into a Pump Wagon, which Stands Firm against the push. The May 2026 FAQ: the Fanatic stays in the square it started in, and the square still counts as one square of movement.",

        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 6, x: 10, y: 5 }],
          team2Roster: RosterName.SNOTLING,
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },
          { type: "ball-and-chain", playerId: "team1:6", x: 1, y: 0 },
        ],
        decisionPolicy: { preferBlockResult: "push", acceptReactions: true },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "stood-firm",
            name: "Stand Firm holds: the Fanatic stays where it started",
            matches: (r) =>
              skillTriggered(r, SkillType.STAND_FIRM) &&
              playerAt(r, "team1:6", { x: 10, y: 5 }) &&
              playerAt(r, "team2:0", { x: 11, y: 5 }),
            verify: (r) => {
              const fanatic = playerOf(r, "team1:6");
              assert(
                r.game.ctx.gameService.getMovementUsed(fanatic.id) === 1,
                "the refused square still counts as one square of movement"
              );
              assert(!turnoverHappened(r), "a refused push is no Turnover");
            },
          },
        ],
      },
      {
        id: "ball-and-chain-chain-push",
        name: "Ball & Chain chain-pushes a boxed-in player",
        description:
          "The Fanatic lurches into a Lineman with every square behind them filled. The push goes through the normal engine: the Fanatic's coach pushes the Lineman into a team-mate, picks where that one goes, and the Fanatic moves into the emptied square with no follow-up choice.",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 6, x: 10, y: 5 }],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5 },
            { playerIndex: 1, x: 12, y: 4 },
            { playerIndex: 2, x: 12, y: 5 },
            { playerIndex: 3, x: 12, y: 6 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },
          { type: "ball-and-chain", playerId: "team1:6", x: 1, y: 0 },
        ],
        decisionPolicy: { preferBlockResult: "push" },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "chain-push",
            name: "Two push directions, and the Fanatic moves in",
            matches: (r) =>
              r.decisions.filter((d) => d.type === "push-direction").length ===
                2 && playerAt(r, "team1:6", { x: 11, y: 5 }),
            verify: (r) => {
              assert(
                !r.decisions.some((d) => d.type === "follow-up"),
                "the Fanatic moves in without a follow-up choice"
              );
            },
          },
        ],
      },
      {
        id: "ball-and-chain-team-mate",
        name: "Ball & Chain into a team-mate",
        description:
          "The Fanatic lurches into its own Goblin. It Blocks them all the same, and its coach chooses the result. A team-mate Knocked Down in their own team's turn is a Turnover.",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [
            { playerIndex: 6, x: 10, y: 5 },
            { playerIndex: 1, x: 11, y: 4 },
            { playerIndex: 2, x: 11, y: 5 },
            { playerIndex: 3, x: 11, y: 6 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },
          { type: "ball-and-chain", playerId: "team1:6", x: 1, y: 0 },
        ],
        decisionPolicy: { preferBlockResult: "pow" },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "team-mate-down",
            name: "The team-mate goes down: a Turnover",
            matches: (r) =>
              r.decisions.some(
                (d) =>
                  d.type === "block-dice" &&
                  d.chooserTeamId === r.game.ctx.team1.id
              ) &&
              ["team1:1", "team1:2", "team1:3"].some((ref) =>
                playerDown(r, ref)
              ),
            verify: (r) => {
              assert(
                turnoverHappened(r),
                "knocking a team-mate down is a Turnover"
              );
            },
          },
        ],
      },
      {
        id: "ball-and-chain-rush",
        name: "Ball & Chain Rushes past its MA",
        description:
          "Five squares East across an empty pitch: three for MA 3, then two Rushes. A failed Rush still moves into the square first, then the Fanatic Falls Over there: an Injury Roll with no Armour Roll, Stunned counting as Knocked-out.",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [
            { playerIndex: 6, x: 5, y: 5 },

            { playerIndex: 3, x: 1, y: 9 },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },
          ...[1, 2, 3, 4, 5].map(
            () =>
              ({
                type: "ball-and-chain",
                playerId: "team1:6",
                x: 1,
                y: 0,
              }) as const
          ),
        ],
        decisionPolicy: { acceptRerolls: false },
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "rushed",
            name: "Both Rushes made: five squares, and the activation ends",
            matches: (r) =>
              playerStanding(r, "team1:6") &&
              r.game.ctx.gameService.getMovementUsed(
                playerOf(r, "team1:6").id
              ) === 5,
            verify: (r) => {
              assert(
                r.game.ctx.gameService.hasPlayerActed(
                  playerOf(r, "team1:6").id
                ),
                "the activation ends once MA and both Rushes are spent"
              );
            },
          },
          {
            id: "fell-over",
            name: "A Rush fails: in the square, then Falls Over",
            matches: (r) =>
              playerDown(r, "team1:6") &&
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) =>
                  z
                    .object({ description: z.string().exactOptional() })
                    .parse(d)
                    .description?.startsWith("Injury Roll (Fanatic") ?? false
              ),
            verify: (r) => {
              assert(turnoverHappened(r), "falling over is a Turnover");
              assert(
                !sawEvent(
                  r,
                  GameEventNames.DiceRoll,
                  (d) =>
                    z
                      .object({ description: z.string().exactOptional() })
                      .parse(d)
                      .description?.startsWith("Armour Roll (Fanatic") ?? false
                ),
                "a Ball & Chain player takes no Armour Roll"
              );
            },
          },
        ],
      },
      {
        id: "ball-and-chain-crowd",
        name: "Ball & Chain lurches off the pitch",
        description:
          "Swinging toward the Sideline from the edge, the Fanatic lurches off the pitch. The May 2026 FAQ: that counts as being Pushed into the Crowd, a Turnover, and a Stunned result goes to the Reserves rather than Knocked-out.",
        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 6, x: 10, y: 0 }],
          team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
          ballPosition: { x: 1, y: 5 },
        }),
        script: [
          {
            type: "declare-action",
            playerId: "team1:6",
            action: "ballAndChain",
          },

          { type: "ball-and-chain", playerId: "team1:6", x: 0, y: -1 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "crowd-surf",
            name: "Off the pitch — hurt by the Crowd, a Turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.BALL_AND_CHAIN) &&
              turnoverHappened(r) &&
              !playerOf(r, "team1:6").gridPosition,
            verify: (r) => {
              assert(
                !playerOf(r, "team1:6").gridPosition,
                "the Fanatic has left the pitch"
              );
              assert(turnoverHappened(r), "surfing the crowd is a Turnover");
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.SECRET_WEAPON,
    configs: [
      {
        id: "secret-weapon-end-of-drive",
        name: "Secret Weapon is Sent-off after the Drive",
        description:
          "A Secret Weapon that took part in the Drive is Sent-off when a touchdown ends that Drive",

        setup: playSetup({
          team1Roster: RosterName.GOBLIN,
          team1Placements: [{ playerIndex: 5, x: 18, y: 5 }],
          team2Placements: [{ playerIndex: 0, x: 10, y: 8 }],
          ballPosition: { x: 18, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:5", action: "move" },
          { type: "move", playerId: "team1:5", path: [{ x: 19, y: 5 }] },
        ],
        outcomes: [
          {
            id: "sent-off",
            name: "The Secret Weapon is removed before the next Drive",
            matches: (r) =>
              skillTriggered(r, SkillType.SECRET_WEAPON) &&
              playerOf(r, "team1:5").status === PlayerStatus.REMOVED,
            verify: (r) => {
              assert(
                playerOf(r, "team1:5").status === PlayerStatus.REMOVED,
                "the Secret Weapon must be Sent-off"
              );
              assert(
                !playerOf(r, "team1:5").gridPosition,
                "a Sent-off player must be off the pitch"
              );
            },
          },
        ],
      },
    ],
  },
  {
    skill: SkillType.VIOLENT_INNOVATOR,
    configs: [
      {
        id: "violent-innovator-special-casualty",
        name: "Violent Innovator earns a Special Action Casualty",
        description:
          "When Stab causes a Casualty, Violent Innovator credits the attacker as the casualty causer for SPP",
        setup: playSetup({
          team1Roster: RosterName.DARK_ELF,
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.VIOLENT_INNOVATOR],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5, stats: { AV: 2 } }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "stab" },
          {
            type: "stab",
            attackerId: "team1:0",
            defenderId: "team2:0",
          },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "casualty-credited",
            name: "The Special Action casualty is credited",
            matches: (r) =>
              skillTriggered(r, SkillType.VIOLENT_INNOVATOR) &&
              playerOf(r, "team2:0").status === PlayerStatus.INJURED,
            verify: (r) => {
              assert(
                skillTriggered(r, SkillType.VIOLENT_INNOVATOR),
                "Violent Innovator must credit the Special Action casualty"
              );
            },
          },
        ],
      },
    ],
  },
];
