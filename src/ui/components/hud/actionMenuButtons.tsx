import React, { useRef } from "react";
import {
  Chip,
  KeyBadge,
  PanelHeader,
  toneBar,
  type HudTone,
} from "../componentWarehouse/HudKit";
import { useHotkey, type Hotkey } from "../../hotkeys";
import type { Player } from "../../../types/Player";
import type { ActionType } from "../../../types/events";
import {
  BLOCK_REPLACEMENT_DEFINITIONS,
  type BlockReplacement,
} from "../../../types/BlockReplacement";
import type { ActionAvailability } from "../../../game/rules/actionAvailability";

const DEFAULT_ACTION_TONE: HudTone = "info";

const ACTION_TONES: Record<string, HudTone> = {
  red: "bad",
  yellow: "gold",
  purple: "skill",
  blue: DEFAULT_ACTION_TONE,
  green: "good",
  orange: "warn",
  gray: "neutral",
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

type AvailabilityFlag = {
  [K in keyof ActionAvailability]: ActionAvailability[K] extends boolean
    ? K
    : never;
}[keyof ActionAvailability];

type MenuAction = { when: AvailabilityFlag } & Pick<
  ActionButtonProps,
  "label" | "sub" | "hotkey" | "color" | "blockReplacement"
> & { action: ActionType };

const BLOCK_ACTIONS: MenuAction[] = [
  { when: "block", action: "block", label: "BLOCK", hotkey: "b", color: "red" },
  {
    when: "multipleBlock",
    action: "multipleBlock",
    label: "MULTIPLE BLOCK",
    sub: "2 Targets",
    color: "red",
  },

  {
    when: "blitz",
    action: "blitz",
    label: "BLITZ",
    hotkey: "z",
    sub: "1/Turn",
    color: "red",
  },
];

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

function menuNote(
  a: ActionAvailability,
  secondActionAfter: ActionType | undefined
): string | null {
  if (secondActionAfter)
    return "Pick the second Action, or end the activation.";

  const contextual =
    a.standUp ||
    a.secureBall ||
    [...BLOCK_ACTIONS, ...OTHER_ACTIONS].some(({ when }) => a[when]);
  return contextual
    ? null
    : "No special actions available — click a square to move.";
}

export function MenuHeader({
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

interface ActionListProps {
  onAction: (action: ActionType, replacement?: BlockReplacement) => void;
  availability: ActionAvailability;
  isProne: boolean;
  hasActed: boolean;
  compact: boolean;
  canRazzle: boolean;
  razzleOn: boolean;
  onToggleRazzle: () => void;
  secondActionAfter: ActionType | undefined;
}
export function ActionList(props: ActionListProps) {
  const {
    compact,
    availability: a,
    secondActionAfter,
    hasActed,
    onAction,
  } = props;
  const note = compact ? null : menuNote(a, secondActionAfter);
  return (
    <div
      className={`hud-scroll flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "" : "p-2"}`}
    >
      <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-1"}`}>
        {actionOffers(props).map(({ id, ...button }) => (
          <ActionButton
            key={id}
            {...button}
            compact={compact}
            onAction={onAction}
          />
        ))}
        {note && (
          <div className="px-1 py-1 text-center text-hud-sm italic text-hud-dim">
            {note}
          </div>
        )}
        <ActionButton
          action="forgoe"
          label="END ACTIVATION"
          hotkey="e"
          sub="Skip"
          disabled={hasActed}
          color="gray"
          compact={compact}
          onAction={onAction}
        />
      </div>
    </div>
  );
}
interface MenuButton extends ActionButtonProps {
  id: string;
}
function actionOffers(props: ActionListProps): MenuButton[] {
  const {
    availability: a,
    canRazzle,
    razzleOn,
    onToggleRazzle,
    isProne,
  } = props;
  const buttons: MenuButton[] = [];
  if (canRazzle)
    buttons.push({
      id: "razzle-dazzle",
      label: "RAZZLE-DAZZLE",
      sub: razzleOn ? "On: pick 1st Action" : "Two Actions",
      color: razzleOn ? "yellow" : "gray",
      onClick: onToggleRazzle,
    });
  if (a.move) {
    const sub = moveActionSub(isProne, a.jump);
    buttons.push({
      id: "move",
      action: "move",
      label: "MOVE",
      hotkey: "m",
      ...(sub === undefined ? {} : { sub }),
      color: "green",
    });
  }
  buttons.push(...offeredActions(BLOCK_ACTIONS, a));
  for (const replacement of a.blitzBlockReplacements)
    buttons.push({
      id: `blitz-${replacement}`,
      action: "blitz",
      blockReplacement: replacement,
      label: `BLITZ (WITH ${BLOCK_REPLACEMENT_DEFINITIONS[replacement].label.toUpperCase()})`,
      sub: "1/Turn",
      color: "red",
    });
  buttons.push(...offeredActions(OTHER_ACTIONS, a));
  if (isProne)
    buttons.push({
      id: "standUp",
      action: "standUp",
      label: "STAND UP",
      hotkey: "u",
      sub: "3 MA",
      disabled: !a.standUp,
      color: "blue",
    });
  if (a.secureBall)
    buttons.push({
      id: "secureBall",
      action: "secureBall",
      label: "SECURE BALL",
      sub: "Pick Up",
      color: "blue",
    });
  return buttons;
}
function offeredActions(
  actions: MenuAction[],
  availability: ActionAvailability
): MenuButton[] {
  return actions
    .filter(({ when }) => availability[when])
    .map(({ when, ...button }) => ({ ...button, id: when }));
}
function moveActionSub(prone: boolean, jump: boolean): string | undefined {
  if (prone) return "Stand + Move";
  return jump ? "Jump" : undefined;
}

interface ActionButtonContextProps extends ActionButtonProps {
  compact: boolean;
  onAction: (action: ActionType, replacement?: BlockReplacement) => void;
}

interface ActionButtonRenderProps {
  button: React.RefObject<HTMLButtonElement | null>;
  press: () => void;
  testId: string;
  tone: HudTone;
  props: ActionButtonContextProps;
}

function ActionButton(props: ActionButtonContextProps) {
  const {
    action,
    label,
    disabled,
    color = "blue",
    onClick,
    blockReplacement,
    hotkey,
    compact,
    onAction,
  } = props;
  const tone = ACTION_TONES[color] ?? DEFAULT_ACTION_TONE;
  const press = () => {
    if (onClick) onClick();
    else if (action) onAction(action, blockReplacement);
  };
  const button = useRef<HTMLButtonElement | null>(null);
  useHotkey(hotkey, press, !disabled, button);
  const testId = blockReplacement
    ? `action-${action ?? "block"}-${blockReplacement}`
    : `action-${action ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  const rendered = { button, press, testId, tone, props };
  return compact ? (
    <CompactActionButton {...rendered} />
  ) : (
    <FullActionButton {...rendered} />
  );
}

function CompactActionButton({
  button,
  press,
  testId,
  tone,
  props,
}: ActionButtonRenderProps) {
  const { label, disabled, sub } = props;
  return (
    <button
      ref={button}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        press();
      }}
      {...(disabled === undefined ? {} : { disabled: disabled })}
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

function FullActionButton({
  button,
  press,
  testId,
  tone,
  props,
}: ActionButtonRenderProps) {
  const { label, disabled, sub, hotkey } = props;
  return (
    <button
      ref={button}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        press();
      }}
      {...(disabled === undefined ? {} : { disabled: disabled })}
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
}
