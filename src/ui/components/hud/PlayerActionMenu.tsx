import { useHeldOnline } from "../../hooks/useHeldOnline";
import { holdsMeasure } from "../../../game/inducements/matchInducements";
import { DesperateMeasure } from "../../../game/inducements/desperateMeasures";
import React, { useRef, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Player, PlayerStatus } from "../../../types/Player";
import { GamePhase, GameState } from "../../../types/GameState";
import { ActionType, GameEventNames } from "../../../types/events";
import {
  computeActionAvailability,
  ActionAvailability,
  TurnFlags,
} from "../../../game/rules/actionAvailability";
import { ActionStepper } from "./ActionStepper";
import type { KickoffEventStepState } from "../../../game/kickoff/KickoffEventManager";
import { Hotkey, useHotkey } from "../../hotkeys";
import {
  Chip,
  HudTone,
  KeyBadge,
  Panel,
  PanelHeader,
  toneBar,
} from "../componentWarehouse/HudKit";

/** The menu's colour names, mapped onto the HUD's tones. */
const ACTION_TONES: Record<string, HudTone> = {
  red: "bad",
  yellow: "gold",
  purple: "skill",
  blue: "info",
  green: "good",
  orange: "warn",
  gray: "neutral",
};
import {
  BlockReplacement,
  BLOCK_REPLACEMENT_DEFINITIONS,
} from "../../../types/BlockReplacement";

interface PlayerActionMenuProps {
  eventBus: EventBus;
  // Shape lives in GameHUD (TurnData); kept loose here to avoid a cycle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  turnData: any;
  /** A narrow thumb rail of buttons, as on a phone: no header, no hints. */
  compact?: boolean;
}

const EMPTY_AVAILABILITY: ActionAvailability = {
  move: false,
  block: false,
  multipleBlock: false,
  jump: false,
  blitz: false,
  pass: false,
  punt: false,
  handoff: false,
  foul: false,
  standUp: false,
  secureBall: false,
  stab: false,
  breatheFire: false,
  vomit: false,
  gaze: false,
  chomp: false,
  chainsaw: false,
  throwTeammate: false,
  kickTeammate: false,
  throwBomb: false,
  ballAndChain: false,
  directBlockReplacements: [],
  blitzBlockReplacements: [],
};

