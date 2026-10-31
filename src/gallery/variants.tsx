/**
 * Every gallery variant: which fixture it needs, what it renders, and the
 * events it plays into the real components once they are mounted.
 */
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { PlayerCondition, PlayerStatus, InjuryType } from "../types/Player";
import { RosterName } from "../types/Team";
import { KickoffEvent } from "../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../game/kickoff/KickoffEventManager";
import { getSidelineCrewInfo } from "../game/presentation/sidelineStaff";
import {
  setActiveOnlineMatch,
  type ChatMessage,
  type OnlineMatch,
} from "../network/OnlineMatch";
import { ConnectionBanner } from "../ui/pages/ConnectionBanner";
import { getSkill, SkillType } from "../types/Skills";
import type { LobbyDoc } from "../firebase/lobby";
import type { AuthUser } from "../firebase/auth";
import type { BlockRollData } from "../services/BlockResolutionService";
import { FixtureOptions, MatchFixture } from "./fixtures";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { GameHUD } from "../ui/components/hud/GameHUD";
import { MatchStrip } from "../ui/components/hud/MatchStrip";
import { SetupValidator } from "../game/validators/SetupValidator";
import { ScoreBoard } from "../ui/components/hud/ScoreBoard";
import { TurnIndicator } from "../ui/components/hud/TurnIndicator";
import { EndTurnButton } from "../ui/components/hud/EndTurnButton";
import { PlayerInfoPanel } from "../ui/components/hud/PlayerInfoPanel";
import { PlayerActionMenu } from "../ui/components/hud/PlayerActionMenu";
import { DiceLog } from "../ui/components/hud/DiceLog";
import { DiceTray } from "../ui/components/hud/DiceTray";
import { ConfirmationModal } from "../ui/components/hud/ConfirmationModal";
import { BlockDiceDialog } from "../ui/components/hud/BlockDiceDialog";
import { RerollDialog } from "../ui/components/hud/RerollDialog";
import { FollowUpDialog } from "../ui/components/hud/FollowUpDialog";
import { ReactionDialog } from "../ui/components/hud/ReactionDialog";
import { InterceptionDialog } from "../ui/components/hud/InterceptionDialog";
import { ApothecaryDialog } from "../ui/components/hud/ApothecaryDialog";
import { InducementChoiceDialog } from "../ui/components/hud/InducementChoiceDialog";
import { InducementSelectionPanel } from "../ui/components/hud/InducementSelectionPanel";
import { SetupControls } from "../ui/components/hud/SetupControls";
import { KickoffEventOverlay } from "../ui/components/hud/KickoffEventOverlay";
import { SandboxOverlay } from "../ui/components/hud/SandboxOverlay";
import { MatchOptionsMenu } from "../ui/components/hud/MatchOptionsMenu";
import { computeMatchOptionsMenu } from "../ui/components/hud/computeMatchOptionsMenu";
import { SoundToggle } from "../ui/components/hud/SoundToggle";
import { Announcer } from "../ui/components/hud/Announcer";
import { OtherCoachPrompt } from "../ui/components/hud/OtherCoachPrompt";
import { WaitingBanner } from "../ui/pages/WaitingBanner";
import { TurnoverOverlay } from "../ui/components/hud/TurnoverOverlay";
import { CoinFlipOverlay } from "../ui/components/hud/CoinFlipOverlay";
import { MatchResultsScreen } from "../ui/components/hud/MatchResultsScreen";
import { LoadingScreen } from "../ui/components/hud/LoadingScreen";
import { OnlineCoinFlip } from "../ui/pages/OnlineCoinFlip";
import { RefusalNotice } from "../ui/components/hud/RefusalNotice";
import { HalfTimeCard } from "../ui/components/hud/HalfTimeCard";
import { TurnCatchUpCard } from "../ui/components/hud/TurnCatchUpCard";
import { TurnClock } from "../ui/pages/TurnClock";
import { PAGE_VARIANTS } from "./pageVariants";
export interface Variant {
  id: string;
  section: string;
  title: string;
  /** Stage height in px (the stage is always 1280 wide). */
  height?: number;
  /** "page" drops the pitch backdrop, for the pages around the match. */
  stage?: "pitch" | "page";
  fixture?: FixtureOptions;
  /** Runs before the first render, e.g. to seed localStorage. */
  prepare?: () => void;
  view: (fx: MatchFixture) => React.ReactNode;
  /** Plays events into the mounted components. May return a cleanup. */
  drive?: (fx: MatchFixture) => void | (() => void);
}

const later = (ms: number, fn: () => void) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};
const every = (ms: number, fn: () => void) => {
  fn();
  const t = setInterval(fn, ms);
  return () => clearInterval(t);
};
const click = (selector: string, text?: string) => {
  const buttons = [...document.querySelectorAll<HTMLElement>(selector)];
  const target = text
    ? buttons.find((b) => b.textContent?.includes(text))
    : buttons[0];
  target?.click();
};

// ---------------------------------------------------------------- fixtures

const LONG = {
  team1Name: "The Altdorf Sorcerer-Kings of Middenheim",
  team2Name: "Grimgutz's Bone-Crunching Da Bashy Boyz",
};

function setScore(fx: MatchFixture, a: number, b: number, half2 = false) {
  const state = fx.services.gameService.getState();
  state.score[fx.team1.id] = a;
  state.score[fx.team2.id] = b;
  state.turn.isHalf2 = half2;
}

const score = (fx: MatchFixture) => (
  <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
    <ScoreBoard eventBus={fx.bus} />
    <TurnIndicator turnNumber={3} phase={GamePhase.PLAY} />
  </div>
);

