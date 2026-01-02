import React, { useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";

import { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";

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

  useEventBus(eventBus, GameEventNames.UI_ShowSetupControls, (data) => {
    setIsVisible(true);
    setSubPhase(data.subPhase);
    setActiveTeam(data.activeTeam);
    setIsComplete(false);
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

  const handleAction = (action: string) => {
    eventBus.emit(GameEventNames.UI_SetupAction, { action });
  };

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
        <SetupActionButton
          action="default"
          label="DEFAULT"
          sub="Formation"
          color="blue"
        />

        <div className="flex gap-1">
          <SetupActionButton action="save" label="SAVE" color="yellow" />
          <SetupActionButton action="load" label="LOAD" color="yellow" />
        </div>

        <div className="h-px bg-bb-ink-blue/20 my-1 mx-2"></div>

        <SetupActionButton
          action="clear"
          label="CLEAR PITCH"
          sub="Reset"
          color="red"
        />

        <div className="h-2"></div>

        <SetupActionButton
          action="confirm"
          label={isComplete ? "CONFIRM SETUP" : "SETUP INCOMPLETE"}
          sub={isComplete ? "Ready!" : "Place Players"}
          disabled={!isComplete}
          color={isComplete ? "green" : "gray"}
        />
      </div>
    </div>
  );
};