export const PlayerActionMenu: React.FC<PlayerActionMenuProps> = ({
  eventBus,
  turnData,
  compact = false,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Stepper State
  const [actionSteps, setActionSteps] = useState<
    { id: string; label: string }[]
  >([]);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [hasMovedInAction, setHasMovedInAction] = useState(false);
  // Razzle-Dazzle (L22) switched on for the Action about to be declared
  const [razzleOn, setRazzleOn] = useState(false);
  // Bumped by board-changing events so the contextual menu re-evaluates.
  const [refreshTick, setRefreshTick] = useState(0);
  // Online, the panel goes while this coach cannot send a command (the
  // other coach dropped, or the clock is paused); the banner says why.
  const held = useHeldOnline();

  // Listen for player selection
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    // Only reset action mode if selecting a different player or deselecting
    // AND if the new player is NOT the same as the current one
    if (data.player && data.player.id === selectedPlayer?.id) {
      // Re-selection of same player - do NOT reset stepper. Still read the
      // game again: Charge! re-selects the charger the coach just picked,
      // and only then may that player act.
      setRefreshTick((t) => t + 1);
      return;
    }

    if (data.player?.id !== selectedPlayer?.id) {
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
      setRazzleOn(false);
    }
    setSelectedPlayer(data.player);
  });

  // Listen for action steps update (New Stepper Model)
  useEventBus(eventBus, GameEventNames.UI_UpdateActionSteps, (data) => {
    if (data.steps && data.steps.length > 0) {
      setActionSteps(data.steps);
      setCurrentStepId(data.currentStepId);
    } else {
      setActionSteps([]);
      setCurrentStepId(null);
      setHasMovedInAction(false);
    }
  });

  // Determine initial movement state on selection
  React.useEffect(() => {
    if (selectedPlayer && turnData) {
      // The engine's own count: a Ball & Chain square or a Blitz block
      // spends movement that this copy of the turn never hears about
      const movementUsed = ServiceContainer.isInitialized()
        ? ServiceContainer.getInstance().gameService.getMovementUsed(
            selectedPlayer.id
          )
        : turnData.movementUsed instanceof Map
          ? turnData.movementUsed.get(selectedPlayer.id)
          : turnData.movementUsed?.[selectedPlayer.id] || 0;

      if (movementUsed > 0 && !selectedPlayer.hasActed) {
        setHasMovedInAction(true);
      } else {
        setHasMovedInAction(false);
      }
    }
  }, [selectedPlayer, turnData]);

  useEventBus(eventBus, GameEventNames.PlayerMovedInAction, (data) => {
    if (selectedPlayer && data.playerId === selectedPlayer.id) {
      setHasMovedInAction(true);
    }
  });

  // Board changes that affect which actions are contextually valid.
  const bump = () => setRefreshTick((t) => t + 1);
  useEventBus(eventBus, GameEventNames.PlayerMoved, bump);
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, bump);
  useEventBus(eventBus, GameEventNames.PlayerKnockedDown, bump);
  useEventBus(eventBus, GameEventNames.BallPlaced, bump);

  // A turnover ends the turn, so the panel goes with the turnover banner
  // rather than waiting under it for the next turn to start.
  const close = () => {
    setSelectedPlayer(null);
    setActionSteps([]);
    setCurrentStepId(null);
  };
  useEventBus(eventBus, GameEventNames.TurnStarted, close);
  useEventBus(eventBus, GameEventNames.Turnover, close);

  const { activeCharge, effectiveActiveTeamId } = actingSide(turnData);
  const { declaration, secondActionAfter, canRazzle } = razzleDazzle(
    selectedPlayer,
    !!activeCharge
  );

  // Contextual availability: recomputed from live game state whenever the
  // selection, the turn flags, movement, or the board changes.
  const availability: ActionAvailability = React.useMemo(() => {
    if (!selectedPlayer || selectedPlayer.teamId !== effectiveActiveTeamId) {
      return EMPTY_AVAILABILITY;
    }
    try {
      if (!ServiceContainer.isInitialized()) return EMPTY_AVAILABILITY;
      const gs = ServiceContainer.getInstance().gameService;
      const live = gs.getPlayerById(selectedPlayer.id) ?? selectedPlayer;
      const normal = computeActionAvailability({
        player: live,
        ballPosition: gs.getState().ballPosition ?? null,
        opponents: gs.getOpponents(selectedPlayer.teamId),
        teammates: gs.getTeammates(selectedPlayer.id),
        reachable: gs.getAvailableMovements(selectedPlayer.id),
        turn: menuTurnFlags(
          turnData,
          activeCharge,
          gs.getState(),
          selectedPlayer.teamId
        ),
        hasMovedInAction,
        secondActionAfter,
      });
      if (!activeCharge || activeCharge.charge?.activePlayerId !== live.id) {
        return normal;
      }
      const budget = activeCharge.charge.budget;
      return {
        ...EMPTY_AVAILABILITY,
        move: live.status === PlayerStatus.ACTIVE,
        blitz: budget.blitz > 0 && normal.blitz,
        throwTeammate: budget.throwTeammate > 0 && normal.throwTeammate,
        kickTeammate: budget.kickTeammate > 0 && normal.kickTeammate,
      };
    } catch {
      return EMPTY_AVAILABILITY;
    }
  }, [
    selectedPlayer,
    turnData,
    hasMovedInAction,
    refreshTick,
    effectiveActiveTeamId,
    activeCharge,
    secondActionAfter,
  ]);

  if (!selectedPlayer || held) return null;

  // The kicker and ordinary kickoff selections do not get an action menu.
  // Charge! is the exception: it deliberately reuses this normal window.
  if (turnData?.phase === GamePhase.KICKOFF && !activeCharge) return null;

  // Only show menu for active team's players
  if (selectedPlayer.teamId !== effectiveActiveTeamId) return null;

  const handleAction = (
    action: ActionType,
    blockReplacement?: BlockReplacement
  ) => {
    if (selectedPlayer) {
      eventBus.emit(GameEventNames.UI_ActionSelected, {
        action,
        playerId: selectedPlayer.id,
        blockReplacement,
        ...(razzleOn && canRazzle && action !== "forgoe"
          ? { razzleDazzle: true }
          : {}),
      });
    }
  };

  // Render Helper with proper color handling
  const ActionButton: React.FC<ActionButtonProps> = ({
    action,
    label,
    sub,
    disabled,
    color = "blue",
    onClick,
    blockReplacement,
    hotkey,
  }) => {
    const tone = ACTION_TONES[color] ?? ACTION_TONES.blue;
    const press = () => {
      if (onClick) onClick();
      else if (action) handleAction(action, blockReplacement);
    };
    const button = useRef<HTMLButtonElement | null>(null);
    useHotkey(hotkey, press, !disabled, button);

    // A stable hook for E2E: the button's visible label is styling-dependent
    // and duplicated across replacement variants, so cases target the action
    // (and its replacement, where there is one) instead.
    const testId = blockReplacement
      ? `action-${action ?? "block"}-${blockReplacement}`
      : `action-${action ?? label.toLowerCase().replace(/\s+/g, "-")}`;

    if (compact) {
      return (
        <button
          ref={button}
          data-testid={testId}
          onClick={(e) => {
            e.stopPropagation();
            press();
          }}
          disabled={disabled}
          className="relative flex min-h-[44px] w-full flex-col items-start justify-center overflow-hidden rounded-hud border border-white/10 bg-hud-ink/90 py-1 pl-3 pr-1.5 text-left shadow-hud active:bg-hud-edge disabled:opacity-45"
        >
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 w-[4px] ${toneBar(tone)}`}
          />
          <span
            className={`font-hud-label text-hud-sm font-bold uppercase leading-tight tracking-[0.04em] ${
              disabled ? "text-hud-mute" : "text-hud-bone"
            }`}
          >
            {label}
          </span>
          {sub && (
            <span className="font-hud-label text-hud-2xs font-bold uppercase leading-none tracking-[0.06em] text-hud-dim">
              {sub}
            </span>
          )}
        </button>
      );
    }

    return (
      <button
        ref={button}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          press();
        }}
        disabled={disabled}
        className="group relative flex min-h-[40px] w-full items-center justify-between gap-2 overflow-hidden rounded-hud border border-white/10 bg-hud-raise/80 py-1.5 pl-4 pr-2 text-left transition-[background-color,border-color,transform] duration-150 ease-bb hover:-translate-y-px hover:border-hud-gold/60 hover:bg-hud-edge active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-white/10 disabled:hover:bg-hud-raise/80"
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[4px] ${toneBar(tone)}`}
        />
        <span
          className={`font-hud-label text-hud-base font-bold uppercase leading-tight tracking-[0.05em] ${
            disabled ? "text-hud-mute" : "text-hud-bone"
          }`}
        >
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-hud-dim">
          {sub && <Chip tone={disabled ? "neutral" : tone}>{sub}</Chip>}
          {hotkey && <KeyBadge hotkey={hotkey} />}
        </span>
      </button>
    );
  };

  return (
    <div
      data-testid="player-action-menu"
      className="w-full max-h-[60vh] min-h-0 shrink flex flex-col pointer-events-auto animate-hud-in z-50"
      style={{ pointerEvents: "auto", zIndex: 9999 }}
      onClick={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <Panel
        accent="gold"
        className={
          compact
            ? "flex min-h-0 flex-col !border-0 !bg-transparent !shadow-none"
            : "flex min-h-0 flex-col"
        }
      >
        {!compact && (
          <MenuHeader
            player={selectedPlayer}
            secondAction={!!secondActionAfter}
          />
        )}

        {/* Menu Body */}
        {actionSteps.length > 0 ? (
          <ActionStepper
            steps={actionSteps}
            currentStepId={currentStepId || ""}
            eventBus={eventBus}
            hasMovedInAction={hasMovedInAction}
            compact={compact}
            firstOfTwo={declaration?.razzleDazzle?.actions.length === 1}
          />
        ) : (
          <ActionList
            Button={ActionButton}
            availability={availability}
            isProne={selectedPlayer.status === PlayerStatus.PRONE}
            hasActed={selectedPlayer.hasActed}
            compact={compact}
            canRazzle={canRazzle}
            razzleOn={razzleOn}
            onToggleRazzle={() => setRazzleOn((on) => !on)}
            secondActionAfter={secondActionAfter}
          />
        )}
      </Panel>
    </div>
  );
};

