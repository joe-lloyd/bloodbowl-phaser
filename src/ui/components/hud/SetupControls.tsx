import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";

import { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { SetupChecklist } from "./SetupChecklist";
import { SetupTeamStatus } from "../../../types/SetupTypes";
import {
  HudButton,
  HudButtonVariant,
  Panel,
  PanelHeader,
} from "../componentWarehouse/HudKit";

/** The setup panel's colour names, mapped onto HUD button variants. */
const SETUP_VARIANTS: Record<string, HudButtonVariant> = {
  red: "danger",
  yellow: "gold",
  blue: "secondary",
  green: "success",
  gray: "secondary",
};

interface SetupControlsProps {
  eventBus: EventBus;
}

const SetupActionButton = ({
  action,
  label,
  sub,
  disabled = false,
  color = "blue",
  onClick,
  onAction,
}: {
  action: string;
  label: string;
  sub?: string;
  disabled?: boolean;
  color?: string;
  onClick?: () => void;
  onAction: (action: string) => void;
}) => {
  const variant = SETUP_VARIANTS[color] ?? "secondary";

  return (
    <HudButton
      variant={variant}
      block
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) onClick();
        else onAction(action);
      }}
      disabled={disabled}
      className="!justify-between"
    >
      <span>{label}</span>
      {sub && (
        <span className="rounded-hud bg-black/30 px-1.5 py-0.5 font-hud-body text-hud-xs font-semibold normal-case tracking-normal opacity-90">
          {sub}
        </span>
      )}
    </HudButton>
  );
};

export const SetupControls: React.FC<SetupControlsProps> = ({ eventBus }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [activeTeam, setActiveTeam] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [subPhase, setSubPhase] = useState<SubPhase>(SubPhase.SETUP_KICKING);
  const [formations, setFormations] = useState<
    { name: string; builtIn: boolean }[]
  >([]);
  const [selectedFormation, setSelectedFormation] = useState("");
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<SetupTeamStatus | null>(null);

  useEventBus(eventBus, GameEventNames.UI_ShowSetupControls, (data) => {
    setIsVisible(true);
    setSubPhase(data.subPhase);
    setActiveTeam(data.activeTeam);
    setStatus(data.status ?? null);
    setIsComplete(data.status?.canConfirm ?? false);
    setSaveName("");
    // Fetch this team's pickable formations (presets + their saved ones)
    eventBus.emit(GameEventNames.UI_SetupAction, { action: "list" });
  });

  useEventBus(eventBus, GameEventNames.UI_FormationsUpdated, (data) => {
    setFormations(data.formations);
    setSelectedFormation((current) =>
      data.formations.some((f) => f.name === current)
        ? current
        : (data.formations[0]?.name ?? "")
    );
  });

  useEventBus(eventBus, GameEventNames.UI_HideSetupControls, () => {
    setIsVisible(false);
  });

  useEventBus(
    eventBus,
    GameEventNames.UI_SetupComplete,
    (complete: boolean) => {
      setIsComplete(complete);
    }
  );

  useEventBus(
    eventBus,
    GameEventNames.SetupRestrictionsUpdated,
    (nextStatus) => {
      setStatus(nextStatus);
      setIsComplete(nextStatus.canConfirm);
    }
  );

  const handleAction = (action: string, name?: string) => {
    eventBus.emit(GameEventNames.UI_SetupAction, { action, name });
  };

  const selected = formations.find((f) => f.name === selectedFormation);
  const concessionPending = status?.concessionDecision === "pending";

  if (!isVisible) return null;

  const isDefense = subPhase === SubPhase.SETUP_KICKING;

  return (
    <Panel
      accent="gold"
      className="w-full shrink-0 flex flex-col pointer-events-auto animate-hud-in z-50"
    >
      <PanelHeader
        title={activeTeam?.name || "Unknown Team"}
        aside={isDefense ? "Setup Defense" : "Setup Offense"}
      />

      {/* Body */}
      <div className="flex flex-col gap-2 p-2.5">
        {concessionPending && (
          <div className="rounded-hud border border-hud-bad/60 bg-hud-blood-deep/40 p-2.5 text-hud-sm text-hud-bone">
            <div className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] text-hud-bad-soft">
              Short-handed team
            </div>
            <p className="my-1.5">
              Only {status?.availablePlayerCount ?? 0} players are available.
              You may concede now without an additional penalty, or play on.
            </p>
            <div className="flex gap-2">
              <SetupActionButton
                onAction={handleAction}
                action="continue"
                label="PLAY ON"
                color="green"
              />
              <SetupActionButton
                onAction={handleAction}
                action="concede"
                label="CONCEDE"
                color="red"
              />
            </div>
          </div>
        )}

        {/* Formations: presets + this team's saved layouts */}
        <select
          value={selectedFormation}
          onChange={(e) => setSelectedFormation(e.target.value)}
          className="hud-field cursor-pointer"
        >
          <optgroup label="Presets">
            {formations
              .filter((f) => f.builtIn)
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
          </optgroup>
          {formations.some((f) => !f.builtIn) && (
            <optgroup label="Saved">
              {formations
                .filter((f) => !f.builtIn)
                .map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>

        <div className="flex gap-2">
          <SetupActionButton
            onAction={handleAction}
            action="load"
            label="LOAD"
            color="blue"
            disabled={!selectedFormation || concessionPending}
            onClick={() => handleAction("load", selectedFormation)}
          />
          <SetupActionButton
            onAction={handleAction}
            action="delete"
            label="DELETE"
            color="red"
            disabled={!selected || selected.builtIn}
            onClick={() => handleAction("delete", selectedFormation)}
          />
        </div>

        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Formation name…"
            maxLength={24}
            className="hud-field min-w-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="w-24">
            <SetupActionButton
              onAction={handleAction}
              action="save"
              label="SAVE"
              color="yellow"
              disabled={saveName.trim().length === 0}
              onClick={() => {
                handleAction("save", saveName.trim());
                setSaveName("");
              }}
            />
          </div>
        </div>

        <div className="my-0.5 h-px bg-white/10"></div>

        <SetupActionButton
          onAction={handleAction}
          action="clear"
          label="CLEAR PITCH"
          sub="Reset"
          color="red"
          disabled={concessionPending}
        />

        {status && <SetupChecklist status={status} />}

        <SetupActionButton
          onAction={handleAction}
          action="confirm"
          label={isComplete ? "CONFIRM SETUP" : "SETUP INCOMPLETE"}
          // A short-handed team fields everyone it has, so the target is the
          // available count — never a hard-coded seven.
          sub={
            isComplete
              ? "Ready!"
              : status
                ? `Placed ${status.placedPlayerCount} of ${status.requiredPlayerCount} available`
                : "Place Players"
          }
          disabled={!isComplete}
          color={isComplete ? "green" : "gray"}
        />
      </div>
    </Panel>
  );
};
