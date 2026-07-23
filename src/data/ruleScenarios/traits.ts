/**
 * Rule scenarios — Traits (No Ball, Titchy, Stunty, Stab, Unsteady).
 */

import { SkillType } from "../../types/Skills";
import { PlayerStatus } from "../../types/Player";
import { RosterName } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import {
  RuleScenarioEntry,
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
  ScriptResult,
} from "../../game/rules-lab";

/** How many Block Actions were rolled in the run (Frenzy's second block). */
const blockRollCount = (r: ScriptResult): number =>
  r.events.filter((e) => e.name === GameEventNames.BlockDiceRolled).length;

/** THIS player's injury 2D6 landed on this total (before rule adjustments). */
const injuryTotal = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string,
  total: number
): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      (d as { rollType?: string }).rollType ===
        `Injury Roll (${playerOf(r, ref).playerName})` &&
      (d as { total?: number }).total === total
  );

/** The Stab's direct (unmodifiable) Armour Roll was made. */
const stabArmourRolled = (r: Parameters<typeof skillTriggered>[0]): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => (d as { rollType?: string }).rollType === "Armor Check"
  );

/** Any Injury Roll happened in the run. */
const injuryRolled = (r: Parameters<typeof skillTriggered>[0]): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) => !!(d as { rollType?: string }).rollType?.startsWith("Injury Roll")
  );

/** An Armour Roll was made for the referenced player (ArmourOperation). */
const armourRolledFor = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string
): boolean =>
  sawEvent(
    r,
    GameEventNames.DiceRoll,
    (d) =>
      (d as { rollType?: string }).rollType ===
      `Armour Roll (${playerOf(r, ref).playerName})`
  );

/**
 * The player's activation is spent (Stab always ends it). Checked on the
 * event log, not live state: finishing the active team's last player flips
 * the turn, which resets the activatedPlayerIds set.
 */
const activationOver = (
  r: Parameters<typeof skillTriggered>[0],
  ref: string
): boolean =>
  sawEvent(
    r,
    GameEventNames.PlayerActivated,
    (d) => d === resolveRef(r.game, ref)
  );