interface ActionButtonProps {
  action?: ActionType;
  label: string;
  sub?: string;
  disabled?: boolean;
  color?: string;
  onClick?: () => void;
  blockReplacement?: BlockReplacement;
  hotkey?: Hotkey;
}

/** The availability flags, without the block replacement lists. */
type AvailabilityFlag = {
  [K in keyof ActionAvailability]: ActionAvailability[K] extends boolean
    ? K
    : never;
}[keyof ActionAvailability];

/** A button the menu shows while its availability flag is set. */
type MenuAction = { when: AvailabilityFlag } & Pick<
  ActionButtonProps,
  "label" | "sub" | "hotkey" | "color" | "blockReplacement"
> & { action: ActionType };

/**
 * Block without moving (auto-block on clicking an adjacent enemy still
 * works), then Blitz. The Blitz block replacements follow these.
 */
const BLOCK_ACTIONS: MenuAction[] = [
  { when: "block", action: "block", label: "BLOCK", hotkey: "b", color: "red" },
  {
    when: "multipleBlock",
    action: "multipleBlock",
    label: "MULTIPLE BLOCK",
    sub: "2 Targets",
    color: "red",
  },
  // Only actions with a legal target this activation are shown.
  {
    when: "blitz",
    action: "blitz",
    label: "BLITZ",
    hotkey: "z",
    sub: "1/Turn",
    color: "red",
  },
];

