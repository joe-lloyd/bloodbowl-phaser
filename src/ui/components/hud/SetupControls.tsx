import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";

import { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { SetupTeamStatus } from "../../../types/SetupTypes";

interface SetupControlsProps {
  eventBus: EventBus;
}

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
  const outstanding =
    status?.restrictions.filter((restriction) => !restriction.satisfied) ?? [];

  const SetupActionButton = ({
    action,
    label,
    sub,
    disabled = false,
    color = "blue",
    onClick,
  }: {
    action: string;
    label: string;
    sub?: string;
    disabled?: boolean;
    color?: string;
    onClick?: () => void;
  }) => {
    const colorSchemes: Record<
      string,
      { bg: string; border: string; hoverBg: string; hoverBorder: string }
    > = {
      red: {
        bg: "#7f1d1d",
        border: "#991b1b",
        hoverBg: "#991b1b",
        hoverBorder: "#dc2626",
      },
      yellow: {
        bg: "#713f12",
        border: "#a16207",
        hoverBg: "#a16207",
        hoverBorder: "#eab308",
      },
      blue: {
        bg: "#1e3a8a",
        border: "#1e40af",
        hoverBg: "#1e40af",
        hoverBorder: "#3b82f6",
      },
      green: {
        bg: "#14532d",
        border: "#166534",
        hoverBg: "#166534",
        hoverBorder: "#22c55e",
      },
      gray: {
        bg: "#374151",
        border: "#4b5563",
        hoverBg: "#4b5563",
        hoverBorder: "#6b7280",
      },
    };

    const scheme = colorSchemes[color] || colorSchemes.blue;

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick();
          else handleAction(action);
        }}
        disabled={disabled}
        className="group relative w-full px-3 py-2 border-2 rounded transition-all duration-200 flex flex-col items-start mb-1"
        style={{
          backgroundColor: disabled ? "#374151" : scheme.bg,
          borderColor: disabled ? "#4b5563" : scheme.border,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = scheme.hoverBg;
            e.currentTarget.style.borderColor = scheme.hoverBorder;
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow =
              "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = scheme.bg;
            e.currentTarget.style.borderColor = scheme.border;
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
          }
        }}
      >
        <div className="flex justify-between w-full items-center">
          <span
            className={`font-heading text-sm ${
              disabled ? "text-gray-400" : "text-white"
            }`}
          >
            {label}
          </span>
          {sub && (
            <span className="text-[10px] font-mono bg-black/30 px-1 rounded text-white/80">
              {sub}
            </span>
          )}
        </div>
      </button>
    );
  };

  if (!isVisible) return null;

  const isDefense = subPhase === SubPhase.SETUP_KICKING;

  return (
    <div className="w-full max-h-[60vh] flex flex-col pointer-events-auto animate-fade-in z-50">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-3 py-1 border-t-2 border-x-2 border-bb-gold rounded-t-md">
        <span className="font-heading text-bb-gold text-lg truncate">
          {activeTeam?.name || "Unknown Team"}
        </span>
        <span className="text-xs text-gray-400 font-bold uppercase">
          {isDefense ? "Setup Defense" : "Setup Offense"}
        </span>
      </div>

      {/* Body */}
      <div className="bg-bb-parchment border-2 border-bb-gold p-2 rounded-b-md shadow-lg flex flex-col gap-1">
        {concessionPending && (
          <div className="mb-2 rounded border-2 border-red-800 bg-red-50 p-2 text-xs text-bb-text">
            <div className="font-heading text-sm text-red-900">
              Short-handed team
            </div>
            <p className="my-1">
              Only {status?.availablePlayerCount ?? 0} players are available.
              You may concede now without an additional penalty, or play on.
            </p>
            <div className="flex gap-1">
              <SetupActionButton
                action="continue"
                label="PLAY ON"
                color="green"
              />
              <SetupActionButton action="concede" label="CONCEDE" color="red" />
            </div>
          </div>
        )}

        {/* Formations: presets + this team's saved layouts */}
        <select
          value={selectedFormation}
          onChange={(e) => setSelectedFormation(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-white border-2 border-bb-gold rounded font-heading text-bb-text cursor-pointer pointer-events-auto"
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

        <div className="flex gap-1">
          <SetupActionButton
            action="load"
            label="LOAD"
            color="blue"
            disabled={!selectedFormation || concessionPending}
            onClick={() => handleAction("load", selectedFormation)}
          />
          <SetupActionButton
            action="delete"
            label="DELETE"
            color="red"
            disabled={!selected || selected.builtIn}
            onClick={() => handleAction("delete", selectedFormation)}
          />
        </div>

        <div className="flex gap-1 items-stretch">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Formation name…"
            maxLength={24}
            className="flex-1 min-w-0 px-2 text-sm bg-white border-2 border-bb-gold rounded text-bb-text pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="w-24">
            <SetupActionButton
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

        <div className="h-px bg-bb-ink-blue/20 my-1 mx-2"></div>

        <SetupActionButton
          action="clear"
          label="CLEAR PITCH"
          sub="Reset"
          color="red"
          disabled={concessionPending}
        />

        <div className="h-2"></div>

        <SetupActionButton
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
    </div>
  );
};