export const TRAIT_RULE_SCENARIOS: RuleScenarioEntry[] = [
  {
    skill: SkillType.DECAY,
    configs: [
      blockConfig({
        id: "decay-casualty",
        name: "Casualty against a Decay player",
        description: "+1 to the casualty roll",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.DECAY],
              stats: { AV: 4 }, // reach casualties often
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
            id: "plus-one-casualty",
            name: "Casualty roll modified by +1",
            matches: (r) => skillTriggered(r, SkillType.DECAY),
          },
        ],
      }),
    ],
  },
  {
    skill: SkillType.REGENERATION,
    configs: [
      blockConfig({
        id: "regeneration-save",
        name: "Casualty with Regeneration",
        description: "A 4+ ignores the casualty; the player goes to Reserves",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              playerIndex: 0,
              x: 11,
              y: 5,
              skills: [SkillType.REGENERATION],
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
          team1Placements: [
            { playerIndex: 0, x: 16, y: 4, skills: [SkillType.TITCHY] },
          ],
          team2Placements: [{ playerIndex: 0, x: 16, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 15, y: 3 }] },
        ],
        outcomes: [
          {
            id: "plus-one-applied",
            name: "+1 on the dodge roll",
            matches: (r) =>
              skillTriggered(r, SkillType.TITCHY) &&
              skillCheckDiff(r, "Dodge") === 1,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Dodge") === 1,
                "dodge total must be roll + 1"
              ),
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
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, skills: [SkillType.TITCHY] },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // (10,4) stays inside the Titchy player's Tackle Zone
          { type: "move", playerId: "team1:0", path: [{ x: 10, y: 4 }] },
        ],
        outcomes: [
          {
            id: "marking-forgiven",
            name: "Dodge keeps its net 0 despite the marker",
            matches: (r) =>
              skillTriggered(r, SkillType.TITCHY) &&
              skillCheckDiff(r, "Dodge") === 0,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Dodge") === 0,
                "the Titchy marker's -1 must be forgiven"
              ),
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
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.STUNTY] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          // (10,4) is still marked by the opponent at (11,5)
          { type: "move", playerId: "team1:0", path: [{ x: 10, y: 4 }] },
        ],
        outcomes: [
          {
            id: "marking-ignored",
            name: "Dodge keeps its net 0 despite the marker",
            matches: (r) =>
              skillTriggered(r, SkillType.STUNTY) &&
              skillCheckDiff(r, "Dodge") === 0,
            verify: (r) =>
              assert(
                skillCheckDiff(r, "Dodge") === 0,
                "Stunty must forgive the marking modifier"
              ),
          },
        ],
      },
      blockConfig({
        id: "stunty-injury-table",
        name: "Injury Roll against a Stunty player",
        description: "A 7 Knocks Out on the Stunty Injury Table",
        setup: playSetup({
          team1Placements: [{ playerIndex: 0, x: 10, y: 5 }],
          team2Placements: [
            {
              // playerIndex 1 keeps the name distinct from the attacker's, so
              // the injury-roll matcher cannot hit the attacker's own roll
              playerIndex: 1,
              x: 11,
              y: 5,
              skills: [SkillType.STUNTY],
              stats: { AV: 4 }, // break armour often
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
              skillTriggered(r, SkillType.STUNTY) && injuryTotal(r, "team2:1", 7),
            verify: (r) =>
              assert(
                playerOf(r, "team2:1").status === PlayerStatus.KO,
                "a 7 Knocks a Stunty player Out"
              ),
          },
          {
            id: "nine-is-badly-hurt",
            name: "The 9 is automatically Badly Hurt",
            matches: (r) =>
              skillTriggered(r, SkillType.STUNTY) && injuryTotal(r, "team2:1", 9),
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
                    !!(d as { rollType?: string }).rollType?.startsWith(
                      "Casualty Roll"
                    )
                ),
                "no Casualty Roll is made — automatically Badly Hurt"
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
          team2Placements: [
            {
              // distinct name — see stunty-injury-table
              playerIndex: 1,
              x: 11,
              y: 5,
              skills: [SkillType.STUNTY, SkillType.THICK_SKULL],
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
            // A bare Stunty 7 would be a KO — with Thick Skull it must stay
            // Stunned. The Stunned status wears off to Prone when the turn
            // flips, so the observable is the injury notification, scoped by
            // requiring the defender's roll to be the run's only injury roll.
            id: "seven-is-stunned",
            name: "The 7 is only a Stunned result",
            matches: (r) =>
              injuryTotal(r, "team2:1", 7) &&
              r.events.filter(
                (e) =>
                  e.name === GameEventNames.DiceRoll &&
                  !!(e.data as { rollType?: string }).rollType?.startsWith(
                    "Injury Roll"
                  )
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
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.NO_BALL] },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 8 }],
          ballPosition: { x: 5, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "move" },
          { type: "move", playerId: "team1:0", path: [{ x: 5, y: 5 }] },
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
                    (e.data as { rollType?: string })?.rollType?.startsWith(
                      "Pickup"
                    ) &&
                    (e.data as { description?: string })?.description?.includes(
                      "Target"
                    )
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
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.STAB] },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
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
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.STAB, SkillType.MIGHTY_BLOW, SkillType.CLAWS],
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
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
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.STAB] },
          ],
          team2Placements: [{ playerIndex: 0, x: 12, y: 5 }],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "blitz" },
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
          team1Placements: [
            { playerIndex: 0, x: 4, y: 5, skills: [SkillType.UNSTEADY] },
          ],
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
            matches: (r) => blockRollCount(r) >= 2,
            verify: (r) => {
              // The blocker was forced to follow up out of its start square…
              assert(
                !playerAt(r, "team1:0", { x: 10, y: 5 }),
                "Frenzy forces the blocker to follow up the push"
              );
              // …and threw a second Block (two block rolls, one activation)…
              assert(
                blockRollCount(r) === 2,
                "Frenzy throws exactly one extra Block, not a third"
              );
              // …both follow-ups forced, so no follow-up choice is ever shown…
              assert(
                !sawEvent(r, GameEventNames.UI_FollowUpPrompt),
                "Frenzy follow-ups are automatic — no follow-up prompt"
              );
              // …and after the second Block the blocker has followed up to sit
              // adjacent to the twice-pushed target.
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
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.CHAINSAW] },
          ],
          team2Placements: [
            { playerIndex: 0, x: 11, y: 5, stats: { AV: 7 } },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "chainsaw" },
          {
            type: "special-action",
            action: "chainsaw",
            attackerId: "team1:0",
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
                  !!(d as { rollType?: string }).rollType?.startsWith(
                    "Chainsaw Kick-back"
                  ) &&
                  (d as { resultState?: string }).resultState === "success"
              ) &&
              sawEvent(
                r,
                GameEventNames.DiceRoll,
                (d) => (d as { rollType?: string }).rollType === "Armor Check"
              ) &&
              playerStanding(r, "team1:0"),
            verify: (r) => {
              assert(
                playerStanding(r, "team1:0"),
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
                  !!(d as { rollType?: string }).rollType?.startsWith(
                    "Chainsaw Kick-back"
                  ) &&
                  (d as { resultState?: string }).resultState === "failure"
              ) && playerDown(r, "team1:0"),
            verify: (r) => {
              assert(
                playerDown(r, "team1:0"),
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
          team1Placements: [
            { playerIndex: 0, x: 10, y: 5, skills: [SkillType.BOMBARDIER] },
          ],
          team2Placements: [
            // A Prone target auto-fails the Catch, so the bomb explodes on it.
            { playerIndex: 0, x: 13, y: 5, status: PlayerStatus.PRONE },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "throwBomb" },
          { type: "throw-bomb", throwerId: "team1:0", x: 13, y: 5 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "accurate-explodes",
            name: "An on-target bomb explodes and rolls Armour for the player hit",
            matches: (r) =>
              skillTriggered(r, SkillType.BOMBARDIER) &&
              armourRolledFor(r, "team2:0") &&
              playerStanding(r, "team1:0"),
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
              playerDown(r, "team1:0") &&
              turnoverHappened(r),
            verify: (r) => {
              assert(
                playerDown(r, "team1:0"),
                "the Bomber is caught in their own blast"
              );
              assert(
                turnoverHappened(r),
                "a Fumbled bomb is a Turnover"
              );
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
          "The Fanatic (ST 7) swings toward an End Zone and automatically Blocks the first Standing player it bumps into — its own action, no dodge required.",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 5,
              skills: [SkillType.BALL_AND_CHAIN],
              stats: { ST: 7, MA: 3 },
            },
          ],
          team2Placements: [
            // A wall directly East, so any of the three template arrows lands
            // the Fanatic on a Standing opponent → an automatic Block.
            { playerIndex: 0, x: 11, y: 4 },
            { playerIndex: 1, x: 11, y: 5 },
            { playerIndex: 2, x: 11, y: 6 },
          ],
          ballPosition: { x: 1, y: 1 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "ballAndChain" },
          // Facing East (toward the opponents' End Zone).
          { type: "ball-and-chain", playerId: "team1:0", x: 1, y: 0 },
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
                GameEventNames.DiceRoll,
                (d) =>
                  (d as { rollType?: string }).rollType === "Ball & Chain Block"
              ),
            verify: (r) =>
              assert(
                skillTriggered(r, SkillType.BALL_AND_CHAIN),
                "the Ball & Chain action must have fired"
              ),
          },
        ],
      },
      {
        id: "ball-and-chain-crowd",
        name: "Ball & Chain lurches off the pitch",
        description:
          "Swinging toward the Sideline, the Fanatic can wander off the pitch and be hurt by the Crowd — a Turnover.",
        setup: playSetup({
          team1Placements: [
            {
              playerIndex: 0,
              x: 10,
              y: 1,
              skills: [SkillType.BALL_AND_CHAIN],
              stats: { ST: 7, MA: 3 },
            },
          ],
          team2Placements: [{ playerIndex: 0, x: 18, y: 9 }],
          ballPosition: { x: 1, y: 5 },
        }),
        script: [
          { type: "declare-action", playerId: "team1:0", action: "ballAndChain" },
          // Facing North (toward the top Sideline at y = 0).
          { type: "ball-and-chain", playerId: "team1:0", x: 0, y: -1 },
        ],
        seedSearch: { from: 1, limit: 500 },
        outcomes: [
          {
            id: "crowd-surf",
            name: "Off the pitch — hurt by the Crowd, a Turnover",
            matches: (r) =>
              skillTriggered(r, SkillType.BALL_AND_CHAIN) &&
              turnoverHappened(r) &&
              !playerOf(r, "team1:0").gridPosition,
            verify: (r) => {
              assert(
                !playerOf(r, "team1:0").gridPosition,
                "the Fanatic has left the pitch"
              );
              assert(turnoverHappened(r), "surfing the crowd is a Turnover");
            },
          },
        ],
      },
    ],
  },
];