/**
 * The once-a-turn actions, then the special actions: those only when the
 * player has the trait and an adjacent Standing opponent to target.
 */
const OTHER_ACTIONS: MenuAction[] = [
  {
    when: "pass",
    action: "pass",
    label: "PASS",
    hotkey: "p",
    sub: "1/Turn",
    color: "yellow",
  },
  {
    when: "punt",
    action: "punt",
    label: "PUNT",
    sub: "1/Turn",
    color: "yellow",
  },
  {
    when: "handoff",
    action: "handoff",
    label: "HAND-OFF",
    hotkey: "h",
    sub: "1/Turn",
    color: "yellow",
  },
  {
    when: "foul",
    action: "foul",
    label: "FOUL",
    hotkey: "f",
    sub: "1/Turn",
    color: "purple",
  },
  {
    when: "stab",
    action: "stab",
    blockReplacement: "stab",
    label: "STAB",
    sub: "Special",
    color: "orange",
  },
  {
    when: "breatheFire",
    action: "breatheFire",
    blockReplacement: "breatheFire",
    label: "BREATHE FIRE",
    sub: "Special",
    color: "orange",
  },
  {
    when: "vomit",
    action: "vomit",
    blockReplacement: "vomit",
    label: "PROJECTILE VOMIT",
    sub: "Special",
    color: "green",
  },
  {
    when: "gaze",
    action: "gaze",
    label: "HYPNOTIC GAZE",
    sub: "Special",
    color: "purple",
  },
  {
    when: "chomp",
    action: "chomp",
    blockReplacement: "chomp",
    label: "CHOMP",
    sub: "Special",
    color: "orange",
  },
  {
    when: "chainsaw",
    action: "chainsaw",
    blockReplacement: "chainsaw",
    label: "CHAINSAW",
    sub: "Special",
    color: "orange",
  },
  {
    when: "throwBomb",
    action: "throwBomb",
    label: "THROW BOMB",
    sub: "Special",
    color: "orange",
  },
  {
    when: "ballAndChain",
    action: "ballAndChain",
    label: "BALL & CHAIN",
    sub: "Special",
    color: "orange",
  },
  {
    when: "throwTeammate",
    action: "throwTeamMate",
    label: "THROW TEAM-MATE",
    sub: "Special",
    color: "green",
  },
  {
    when: "kickTeammate",
    action: "throwTeamMate",
    label: "KICK TEAM-MATE",
    sub: "Special",
    color: "green",
  },
];

/**
 * Charge!'s step once it has a player picked to act (it reuses this menu),
 * and the team whose players the menu is for.
 */
function actingSide(
  turnData: { phase?: GamePhase; activeTeamId?: string | null } | null
): {
  activeCharge: KickoffEventStepState | null;
  effectiveActiveTeamId: string | null | undefined;
} {
  const kickoffStep = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getKickoffEventStep()
    : null;
  const activeCharge =
    turnData?.phase === GamePhase.KICKOFF && kickoffStep?.charge?.activePlayerId
      ? kickoffStep
      : null;
  return {
    activeCharge,
    effectiveActiveTeamId: activeCharge?.teamId ?? turnData?.activeTeamId,
  };
}

/**
 * Razzle-Dazzle: offered as the player is activated, then the menu comes
 * back for the second Action once the first has ended.
 */
function razzleDazzle(player: Player | null, charging: boolean) {
  const state = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getState()
    : null;
  if (!player || !state)
    return {
      declaration: null,
      secondActionAfter: undefined,
      canRazzle: false,
    };
  const declaration =
    state.activePlayer?.id === player.id ? state.activePlayer : null;
  return {
    declaration,
    secondActionAfter: declaration?.razzleDazzle?.awaitingSecond
      ? (declaration.razzleDazzle.actions[0] as ActionType)
      : undefined,
    canRazzle:
      !charging &&
      !declaration?.committed &&
      !declaration?.razzleDazzle &&
      holdsMeasure(state, player.teamId, DesperateMeasure.RAZZLE_DAZZLE),
  };
}