const LOG_ROWS: [
  string,
  string,
  number | number[] | string[],
  string,
  "success" | "failure" | "none",
  1 | 2,
][] = [
  ["Dodge (Blitzer)", "1d6", 5, "Dodge (Blitzer): 5, needs 3+", "success", 1],
  ["Armour", "2d6", [3, 4], "Armour holds: 7 vs AV 9", "failure", 1],
  [
    "Rush (Thrower)",
    "1d6",
    1,
    "Rush (Thrower): 1, needs 2+. Fell over",
    "failure",
    2,
  ],
  [
    "Pick-up (Catcher)",
    "1d6",
    4,
    "Pick-up (Catcher): 4, needs 2+",
    "success",
    1,
  ],
  [
    "Block",
    "2D Block",
    ["push", "pow-dodge"],
    "Rolled 2 block dice: push, pow-dodge",
    "none",
    2,
  ],
  ["Injury", "2d6", [5, 4], "Injury: 9, Knocked Out", "success", 2],
  [
    "Pass (Thrower)",
    "1d6",
    6,
    "Pass (Thrower): 6, needs 4+. Accurate",
    "success",
    1,
  ],
  [
    "Catch (Catcher)",
    "1d6",
    2,
    "Catch (Catcher): 2, needs 3+. Dropped",
    "failure",
    1,
  ],
];

function fillLog(fx: MatchFixture, rounds: number) {
  fx.bus.emit(GameEventNames.UI_LogEntry, {
    category: "weather",
    headline: "Nice Weather",
    detail: "Perfect Blood Bowl weather.",
    roll: [3, 4],
  });
  fx.bus.emit(GameEventNames.UI_LogEntry, {
    category: "kickoff",
    headline: "Blitz!",
    detail: "The kicking team takes a free turn of Move actions.",
    roll: [5, 4],
  });
  for (let r = 0; r < rounds; r++) {
    for (const [
      rollType,
      diceType,
      value,
      description,
      resultState,
      team,
    ] of LOG_ROWS) {
      fx.bus.emit(GameEventNames.DiceRoll, {
        rollType,
        diceType,
        value,
        total: Array.isArray(value) ? 0 : Number(value),
        description,
        resultState,
        teamId: team === 1 ? fx.team1.id : fx.team2.id,
      });
    }
    fx.bus.emit(GameEventNames.SkillTriggered, {
      playerId: fx.player(2, 0).id,
      skill: "Mighty Blow",
      effect: "+1 to the Armour roll",
    });
    fx.bus.emit(GameEventNames.UI_Notification, "Select a Kicker first!");
  }
}

function blockAnalysis(
  diceCount: number,
  isUphill: boolean,
  a: number,
  d: number
) {
  return {
    diceCount,
    isUphill,
    attackerST: a,
    defenderST: d,
    attackerAssists: [],
    defenderAssists: [],
  };
}

const BLOCK_FACES = {
  skull: { type: "skull" as const, icon: "", label: "Attacker Down" },
  bothDown: { type: "both-down" as const, icon: "", label: "Both Down" },
  push: { type: "push" as const, icon: "", label: "Push" },
  dodge: { type: "pow-dodge" as const, icon: "", label: "POW!/Dodge" },
  pow: { type: "pow" as const, icon: "", label: "POW!" },
};

function openBlock(
  fx: MatchFixture,
  dice: number,
  uphill = false,
  st: [number, number] = [4, 3]
) {
  fx.bus.emit(GameEventNames.UI_BlockDialog, {
    attackerId: fx.player(2, 0).id,
    defenderId: fx.player(1, 0).id,
    analysis: blockAnalysis(dice, uphill, st[0], st[1]),
  });
}

function confirm(
  fx: MatchFixture,
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  risky: boolean
) {
  fx.bus.emit(GameEventNames.UI_RequestConfirmation, {
    actionId: "gallery",
    title,
    message,
    confirmLabel,
    cancelLabel,
    risky,
  });
}

function reroll(
  fx: MatchFixture,
  sources: ("skill" | "team" | "veteran")[],
  skill?: string
) {
  // The engine offers "team" only when a re-roll can be spent: give team 1
  // the turn and two to spend
  fx.team1.rerolls = 2;
  fx.services.gameService.getState().turn.teamId = fx.team1.id;
  fx.bus.emit(GameEventNames.DecisionRequested, {
    type: "reroll",
    playerId: fx.player(1, 4).id,
    chooserTeamId: fx.team1.id,
    rollKind: "dodge",
    sources,
    skill,
    roll: 1,
  });
}

function kickoffStep(fx: MatchFixture, step: Partial<KickoffEventStepState>) {
  const full = {
    event: KickoffEvent.ALERT_DEFENCE,
    teamId: fx.team1.id,
    selectionLimit: 3,
    selectedPlayerIds: [],
    movedPlayerIds: [],
    awaitingPlacement: [],
    ...step,
  } as KickoffEventStepState;
  fx.services.gameService.getKickoffEventStep = () => full;
}

// The online-only widgets take a live OnlineMatch and lobby; these stubs
// carry just the fields those widgets read.
function onlineMatch(
  fx: MatchFixture,
  overrides: Record<string, unknown> = {}
) {
  return {
    role: "guest",
    teams: { team1: fx.team1, team2: fx.team2 },
    myTeamId: fx.team1.id,
    opponentName: "Grimgutz",
    mayAct: () => true,
    decidingTeamId: () => null,
    pendingDecision: () => null,
    setClockPaused: () => {},
    coachName: () => "Grimgutz",
    run: async () => {},
    ...overrides,
  } as unknown as OnlineMatch;
}

