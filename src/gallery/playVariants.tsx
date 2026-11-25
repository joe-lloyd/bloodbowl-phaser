import { type AllEvents, GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { InjuryType, PlayerCondition, PlayerStatus } from "../types/Player";
import { RosterName } from "../types/Team";
import { getSidelineCrewInfo } from "../game/presentation/sidelineStaff";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { readPlayground } from "../boundary/kickoffPlayground";
import { KickoffPlaygroundPanel } from "../ui/components/hud/KickoffPlaygroundPanel";
import type { MatchFixture } from "./fixtures";
import {
  BLOCK_SCENE,
  hud,
  inPlay,
  livePlayer,
  type MatchRow,
  PASS_SCENE,
  playRows,
  SCRIMMAGE,
  select,
} from "./matchStage";
import {
  click,
  every,
  later,
  LONG,
  onlineMatch,
  setScore,
} from "./variantHelpers";
import { rows, type Variant } from "./variant";

const refreshScore = (fx: MatchFixture) => {
  fx.bus.emit(
    GameEventNames.GameStateRestored,
    fx.services.gameService.getState()
  );
};

const SCORE_ROWS: MatchRow[] = [
  {
    id: "score-typical",
    title: "Home side active",
    open: (fx) => {
      setScore(fx, 1, 0);
      refreshScore(fx);
    },
  },
  {
    id: "match-strip-effects",
    title: "Weather, spent actions and drive effects",
    open: (fx) => {
      const state = fx.services.gameService.getState();
      state.turn.turnNumber = 5;
      fx.services.gameService.seedTurnCounts(5);
      state.turn.hasBlitzed = true;
      state.turn.hasPassed = true;
      state.turn.hasHandedOff = true;
      state.turn.hasFouled = true;
      state.weather = "Pouring Rain";
      state.activeTeamId = fx.team1.id;
      state.driveEffects = {
        freeRerolls: { [fx.team1.id]: 1 },
        owedAssists: { [fx.team2.id]: { turn: 5, used: false } },
        playerModifiers: {
          [fx.player(1, 0).id]: { maModifier: -1, avModifier: -1 },
        },
      };
      refreshScore(fx);
    },
  },
  {
    id: "score-long",
    title: "Long team names, second half",
    fixture: { ...SCRIMMAGE, ...LONG },
    open: (fx) => {
      setScore(fx, 2, 3, true);
      refreshScore(fx);
    },
  },
  {
    id: "score-colours",
    title: "White and yellow teams, away side active",
    fixture: {
      ...SCRIMMAGE,
      team1Color: 0xf2f2f2,
      team2Color: 0xf4c430,
      team1Name: "Elfheim Eagles",
      team2Name: "Sunfire Halflings",
      team1Roster: RosterName.ELVEN_UNION,
      team2Roster: RosterName.HALFLING,
    },
    open: (fx) => {
      setScore(fx, 0, 0);
      fx.services.gameService.getState().activeTeamId = fx.team2.id;
      refreshScore(fx);
    },
  },
];

type StepList = AllEvents[typeof GameEventNames.UI_UpdateActionSteps]["steps"];

const steps = (currentStepId: string, list: StepList) => (fx: MatchFixture) => {
  select(fx, 1, 0);
  fx.bus.emit(GameEventNames.UI_UpdateActionSteps, {
    currentStepId,
    steps: list,
  });
};

const MOVE_THEN_PASS = [
  { id: "move", label: "Move" },
  { id: "pass", label: "Pass" },
];

const MENU_ROWS: MatchRow[] = [
  {
    id: "menu-none",
    title: "Nobody selected",
    open: () => undefined,
  },
  {
    id: "menu-block",
    title: "Next to an opponent",
    fixture: BLOCK_SCENE,
    open: (fx) => {
      select(fx, 2, 0);
    },
  },
  {
    id: "menu-long",
    title: "A long menu",
    open: (fx) => {
      select(fx, 1, 0);
    },
  },
  {
    id: "menu-special",
    title: "A special action",
    fixture: { scenario: "chainsaw-loony" },
    open: (fx) => {
      select(fx, 1, 4);
    },
  },
  {
    id: "menu-sequence",
    title: "Action sequence, first step",
    fixture: PASS_SCENE,
    open: steps("move", MOVE_THEN_PASS),
  },
  {
    id: "menu-sequence-second",
    title: "Action sequence, last step",
    fixture: PASS_SCENE,
    open: steps("pass", MOVE_THEN_PASS),
  },
  {
    id: "menu-sequence-jump",
    title: "Action sequence, Jump chosen in the Move step",
    fixture: PASS_SCENE,
    open: steps("move", [
      { id: "move", label: "Move", half: "jump" },
      { id: "pass", label: "Pass" },
    ]),
  },
  {
    id: "menu-prone",
    title: "A Prone player",
    open: (fx) => {
      livePlayer(fx, 1, 0).status = PlayerStatus.PRONE;
      select(fx, 1, 0);
    },
  },
  {
    id: "other-coach-prompt",
    title: "The other coach is deciding, read-only",
    fixture: BLOCK_SCENE,
    open: (fx) => {
      fx.bus.emit(GameEventNames.RemotePromptChanged, {
        playerId: fx.player(2, 0).id,
        rolls: [{ type: "rush", target: 2 }],
      });
    },
  },
];

const PLAN_ROWS: MatchRow[] = [
  {
    id: "action-plan-blitz",
    title: "Every roll before Go",
    fixture: PASS_SCENE,
    open: (fx) => {
      fx.bus.emit(GameEventNames.UI_ActionPlan, {
        title: "Blitz",
        squares: 4,
        stages: [
          {
            label: "Before acting",
            rolls: [{ kind: "gate", name: "Bone-head", target: 2 }],
            notes: ["On a fail they are Distracted and the activation ends."],
          },
          {
            label: "Move 4 squares",
            rolls: [
              { kind: "dodge", name: "Dodge", target: 3 },
              { kind: "rush", name: "Rush", target: 2 },
            ],
            notes: [],
          },
          {
            label: "Block #5 Lineman",
            rolls: [],
            notes: [
              "2 dice, you pick",
              "Our ST 5 (4 +1) vs their ST 3",
              "Our assists: #2",
              "Their assists: none",
            ],
          },
        ],
        rerolls: ["team 2 left"],
        blocked: null,
      });
    },
  },
  {
    id: "action-plan-blocked",
    title: "A plan that cannot go",
    fixture: PASS_SCENE,
    open: (fx) => {
      fx.bus.emit(GameEventNames.UI_ActionPlan, {
        title: "Move",
        squares: 9,
        stages: [{ label: "Move 9 squares", rolls: [], notes: [] }],
        rerolls: [],
        blocked: "Too far for this player.",
      });
    },
  },
  {
    id: "route-summary",
    title: "Route summary in the action sequence",
    fixture: PASS_SCENE,
    open: (fx) => {
      steps("move", [{ id: "move", label: "Move" }])(fx);
      later(60, () => {
        fx.bus.emit(GameEventNames.UI_RoutePreview, {
          movementLeft: 0,
          riskySteps: 3,
          rolls: [
            { type: "dodge", target: 3, square: { x: 8, y: 3 } },
            { type: "rush", target: 2, square: { x: 9, y: 3 } },
            { type: "rush", target: 2, square: { x: 10, y: 3 } },
          ],
          rerolls: ["Dodge", "team 2 left"],
        });
      });
    },
  },
  {
    id: "target-preview",
    title: "Target preview beside the pointer",
    open: (fx) => {
      fx.bus.emit(GameEventNames.UI_TargetRollPreview, {
        square: { x: 12, y: 5 },
        lines: [
          "Block: 2 dice, you pick",
          "Our ST 4 vs their ST 3",
          "Our assists: #2 Blitzer",
          "Their assists: #9 Lineman",
        ],
        danger: false,
        anchor: { x: 0.45, y: 0.45 },
      });
    },
  },
];

const CARD_ROWS: MatchRow[] = [
  {
    id: "card-selected",
    title: "Selected player",
    open: (fx) => {
      livePlayer(fx, 1, 4).spp = 8;
      select(fx, 1, 4);
    },
  },
  {
    id: "card-compare",
    title: "Comparing a hovered opponent",
    open: (fx) => {
      select(fx, 1, 4);
      fx.bus.emit(GameEventNames.UI_ShowPlayerInfo, livePlayer(fx, 2, 5));
    },
  },
  {
    id: "card-injured",
    title: "Long name, stunned, with a condition and injuries",
    open: (fx) => {
      const player = livePlayer(fx, 2, 0);
      player.playerName = "Grimgutz Skullsplitta the Unwashed";
      player.status = PlayerStatus.STUNNED;
      player.injuries = [InjuryType.NIGGLING_INJURY];
      player.conditions = [{ type: PlayerCondition.DISTRACTED }];
      select(fx, 2, 0);
    },
  },
  {
    id: "card-crew",
    title: "Sideline crew",
    open: (fx) => {
      fx.bus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew: getSidelineCrewInfo("coach", fx.team1),
      });
    },
  },
];

