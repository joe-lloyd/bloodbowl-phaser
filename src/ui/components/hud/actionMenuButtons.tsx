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
import type { ActionType, MovementHalf } from "../../../types/events";
import {
  BLOCK_REPLACEMENT_DEFINITIONS,
  type BlockReplacement,
} from "../../../types/BlockReplacement";
import { MoveSplit } from "./MoveSplit";
import { MOVEMENT_HALVES } from "./movementHalves";
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
  half?: MovementHalf;
  hotkey?: Hotkey;
}

export interface ActionChoice {
  blockReplacement?: BlockReplacement | undefined;
  half?: MovementHalf | undefined;
}

type OnAction = (action: ActionType, choice: ActionChoice) => void;

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
    color: "orange",
  },
  {
    when: "breatheFire",
    action: "breatheFire",
    blockReplacement: "breatheFire",
    label: "BREATHE FIRE",
    color: "orange",
  },
  {
    when: "vomit",
    action: "vomit",
    blockReplacement: "vomit",
    label: "PROJECTILE VOMIT",
    color: "green",
  },
  {
    when: "gaze",
    action: "gaze",
    label: "HYPNOTIC GAZE",
    color: "purple",
  },
  {
    when: "chomp",
    action: "chomp",
    blockReplacement: "chomp",
    label: "CHOMP",
    color: "orange",
  },
  {
    when: "chainsaw",
    action: "chainsaw",
    blockReplacement: "chainsaw",
    label: "CHAINSAW",
    color: "orange",
  },
  {
    when: "throwBomb",
    action: "throwBomb",
    label: "THROW BOMB",
    color: "orange",
  },
  {
    when: "ballAndChain",
    action: "ballAndChain",
    label: "BALL & CHAIN",
    color: "orange",
  },
  {
    when: "throwTeammate",
    action: "throwTeamMate",
    label: "THROW TEAM-MATE",
    color: "green",
  },
  {
    when: "kickTeammate",
    action: "throwTeamMate",
    label: "KICK TEAM-MATE",
    color: "green",
  },
];

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
      aside={secondAction ? "Razzle-Dazzle: 2nd Action" : undefined}
    />
  );
}

interface ActionListProps {
  onAction: OnAction;
  availability: ActionAvailability;
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
  const offers = actionOffers(props);
  return (
    <div
      className={`hud-scroll flex min-h-0 flex-1 flex-col overflow-y-auto ${compact ? "" : "p-2"}`}
    >
      <div
        className={
          compact
            ? `grid gap-1.5 [direction:rtl] ${offers.length > 2 ? "landscape:grid-cols-[112px_112px]" : ""} grid-cols-[112px]`
            : "flex flex-col gap-1"
        }
      >
        <MoveOffer availability={a} compact={compact} onAction={onAction} />
        {offers.map(({ id, ...button }) => (
          <ActionButton
            key={id}
            {...button}
            compact={compact}
            onAction={onAction}
          />
        ))}
        {secondActionAfter && !compact && (
          <div className="px-1 py-1 text-center text-hud-sm italic text-hud-dim">
            Pick the second Action, or end the activation.
          </div>
        )}
        <ActionButton
          action="forgoe"
          label="END ACTIVATION"
          hotkey="e"
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
  if (a.secureBall)
    buttons.push({
      id: "secureBall",
      action: "secureBall",
      label: "SECURE BALL",
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

function offeredHalf(a: ActionAvailability): MovementHalf | null {
  if (a.standUp) return "standup";
  return a.jump ? "jump" : null;
}

function MoveOffer({
  availability: a,
  compact,
  onAction,
}: Pick<ActionListProps, "availability" | "compact" | "onAction">) {
  const half = offeredHalf(a);
  if (!a.move && !half) return null;
  const shared = { action: "move", color: "green", compact, onAction } as const;
  const move = (
    <ActionButton {...shared} label="MOVE" hotkey="m" disabled={!a.move} />
  );
  if (!half) return move;
  return (
    <MoveSplit>
      {move}
      <ActionButton {...shared} {...MOVEMENT_HALVES[half]} half={half} />
    </MoveSplit>
  );
}

interface ActionButtonContextProps extends ActionButtonProps {
  compact: boolean;
  onAction: OnAction;
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
    half,
    hotkey,
    compact,
    onAction,
  } = props;
  const tone = ACTION_TONES[color] ?? DEFAULT_ACTION_TONE;
  const press = () => {
    if (onClick) onClick();
    else if (action) onAction(action, { blockReplacement, half });
  };
  const button = useRef<HTMLButtonElement | null>(null);
  useHotkey(hotkey, press, !disabled, button);
  const variant = blockReplacement ?? half;
  const testId = variant
    ? `action-${action ?? "block"}-${variant}`
    : `action-${action ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  const rendered = { button, press, testId, tone, props };
  return compact ? (
    <CompactActionButton {...rendered} />
  ) : (
    <FullActionButton {...rendered} />
  );
}

function ActionButtonShell({
  render: { button, press, testId, tone, props },
  className,
  children,
}: {
  render: ActionButtonRenderProps;
  className: string;
  children: React.ReactNode;
}) {
  const { disabled } = props;
  return (
    <button
      ref={button}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation();
        press();
      }}
      {...(disabled === undefined ? {} : { disabled: disabled })}
      className={className}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[4px] ${toneBar(tone)}`}
      />
      {children}
    </button>
  );
}

function CompactActionButton(rendered: ActionButtonRenderProps) {
  const { label, disabled, sub } = rendered.props;
  return (
    <ActionButtonShell
      render={rendered}
      className="relative flex min-h-[44px] w-full flex-col items-start justify-center overflow-hidden rounded-hud border border-white/10 bg-hud-ink/90 py-1 pl-3 pr-1.5 text-left [direction:ltr] shadow-hud active:bg-hud-edge disabled:opacity-45"
    >
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
    </ActionButtonShell>
  );
}

function FullActionButton(rendered: ActionButtonRenderProps) {
  const { label, disabled, sub, hotkey } = rendered.props;
  const { tone } = rendered;
  return (
    <ActionButtonShell
      render={rendered}
      className="group relative flex min-h-[40px] w-full items-center justify-between gap-2 overflow-hidden rounded-hud border border-white/10 bg-hud-raise/80 py-1.5 pl-4 pr-2 text-left transition-[background-color,border-color,transform] duration-150 ease-bb hover:-translate-y-px hover:border-hud-gold/60 hover:bg-hud-edge active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-white/10 disabled:hover:bg-hud-raise/80"
    >
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
    </ActionButtonShell>
  );
}