const CHAT: ChatMessage[] = [
  { text: "Good luck, coach", senderName: "Grimgutz", fromSelf: false, ts: 1 },
  {
    text: "You too. Mind the Blitzer",
    senderName: "Joe",
    fromSelf: true,
    ts: 2,
  },
  { text: "Too late for that", senderName: "Grimgutz", fromSelf: false, ts: 3 },
];

/**
 * Makes an online match with chat the active one, so the dice log shows its
 * Dice and Chat tabs. `say` delivers a message from the other coach.
 */
function onlineChat(fx: MatchFixture, history: ChatMessage[]) {
  const listeners = new Set<(message: ChatMessage) => void>();
  setActiveOnlineMatch(
    onlineMatch(fx, {
      chatHistory: () => history,
      onChatMessage: (listener: (message: ChatMessage) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      sendChat: () => {},
    })
  );
  return (text: string) =>
    listeners.forEach((listener) =>
      listener({
        text,
        senderName: "Grimgutz",
        fromSelf: false,
        ts: Date.now(),
      })
    );
}

const diceLogIn = (fx: MatchFixture) => (
  <HUDLayout
    bottomLeft={
      <div className="h-[220px] w-full">
        <DiceLog eventBus={fx.bus} />
      </div>
    }
  />
);
const USER = {
  uid: "me",
  displayName: "Joe",
  email: null,
  photoURL: null,
} satisfies AuthUser;
function lobby(fx: MatchFixture, patch: Partial<LobbyDoc>): LobbyDoc {
  const { turn } = fx.services.gameService.getState();
  return {
    code: "BLOOD",
    hostUid: "them",
    guestUid: "me",
    status: "playing",
    settings: { turnSeconds: 120, progressionEnabled: false },
    players: {},
    createdAt: null,
    timer: {
      deadline: Date.now() + 94_000,
      turn: `${turn.teamId}:${turn.isHalf2 ? 2 : 1}:${turn.turnNumber}`,
      pausedBy: null,
      pausedAt: null,
      banks: { me: 120_000 },
    },
    ...patch,
  } as LobbyDoc;
}

const routed = (node: React.ReactNode) => <MemoryRouter>{node}</MemoryRouter>;

// ---------------------------------------------------------------- variants

export const VARIANTS: Variant[] = [
  // ---- Whole HUD
  {
    id: "hud-play",
    section: "Whole HUD",
    title: "In play, a player selected (sandbox)",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} mode="sandbox" />),
    drive: (fx) =>
      later(80, () => {
        setScore(fx, 1, 0);
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        });
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Block & Injury Test",
          seed: 10,
          expectedOutcome: "Defender will be stunned",
        });
        fillLog(fx, 1);
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player:
            fx.services.gameService.getPlayerById(fx.player(2, 0).id) ??
            fx.player(2, 0),
        });
      }),
  },
  {
    id: "hud-play-long-menu",
    section: "Whole HUD",
    title: "In play, a long action menu scrolls inside its corner",
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} mode="sandbox" />),
    drive: (fx) =>
      later(80, () => {
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        });
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Basic Scrimmage",
          seed: 1,
        });
        fillLog(fx, 1);
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player:
            fx.services.gameService.getPlayerById(fx.player(1, 0).id) ??
            fx.player(1, 0),
        });
      }),
  },
  {
    id: "hud-setup",
    section: "Whole HUD",
    title: "Setup",
    fixture: { phase: GamePhase.SETUP },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} />),
    drive: (fx) =>
      later(80, () => {
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SETUP,
          subPhase: SubPhase.SETUP_KICKING,
        });
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: fx.team1.name },
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 4,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions: [],
            canConfirm: false,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [
            { name: "Balanced", builtIn: true },
            { name: "Wedge", builtIn: true },
            { name: "My cage", builtIn: false },
          ],
        });
        fx.bus.emit(GameEventNames.UI_LogEntry, {
          category: "weather",
          headline: "Nice Weather",
          detail: "Perfect Blood Bowl weather.",
          roll: [3, 4],
        });
      }),
  },

  {
    id: "match-strip-effects",
    section: "Score bug and turn tab",
    title: "Weather, spent actions and drive effects",
    view: (fx) => (
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
        <ScoreBoard eventBus={fx.bus} />
        <MatchStrip eventBus={fx.bus}>
          <TurnIndicator turnNumber={5} phase={GamePhase.PLAY} />
        </MatchStrip>
      </div>
    ),
    drive: (fx) =>
      later(30, () => {
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
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },
  {
    id: "setup-checklist",
    section: "Setup panel",
    title: "Setup checklist with two players on the line",
    fixture: { phase: GamePhase.SETUP },
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const restrictions = new SetupValidator().validateFormation(
          [
            { playerId: fx.player(1, 0).id, x: 6, y: 3 },
            { playerId: fx.player(1, 1).id, x: 6, y: 5 },
            { playerId: fx.player(1, 2).id, x: 4, y: 0 },
          ],
          true,
          7
        ).restrictions;
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: fx.team1,
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 3,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions,
            canConfirm: false,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },

  // ---- Score bug
  {
    id: "score-typical",
    section: "Score bug and turn tab",
    title: "Typical: home side active",
    height: 140,
    view: score,
    prepare: () => {},
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 1, 0);
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "score-long",
    section: "Score bug and turn tab",
    title: "Long team names, second half",
    height: 140,
    fixture: LONG,
    view: score,
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 2, 3, true);
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "score-colours",
    section: "Score bug and turn tab",
    title: "Other team colours: white and yellow, away side active",
    height: 140,
    fixture: {
      team1Color: 0xf2f2f2,
      team2Color: 0xf4c430,
      team1Name: "Elfheim Eagles",
      team2Name: "Sunfire Halflings",
      team1Roster: RosterName.ELVEN_UNION,
      team2Roster: RosterName.HALFLING,
    },
    view: score,
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 0, 0);
        fx.services.gameService.getState().activeTeamId = fx.team2.id;
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "turn-tab",
    section: "Score bug and turn tab",
    title: "Turn tab: turn, setup, kickoff",
    height: 120,
    view: () => (
      <div className="flex h-full items-center justify-center gap-16">
        <TurnIndicator turnNumber={4} phase={GamePhase.PLAY} />
        <TurnIndicator turnNumber={1} phase={GamePhase.SETUP} />
        <TurnIndicator turnNumber={1} phase={GamePhase.KICKOFF} />
      </div>
    ),
  },

  // ---- Player card
  {
    id: "card-selected",
    section: "Player card",
    title: "Selected player",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const p = fx.player(1, 4);
        p.spp = 8;
        p.status = PlayerStatus.ACTIVE;
        fx.bus.emit(GameEventNames.PlayerSelected, { player: p });
      }),
  },
  {
    id: "card-compare",
    section: "Player card",
    title: "Selected, comparing a hovered opponent",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.player(1, 4).status = PlayerStatus.ACTIVE;
        fx.player(2, 5).status = PlayerStatus.ACTIVE;
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 4) });
        fx.bus.emit(GameEventNames.UI_ShowPlayerInfo, fx.player(2, 5));
      }),
  },
  {
    id: "card-injured",
    section: "Player card",
    title: "Long name, stunned, with a condition and injuries",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const p = fx.player(2, 0);
        p.playerName = "Grimgutz Skullsplitta the Unwashed";
        p.status = PlayerStatus.STUNNED;
        p.injuries = [InjuryType.NIGGLING_INJURY];
        p.conditions = [{ type: PlayerCondition.DISTRACTED }];
        fx.bus.emit(GameEventNames.PlayerSelected, { player: p });
      }),
  },
  {
    id: "card-crew",
    section: "Player card",
    title: "Sideline crew",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_ShowInfo, {
          kind: "sidelineCrew",
          crew: getSidelineCrewInfo("coach", fx.team1),
        })
      ),
  },

  // ---- Action menu
  {
    id: "menu-block",
    section: "Action menu and sequence",
    title: "Next to an opponent: move, block, blitz",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <>
            <PlayerActionMenu
              eventBus={fx.bus}
              turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team2.id }}
            />
            <EndTurnButton
              phase={GamePhase.PLAY}
              activeTeamId={fx.team2.id}
              onClick={() => {}}
            />
          </>
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(2, 0).id)!,
        })
      ),
  },
  {
    id: "other-coach-prompt",
    section: "Action menu and sequence",
    title: "Waiting coach: the other coach's Rush prompt, read-only",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <div data-testid="decision-dock" className="w-full">
            <OtherCoachPrompt eventBus={fx.bus} />
          </div>
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.RemotePromptChanged, {
          playerId: fx.player(2, 0).id,
          rolls: [{ type: "rush", target: 2 }],
          chance: 5 / 6,
        })
      ),
  },
  {
    id: "menu-special",
    section: "Action menu and sequence",
    title: "A special action (Chainsaw)",
    fixture: { scenario: "chainsaw-loony" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <PlayerActionMenu
            eventBus={fx.bus}
            turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team1.id }}
          />
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(1, 4).id)!,
        })
      ),
  },
  {
    id: "menu-sequence",
    section: "Action menu and sequence",
    title: "Action sequence: Move, then Pass",
    fixture: { scenario: "throw-pickup-and-pass" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <>
            <PlayerActionMenu
              eventBus={fx.bus}
              turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team1.id }}
            />
            <EndTurnButton
              phase={GamePhase.PLAY}
              activeTeamId={fx.team1.id}
              onClick={() => {}}
            />
          </>
        }
      />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 0) });
        fx.bus.emit(GameEventNames.UI_UpdateActionSteps, {
          currentStepId: "pass",
          steps: [
            { id: "move", label: "Move" },
            { id: "pass", label: "Pass" },
          ],
        });
      }),
  },

  // ---- Dice log
  {
    id: "log-empty",
    section: "Dice log",
    title: "Empty",
    view: (fx) => (
      <HUDLayout
        bottomLeft={
          <div className="h-[220px] w-full">
            <DiceLog eventBus={fx.bus} />
          </div>
        }
      />
    ),
  },
  {
    id: "log-long",
    section: "Dice log",
    title: "A long log (newest on top)",
    view: (fx) => (
      <HUDLayout
        bottomLeft={
          <div className="h-[220px] w-full">
            <DiceLog eventBus={fx.bus} />
          </div>
        }
      />
    ),
    drive: (fx) => later(30, () => fillLog(fx, 3)),
  },
  {
    id: "log-large",
    section: "Dice log",
    title: "Text at 150%",
    prepare: () => localStorage.setItem("bb-dice-log-font-scale", "1.5"),
    view: (fx) => (
      <HUDLayout
        bottomLeft={
          <div className="h-[220px] w-full">
            <DiceLog eventBus={fx.bus} />
          </div>
        }
      />
    ),
    drive: (fx) => later(30, () => fillLog(fx, 1)),
  },

  {
    id: "log-online-dice",
    section: "Dice log",
    title: "Online: the Dice tab",
    view: (fx) => {
      onlineChat(fx, CHAT);
      return diceLogIn(fx);
    },
    drive: (fx) => later(30, () => fillLog(fx, 1)),
  },
  {
    id: "log-online-unread",
    section: "Dice log",
    title: "Online: two unread messages on the Chat tab",
    view: (fx) => {
      const say = onlineChat(fx, CHAT);
      later(60, () => {
        say("Nice dodge");
        say("Shame about the armour");
      });
      return diceLogIn(fx);
    },
    drive: (fx) => later(30, () => fillLog(fx, 1)),
  },
  {
    id: "log-online-chat",
    section: "Dice log",
    title: "Online: the Chat tab",
    view: (fx) => {
      onlineChat(fx, CHAT);
      return diceLogIn(fx);
    },
    drive: () =>
      later(60, () => click('[data-testid="dice-log"] [role="tab"]', "Chat")),
  },

  // ---- Left column cards
  {
    id: "catch-up-card",
    section: "Left column cards",
    title: "Online: since your last turn, above the dice log",
    fixture: { scenario: "block-injury-test", phase: GamePhase.PLAY },
    view: (fx) => {
      onlineChat(fx, []);
      return (
        <HUDLayout
          bottomLeft={
            <>
              <TurnCatchUpCard eventBus={fx.bus} />
              <div className="h-[220px] w-full">
                <DiceLog eventBus={fx.bus} />
              </div>
            </>
          }
        />
      );
    },
    drive: (fx) =>
      later(60, () => {
        const state = fx.services.gameService.getState();
        state.activeTeamId = fx.team2.id;
        const hurt = fx.player(1, 0);
        hurt.status = PlayerStatus.STUNNED;
        fx.bus.emit(GameEventNames.PlayerKnockedDown, { playerId: hurt.id });
        fx.bus.emit(GameEventNames.BallScattered, {
          from: { x: 10, y: 4 },
          to: { x: 11, y: 4 },
          reason: "bounce",
        });
        fx.bus.emit(GameEventNames.TurnStarted, {
          teamId: fx.team1.id,
          turnNumber: 4,
        });
      }),
  },
  {
    id: "half-time-card",
    section: "Left column cards",
    title: "Half time, with KO recovery rolls in",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => (
      <HUDLayout
        bottomLeft={
          <>
            <HalfTimeCard eventBus={fx.bus} />
            <div className="h-[220px] w-full">
              <DiceLog eventBus={fx.bus} />
            </div>
          </>
        }
      />
    ),
    drive: (fx) =>
      later(60, () => {
        setScore(fx, 1, 0);
        fx.player(2, 0).status = PlayerStatus.KO;
        fx.bus.emit(GameEventNames.DriveEnded, {
          reason: "halftime",
          nextKickingTeamId: fx.team2.id,
        });
        fx.bus.emit(GameEventNames.KORecoveryRolled, {
          playerId: fx.player(2, 0).id,
          roll: 5,
          recovered: true,
        });
      }),
  },

  // ---- Dice tray
  {
    id: "tray-d6",
    section: "Dice tray",
    title: "A D6 roll (live 3D dice, needs WebGL)",
    view: (fx) => <DiceTray eventBus={fx.bus} />,
    drive: (fx) =>
      every(4000, () =>
        fx.bus.emit(GameEventNames.DiceRoll, {
          rollType: "Dodge (Blitzer)",
          diceType: "1d6",
          value: 5,
          total: 5,
          description: "Dodge (Blitzer): 5, needs 3+",
          resultState: "success",
          teamId: fx.team1.id,
        })
      ),
  },
  {
    id: "tray-block",
    section: "Dice tray",
    title: "Two block dice held for a choice",
    view: (fx) => <DiceTray eventBus={fx.bus} />,
    drive: (fx) =>
      later(60, () =>
        fx.bus.emit(GameEventNames.BlockDiceRolled, {
          attackerId: fx.player(2, 0).id,
          defenderId: fx.player(1, 0).id,
          numDice: 2,
          isAttackerChoice: true,
          results: [BLOCK_FACES.push, BLOCK_FACES.dodge],
        })
      ),
  },

  // ---- Confirmations
  {
    id: "confirm-dodge",
    section: "Decision dialogs",
    title: "Dodge, no re-roll (risky)",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Blitzer: Dodge",
          "Dodge: 3+. A fall is a turnover.\nNo re-roll available.",
          "Dodge!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-rush",
    section: "Decision dialogs",
    title: "Rush with a team re-roll",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Blitzer: Rush",
          "Rush: 2+. A fall is a turnover.\nTeam re-roll available.",
          "Rush!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-both",
    section: "Decision dialogs",
    title: "Rush and Dodge in one step",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Human Blitzer #5: Rush & Dodge",
          "Rush: 2+, then Dodge: 4+. A fall on either is a turnover.\nNo re-roll available.",
          "Rush & Dodge!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-safe",
    section: "Decision dialogs",
    title: "A plain confirmation (not risky)",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "End your turn?",
          "Two players have not acted yet.",
          "End Turn",
          "Keep playing",
          false
        )
      ),
  },
  {
    id: "block-1",
    section: "Decision dialogs",
    title: "Block: 1 die",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 1, false, [3, 3])),
  },
  {
    id: "block-2",
    section: "Decision dialogs",
    title: "Block: 2 dice",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 2, false, [4, 3])),
  },
  {
    id: "block-3-uphill",
    section: "Decision dialogs",
    title: "Block: 3 dice uphill, defender chooses",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 3, true, [2, 6])),
  },
  {
    id: "block-defender",
    section: "Decision dialogs",
    title: "Block seen by the defending coach online",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () => {
        // This coach owns the defender, player 1 of team 1
        setActiveOnlineMatch(onlineMatch(fx, { myTeamId: fx.team1.id }));
        fx.player(1, 0).skills.push(getSkill(SkillType.BLOCK));
        openBlock(fx, 2, true, [3, 4]);
      }),
  },
  {
    id: "block-rolled",
    section: "Decision dialogs",
    title: "Block rolled, re-rolls offered",
    view: (fx) => (
      <>
        <BlockDiceDialog eventBus={fx.bus} />
        <DiceTray eventBus={fx.bus} />
      </>
    ),
    drive: (fx) =>
      later(30, () => {
        openBlock(fx, 2, false, [4, 3]);
        // The engine sends the full BlockRollData, re-roll offers included
        const rolled: BlockRollData = {
          attackerId: fx.player(2, 0).id,
          defenderId: fx.player(1, 0).id,
          numDice: 2,
          isAttackerChoice: true,
          results: [BLOCK_FACES.bothDown, BLOCK_FACES.skull],
          teamRerollAvailable: true,
          proAvailable: true,
          brawlerAvailable: true,
        };
        setTimeout(
          () => fx.bus.emit(GameEventNames.BlockDiceRolled, rolled),
          50
        );
      }),
  },
  {
    id: "reroll-both",
    section: "Decision dialogs",
    title: "Re-roll: skill or team",
    view: (fx) => <RerollDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => reroll(fx, ["skill", "team"], "Dodge")),
  },
  {
    id: "reroll-team",
    section: "Decision dialogs",
    title: "Re-roll: veteran, with no team re-rolls left",
    view: (fx) => <RerollDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => reroll(fx, ["veteran"])),
  },
  {
    id: "follow-up",
    section: "Decision dialogs",
    title: "Follow up",
    view: (fx) => <FollowUpDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_FollowUpPrompt, {
          attackerId: fx.player(2, 0).id,
          targetSquare: { x: 10, y: 7 },
        })
      ),
  },
  {
    id: "reaction",
    section: "Decision dialogs",
    title: "A reactive skill (Stand Firm)",
    view: (fx) => <ReactionDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "reaction",
          playerId: fx.player(1, 0).id,
          chooserTeamId: fx.team1.id,
          skill: "Stand Firm",
          prompt: "Use Stand Firm to refuse the push and stay in place?",
        })
      ),
  },
  {
    id: "interception",
    section: "Decision dialogs",
    title: "Interception: pick a player",
    view: (fx) => <InterceptionDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "interception",
          chooserTeamId: fx.team2.id,
          passerId: fx.player(1, 0).id,
          candidates: [
            { playerId: "a", playerName: "Orc Blitzer #5", modifier: -2 },
            { playerId: "b", playerName: "Orc Lineman #2", modifier: -3 },
          ],
        })
      ),
  },
  {
    id: "apothecary",
    section: "Decision dialogs",
    title: "Apothecary after a casualty",
    view: (fx) => <ApothecaryDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "apothecary",
          id: "x",
          chooserTeamId: fx.team1.id,
          playerId: fx.player(1, 4).id,
          resultKind: "casualty",
          casualtyType: "seriously-hurt",
        })
      ),
  },
  {
    id: "inducement-choice",
    section: "Decision dialogs",
    title: "Inducement choice: Intensive Training",
    view: (fx) => <InducementChoiceDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "inducement-choice",
          kind: "intensive-training",
          chooserTeamId: fx.team1.id,
          playerIds: [fx.player(1, 4).id, fx.player(1, 5).id],
          skills: ["Block", "Dodge", "Sure Hands"],
          optional: true,
        })
      ),
  },
  {
    id: "inducement-panel",
    section: "Decision dialogs",
    title: "Pre-match inducements",
    view: () => <InducementSelectionPanel onDone={() => {}} />,
  },

  // ---- Setup
  {
    id: "setup-incomplete",
    section: "Setup panel",
    title: "Placing players",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: fx.team1.name },
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 4,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions: [],
            canConfirm: false,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [
            { name: "Balanced", builtIn: true },
            { name: "My cage", builtIn: false },
          ],
        });
      }),
  },
  {
    id: "setup-ready",
    section: "Setup panel",
    title: "Ready to confirm, offense",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_RECEIVING,
          activeTeam: { id: fx.team2.id, name: fx.team2.name },
          status: {
            teamId: fx.team2.id,
            placedPlayerCount: 7,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions: [],
            canConfirm: true,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },
  {
    id: "setup-short",
    section: "Setup panel",
    title: "Short-handed: concede or play on",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: LONG.team1Name },
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 0,
            requiredPlayerCount: 4,
            availablePlayerCount: 4,
            restrictions: [],
            canConfirm: false,
            concessionDecision: "pending",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },

  // ---- Kickoff
  {
    id: "kickoff-blitz",
    section: "Kickoff step",
    title: "Alert Defence: choosing players",
    view: (fx) => (
      <HUDLayout topRight={<KickoffEventOverlay eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(20, () => {
        kickoffStep(fx, {
          event: KickoffEvent.ALERT_DEFENCE,
          selectedPlayerIds: [fx.player(1, 0).id],
        });
        fx.bus.emit(GameEventNames.KickoffEventStepStarted, {
          event: KickoffEvent.ALERT_DEFENCE,
          teamId: fx.team1.id,
          selectionLimit: 3,
        });
      }),
  },
  {
    id: "kickoff-highkick",
    section: "Kickoff step",
    title: "High Kick",
    view: (fx) => (
      <HUDLayout topRight={<KickoffEventOverlay eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(20, () => {
        kickoffStep(fx, {
          event: KickoffEvent.HIGH_KICK,
          selectionLimit: 1,
          landingSquare: { x: 15, y: 5 },
        });
        fx.bus.emit(GameEventNames.KickoffEventStepStarted, {
          event: KickoffEvent.HIGH_KICK,
          teamId: fx.team1.id,
          selectionLimit: 1,
        });
      }),
  },

  // ---- Match options
  {
    id: "options-closed",
    section: "Match options",
    title: "Closed",
    height: 120,
    view: () => (
      <HUDLayout
        topRight={
          <MatchOptionsMenu
            entries={computeMatchOptionsMenu({
              kind: "local",
              matchOver: false,
            })}
            onSelect={() => {}}
          />
        }
      />
    ),
  },
  {
    id: "options-open",
    section: "Match options",
    title: "Open, local match, with sound settings",
    view: () => (
      <div className="absolute right-4 top-4">
        <MatchOptionsMenu
          entries={[
            ...computeMatchOptionsMenu({ kind: "local", matchOver: false }),
            {
              type: "panel",
              id: "sound-settings",
              render: () => <SoundToggle />,
            },
          ]}
          onSelect={() => {}}
        />
      </div>
    ),
    drive: () => later(60, () => click('[aria-haspopup="menu"]')),
  },
  {
    id: "options-confirm",
    section: "Match options",
    title: "Online guest, confirming a destructive action",
    view: () => (
      <div className="absolute right-4 top-4">
        <MatchOptionsMenu
          entries={computeMatchOptionsMenu({
            kind: "online",
            role: "guest",
            opponentName: "Grimgutz",
            connection: "abandonable",
            endRequest: "none",
          })}
          onSelect={() => {}}
        />
      </div>
    ),
    drive: () =>
      later(60, () => {
        click('[aria-haspopup="menu"]');
        setTimeout(() => {
          const items = [
            ...document.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not([disabled])'
            ),
          ];
          items
            .find((b) => /abandon|end match/i.test(b.textContent ?? ""))
            ?.click() ?? items.at(-1)?.click();
        }, 120);
      }),
  },

  // ---- Banners
  {
    id: "announce-turn",
    section: "Announcements",
    title: "Turn started (replays every 3s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(3000, () =>
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Turn 3",
          subtitle: "Reikland Reavers",
        })
      ),
  },
  {
    id: "announce-time-up",
    section: "Announcements",
    title: "Time up, then the next turn (replays every 6s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(6000, () => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "time-up",
          headline: "Time up",
          subtitle: "Reikland Reavers' turn ended",
        });
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Gouged Eye's Turn",
          subtitle: "Turn 3",
        });
      }),
  },
  {
    id: "waiting-touchdown",
    section: "Announcements",
    title: "Touchdown on the waiting coach's screen (replays every 4s)",
    view: (fx) => (
      <>
        <WaitingBanner
          match={{
            mayAct: () => false,
            waitingLabel: () => "Grimgutz's turn (Gouged Eye)…",
          }}
          eventBus={fx.bus}
        />
        <Announcer eventBus={fx.bus} />
      </>
    ),
    drive: (fx) =>
      every(4000, () =>
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "touchdown",
          headline: "Touchdown!",
          subtitle: "Gouged Eye score. Reikland Reavers 0 - 1 Gouged Eye",
        })
      ),
  },
  {
    id: "announce-half",
    section: "Announcements",
    title: "Halftime (replays every 3s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(3000, () =>
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "halftime",
          headline: "Halftime",
          subtitle: "Reikland Reavers 1 - 0 Gouged Eye",
        })
      ),
  },
  {
    id: "turnover",
    section: "Announcements",
    title: "Turnover (replays every 3.5s)",
    view: (fx) => <TurnoverOverlay eventBus={fx.bus} />,
    drive: (fx) =>
      every(3500, () =>
        fx.bus.emit(
          "ui:turnover" as never,
          { teamId: fx.team1.id, reason: "Failed Dodge" } as never
        )
      ),
  },

  // ---- Coin toss
  {
    id: "coin-start",
    section: "Coin toss",
    title: "Local: before the flip",
    view: (fx) => <CoinFlipOverlay eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_StartCoinFlip, {
          team1: fx.team1,
          team2: fx.team2,
        })
      ),
  },
  {
    id: "coin-result",
    section: "Coin toss",
    title: "Local: the winner chooses",
    view: (fx) => <CoinFlipOverlay eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_StartCoinFlip, {
          team1: fx.team1,
          team2: fx.team2,
        });
        setTimeout(() => click("button", "FLIP COIN"), 80);
      }),
  },
  {
    id: "coin-online-wait",
    section: "Coin toss",
    title: "Online: waiting for the other coach",
    view: (fx) => (
      <OnlineCoinFlip
        code="BLOOD"
        lobby={lobby(fx, { coinFlip: { guestReady: true } })}
        match={onlineMatch(fx)}
        eventBus={fx.bus}
      />
    ),
  },
  {
    id: "coin-online-won",
    section: "Coin toss",
    title: "Online: you won the toss",
    view: (fx) => (
      <OnlineCoinFlip
        code="BLOOD"
        lobby={lobby(fx, {
          coinFlip: {
            guestReady: true,
            hostReady: true,
            winnerTeamId: fx.team1.id,
          },
        })}
        match={onlineMatch(fx)}
        eventBus={fx.bus}
      />
    ),
  },

  // ---- Turn clock
  {
    id: "clock-running",
    section: "Online turn clock",
    title: "Running, with a timeout to spend",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <TurnClock
          code="BLOOD"
          lobby={lobby(fx, {})}
          match={onlineMatch(fx, {
            myTeamId: fx.services.gameService.getActiveTeamId(),
          })}
          eventBus={fx.bus}
          user={USER}
        />
      </>
    ),
  },
  {
    id: "connection-offline",
    section: "Online turn clock",
    title: "This coach is offline",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner opponentName="Grimgutz" connection="offline" />
      </>
    ),
  },
  {
    id: "connection-reconnecting",
    section: "Online turn clock",
    title: "The other coach dropped, a long name",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner
          opponentName="Grimgutz the Unwashed"
          connection="reconnecting"
        />
      </>
    ),
  },
  {
    id: "connection-abandonable",
    section: "Online turn clock",
    title: "The other coach has been gone long enough to end the match",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner opponentName="Grimgutz" connection="abandonable" />
      </>
    ),
  },
  {
    id: "waiting-banner",
    section: "Online turn clock",
    title: "Waiting on the other coach's decision",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <WaitingBanner
          match={{
            mayAct: () => false,
            waitingLabel: () =>
              "Grimgutz is choosing a block die (Gouged Eye Blitzer)…",
          }}
          eventBus={fx.bus}
        />
      </>
    ),
  },
  {
    id: "refusal-notice",
    section: "Online turn clock",
    title: "A click that landed after the turn ended",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <RefusalNotice eventBus={fx.bus} />
      </>
    ),
    drive: (fx) =>
      later(60, () =>
        fx.bus.emit(GameEventNames.NetworkCommandRejected, {
          commandType: "move",
          reason: "not-your-turn",
        })
      ),
  },
  {
    id: "clock-low",
    section: "Online turn clock",
    title: "Under fifteen seconds",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.deadline = Date.now() + 11_000;
      return (
        <>
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
            <ScoreBoard eventBus={fx.bus} />
            <MatchStrip eventBus={fx.bus}>
              <TurnIndicator
                turnNumber={fx.services.gameService.getState().turn.turnNumber}
                phase={GamePhase.PLAY}
              />
            </MatchStrip>
          </div>
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx)}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },
  {
    id: "clock-deciding",
    section: "Online turn clock",
    title: "Stopped while the other coach decides",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const active = fx.services.gameService.getActiveTeamId();
      const other = active === fx.team1.id ? fx.team2.id : fx.team1.id;
      return (
        <>
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
            <ScoreBoard eventBus={fx.bus} />
            <MatchStrip eventBus={fx.bus}>
              <TurnIndicator
                turnNumber={fx.services.gameService.getState().turn.turnNumber}
                phase={GamePhase.PLAY}
              />
            </MatchStrip>
          </div>
          <TurnClock
            code="BLOOD"
            lobby={lobby(fx, {})}
            match={onlineMatch(fx, {
              decidingTeamId: () => other,
              pendingDecision: () => ({ type: "block-dice" }),
            })}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },
  {
    id: "clock-paused",
    section: "Online turn clock",
    title: "Paused by you",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.pausedBy = "me";
      l.timer!.pausedAt = Date.now() - 5_000;
      return (
        <>
          {score(fx)}
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx)}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },

  {
    id: "clock-strip-crowded",
    section: "Online turn clock",
    title: "Blizzard, a full timeout bank and the last fifteen seconds",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.deadline = Date.now() + 15_000;
      l.timer!.banks = { me: 300_000 };
      return (
        <>
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
            <ScoreBoard eventBus={fx.bus} />
            <MatchStrip eventBus={fx.bus}>
              <TurnIndicator
                turnNumber={fx.services.gameService.getState().turn.turnNumber}
                phase={GamePhase.PLAY}
              />
            </MatchStrip>
          </div>
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx, {
              myTeamId: fx.services.gameService.getActiveTeamId(),
            })}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
    drive: (fx) =>
      later(30, () => {
        const state = fx.services.gameService.getState();
        state.weather = "Blizzard";
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },
  {
    id: "clock-strip-away",
    section: "Online turn clock",
    title: "Stopped while the other coach reconnects",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.banks = { me: 300_000 };
      return (
        <>
          <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
            <ScoreBoard eventBus={fx.bus} />
            <MatchStrip eventBus={fx.bus}>
              <TurnIndicator
                turnNumber={fx.services.gameService.getState().turn.turnNumber}
                phase={GamePhase.PLAY}
              />
            </MatchStrip>
          </div>
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx, { opponentName: "Grimgutz the Unwashed" })}
            eventBus={fx.bus}
            user={USER}
            opponentAway
          />
        </>
      );
    },
    drive: (fx) =>
      later(30, () => {
        const state = fx.services.gameService.getState();
        state.weather = "Pouring Rain";
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },

  // ---- Sandbox
  {
    id: "sandbox",
    section: "Sandbox explorer",
    title: "Core scenario loaded, with its seed",
    view: (fx) => <HUDLayout topRight={<SandboxOverlay eventBus={fx.bus} />} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Block & Injury Test",
          seed: 10,
          expectedOutcome: "Defender will be stunned",
        })
      ),
  },

  // ---- Full screens
  {
    id: "results",
    section: "Full-screen moments",
    title: "Full time, no progression",
    fixture: { phase: GamePhase.GAME_OVER },
    view: () => routed(<MatchResultsScreen visible />),
    prepare: () => {},
    drive: (fx) => later(10, () => setScore(fx, 2, 1, true)),
  },
  {
    id: "results-progression",
    section: "Full-screen moments",
    title: "Full time, MVP and SPP to confirm",
    fixture: { phase: GamePhase.GAME_OVER, progression: true },
    view: (fx) => {
      setScore(fx, 1, 1, true);
      return routed(<MatchResultsScreen visible />);
    },
  },
  {
    id: "loading",
    section: "Full-screen moments",
    title: "Loading the stadium",
    view: (fx) => (
      <LoadingScreen
        eventBus={fx.bus}
        teams={{ team1: fx.team1, team2: fx.team2 }}
        styleId="bloodbowl"
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_LoadProgress, { progress: 0.62 })
      ),
  },

  ...PAGE_VARIANTS,
];

export const SECTIONS = [...new Set(VARIANTS.map((v) => v.section))];