const openMenu = () => {
  click('[aria-haspopup="menu"]');
};

const OPTION_ROWS: MatchRow[] = [
  { id: "options-open", title: "Open, local match", open: openMenu },
  {
    id: "options-confirm",
    title: "Online guest, confirming a destructive action",
    view: (fx) => {
      const off = () => undefined;
      setActiveOnlineMatch(onlineMatch(fx));
      return hud(fx, {
        onlineMenu: {
          role: "guest",
          opponentName: "Grimgutz",
          connection: "abandonable",
          endRequest: "none",
          onSaveAndExit: off,
          onRequestEndMatch: off,
          onCancelEndMatch: off,
          onForceAbandon: off,
          onReconnect: off,
        },
      });
    },
    open: () => {
      openMenu();
      later(120, () => {
        const items = [
          ...document.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not([disabled])'
          ),
        ];
        items
          .find((item) => /abandon|end match/i.test(item.textContent))
          ?.click();
      });
    },
  },
];

const replay =
  (ms: number, show: (fx: MatchFixture) => void) => (fx: MatchFixture) => {
    const start = inPlay((ready) => {
      show(ready);
    })(fx);
    const stop = every(ms, () => {
      show(fx);
    });
    return () => {
      start();
      stop();
    };
  };

const BANNERS = rows(
  {
    group: "In play",
    section: "Banners",
    fixture: SCRIMMAGE,
    view: hud,
  },
  [
    {
      id: "announce-turn",
      title: "Turn started",
      drive: replay(3000, (fx) => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Turn 3",
          subtitle: "Reikland Reavers",
        });
      }),
    },
    {
      id: "announce-time-up",
      title: "Time up",
      drive: replay(4000, (fx) => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "time-up",
          headline: "Time up",
          subtitle: "Reikland Reavers' turn ended",
        });
      }),
    },
    {
      id: "announce-touchdown",
      title: "Touchdown",
      drive: replay(4000, (fx) => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "touchdown",
          headline: "Touchdown!",
          subtitle: "Gouged Eye score. Reikland Reavers 0 - 1 Gouged Eye",
        });
      }),
    },
    {
      id: "announce-casualty",
      title: "Casualty",
      drive: replay(4000, (fx) => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "casualty",
          headline: "Casualty!",
          subtitle: "Human Lineman #3 is Badly Hurt",
        });
      }),
    },
    {
      id: "turnover",
      title: "Turnover",
      drive: replay(2000, (fx) => {
        fx.bus.emit(GameEventNames.UI_Turnover, {
          teamId: fx.team1.id,
          reason: "Failed Dodge",
        });
      }),
    },
    {
      id: "toast",
      title: "Toast",
      drive: replay(3000, (fx) => {
        fx.bus.emit(
          GameEventNames.UI_Notification,
          "That square is out of reach."
        );
      }),
    },
  ]
);