/** The HUD's turn flags, with Charge!'s Blitz and Grudge Match applied. */
function menuTurnFlags(
  turnData: {
    hasBlitzed?: boolean;
    hasPassed?: boolean;
    hasHandedOff?: boolean;
    hasFouled?: boolean;
  },
  activeCharge: KickoffEventStepState | null,
  state: GameState,
  teamId: string
): TurnFlags {
  return {
    // Charge! runs before the next TurnStarted refreshes the HUD's
    // turn flags. Its Blitz belongs to this kick-off's own budget,
    // regardless of whether the previous turn used a Blitz.
    hasBlitzed: activeCharge?.charge
      ? activeCharge.charge.budget.blitz <= 0
      : !!turnData.hasBlitzed,
    hasPassed: !!turnData.hasPassed,
    hasHandedOff: !!turnData.hasHandedOff,
    // Grudge Match (L24) allows a second Foul this turn.
    hasFouled:
      !!turnData.hasFouled &&
      !holdsMeasure(state, teamId, DesperateMeasure.GRUDGE_MATCH),
  };
}

/** The line under the full menu's buttons, if it has one. */
function menuNote(
  a: ActionAvailability,
  secondActionAfter: ActionType | undefined
): string | null {
  if (secondActionAfter)
    return "Pick the second Action, or end the activation.";
  // Nothing situational to offer beyond ending the activation.
  const contextual =
    a.standUp ||
    a.secureBall ||
    [...BLOCK_ACTIONS, ...OTHER_ACTIONS].some(({ when }) => a[when]);
  return contextual
    ? null
    : "No special actions available — click a square to move.";
}

function MenuHeader({
  player,
  secondAction,
}: {
  player: Player;
  secondAction: boolean;
}) {
  return (
    <PanelHeader
      title={player.playerName || "Unknown"}
      aside={secondAction ? "Razzle-Dazzle: 2nd Action" : player.positionName}
    />
  );
}

/**
 * The actions open to the player now, then End Activation. `Button` is the
 * menu's own button, which sends the action for the selected player.
 */
function ActionList({
  Button,
  availability: a,
  isProne,
  hasActed,
  compact,
  canRazzle,
  razzleOn,
  onToggleRazzle,
  secondActionAfter,
}: {
  Button: React.FC<ActionButtonProps>;
  availability: ActionAvailability;
  isProne: boolean;
  hasActed: boolean;
  compact: boolean;
  canRazzle: boolean;
  razzleOn: boolean;
  onToggleRazzle: () => void;
  secondActionAfter: ActionType | undefined;
}) {
  const offered = (actions: MenuAction[]) =>
    actions
      .filter(({ when }) => a[when])
      .map(({ when, ...button }) => <Button key={when} {...button} />);
  const note = compact ? null : menuNote(a, secondActionAfter);
  return (
    <div
      className={`hud-scroll flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "" : "p-2"}`}
    >
      <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-1"}`}>
        {canRazzle && (
          <Button
            label="RAZZLE-DAZZLE"
            sub={razzleOn ? "On: pick 1st Action" : "Two Actions"}
            color={razzleOn ? "yellow" : "gray"}
            onClick={onToggleRazzle}
          />
        )}
        {/* Move opens the Move sequence panel (Stand Up → Move → Jump);
          a prone player stands up as its first step. Clicking an empty
          square still auto-moves. */}
        {a.move && (
          <Button
            action="move"
            label="MOVE"
            hotkey="m"
            sub={isProne ? "Stand + Move" : a.jump ? "Jump" : undefined}
            color="green"
          />
        )}
        {offered(BLOCK_ACTIONS)}
        {a.blitzBlockReplacements.map((replacement) => (
          <Button
            key={`blitz-${replacement}`}
            action="blitz"
            blockReplacement={replacement}
            label={`BLITZ (WITH ${BLOCK_REPLACEMENT_DEFINITIONS[
              replacement
            ].label.toUpperCase()})`}
            sub="1/Turn"
            color="red"
          />
        ))}
        {offered(OTHER_ACTIONS)}
        {isProne && (
          <Button
            action="standUp"
            label="STAND UP"
            hotkey="u"
            sub="3 MA"
            disabled={!a.standUp}
            color="blue"
          />
        )}
        {a.secureBall && (
          <Button
            action="secureBall"
            label="SECURE BALL"
            sub="Pick Up"
            color="blue"
          />
        )}
        {note && (
          <div className="px-1 py-1 text-center text-hud-sm italic text-hud-dim">
            {note}
          </div>
        )}
        <Button
          action="forgoe"
          label="END ACTIVATION"
          hotkey="e"
          sub="Skip"
          disabled={hasActed}
          color="gray"
        />
      </div>
    </div>
  );
}