const WHOLE_HUD = rows({ group: "In play", section: "Whole HUD", view: hud }, [
  {
    id: "hud-play",
    title: "A player selected",
    fixture: BLOCK_SCENE,
    drive: inPlay((fx) => {
      setScore(fx, 1, 0);
      refreshScore(fx);
      select(fx, 2, 0);
    }),
  },
  {
    id: "hud-sandbox",
    title: "Sandbox, a scenario loaded",
    fixture: BLOCK_SCENE,
    view: (fx) => hud(fx, { mode: "sandbox" }),
    drive: inPlay((fx) => {
      click('[data-testid="sandbox-toggle"]');
      fx.bus.emit(GameEventNames.ScenarioLoaded, {
        name: "Block & Injury Test",
        seed: 10,
        expectedOutcome: "Defender will be stunned",
      });
    }),
  },
  {
    id: "hud-playground",
    title: "Kick-off playground",
    fixture: BLOCK_SCENE,
    view: (fx) =>
      hud(fx, {
        mode: "sandbox",
        sandboxPanel: (
          <KickoffPlaygroundPanel
            config={readPlayground(new URLSearchParams())}
            onChange={() => undefined}
            onRestart={() => undefined}
          />
        ),
      }),
    drive: inPlay(() => {
      click('[data-testid="sandbox-toggle"]');
    }),
  },
  {
    id: "hud-sandbox-idle",
    title: "Sandbox, choosing a scenario",
    fixture: { phase: GamePhase.SANDBOX_IDLE },
    view: (fx) => hud(fx, { mode: "sandbox" }),
    drive: (fx) =>
      later(60, () => {
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SANDBOX_IDLE,
        });
      }),
  },
]);

export const PLAY_VARIANTS: Variant[] = [
  ...WHOLE_HUD,
  ...playRows("Score bar and match strip", SCORE_ROWS),
  ...playRows("Action menu and sequence", MENU_ROWS),
  ...playRows("Plans and previews", PLAN_ROWS),
  ...playRows("Player card", CARD_ROWS),
  ...playRows("Match options", OPTION_ROWS),
  ...BANNERS,
];
