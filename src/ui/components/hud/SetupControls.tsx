import React, { useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";

import { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import type { FormationEntry } from "../../../game/managers/FormationManager";
import { FormationPicker } from "./FormationPicker";
import { SetupChecklist } from "./SetupChecklist";
import { type SetupTeamStatus } from "../../../types/SetupTypes";
import {
  HudButton,
  type HudButtonVariant,
  Panel,
  PanelHeader,
} from "../componentWarehouse/HudKit";

const SETUP_VARIANTS: Record<string, HudButtonVariant> = {
  red: "danger",
  yellow: "secondary",
  blue: "secondary",
  green: "primary",
  gray: "secondary",
};

interface SetupControlsProps {
  eventBus: EventBus;

  compact?: boolean;
}

const SetupActionButton = ({
  action,
  label,
  disabled = false,
  color = "blue",
  onClick,
  onAction,
}: {
  action: string;
  label: string;
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
      {label}
    </HudButton>
  );
};

export const SetupControls: React.FC<SetupControlsProps> = ({
  eventBus,
  compact = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [activeTeam, setActiveTeam] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [subPhase, setSubPhase] = useState<SubPhase>(SubPhase.SETUP_KICKING);
  const [formations, setFormations] = useState<FormationEntry[]>([]);
  const [isTeam1, setIsTeam1] = useState(true);
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

    eventBus.emit(GameEventNames.UI_SetupAction, { action: "list" });
  });

  useEventBus(eventBus, GameEventNames.UI_FormationsUpdated, (data) => {
    setFormations(data.formations);
    setIsTeam1(data.isTeam1);
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

  if (!isVisible) return null;

  const handleAction = (action: string, name?: string) => {
    eventBus.emit(GameEventNames.UI_SetupAction, {
      action,
      ...(name !== undefined && { name: name }),
    });
  };

  const concessionPending = status?.concessionDecision === "pending";

  const title = setupTitle(status, subPhase);

  return (
    <Panel
      data-testid="setup-controls"
      accent="gold"
      className="w-full phone:landscape:w-[220px] shrink-0 flex flex-col pointer-events-auto animate-hud-in z-50"
    >
      {compact ? (
        <div className="hud-label px-2.5 pt-2 text-hud-gold">{title}</div>
      ) : (
        <PanelHeader title={activeTeam?.name || "Unknown Team"} aside={title} />
      )}

      <div className={`flex flex-col gap-2 ${compact ? "p-2" : "p-3"}`}>
        {concessionPending && (
          <ConcessionOffer status={status} onAction={handleAction} />
        )}

        {status?.swarming ? (
          <p className="font-hud-body text-hud-sm text-hud-bone">
            Swarming rolled {status.swarming.roll}. Add up to{" "}
            {status.swarming.maximumAdditionalPlayers} reserve Linemen. The
            confirmed formation stays in place. Finish without extras to
            decline.
          </p>
        ) : (
          <FormationTools
            formations={formations}
            selectedFormation={selectedFormation}
            onSelectFormation={setSelectedFormation}
            saveName={saveName}
            onSaveName={setSaveName}
            compact={compact}
            isTeam1={isTeam1}
            kicking={subPhase === SubPhase.SETUP_KICKING}
            concessionPending={concessionPending}
            onAction={handleAction}
          />
        )}

        {status && <SetupChecklist status={status} />}

        <SetupActionButton
          onAction={handleAction}
          action="confirm"
          label={confirmLabel(status, isComplete)}
          disabled={!isComplete}
          color={isComplete ? "green" : "gray"}
        />
      </div>
    </Panel>
  );
};

function setupTitle(status: SetupTeamStatus | null, subPhase: SubPhase) {
  if (status?.swarming) return "Swarming";
  return subPhase === SubPhase.SETUP_KICKING
    ? "Setup Defense"
    : "Setup Offense";
}

function confirmLabel(status: SetupTeamStatus | null, isComplete: boolean) {
  if (status?.swarming) return "FINISH SWARMING";
  return isComplete ? "CONFIRM SETUP" : "SETUP INCOMPLETE";
}

type SetupAction = (action: string, name?: string) => void;

function ConcessionOffer({
  status,
  onAction,
}: {
  status: SetupTeamStatus | null;
  onAction: SetupAction;
}) {
  return (
    <div className="rounded-hud border border-hud-bad/60 bg-hud-blood-deep/40 p-2.5 text-hud-sm text-hud-bone">
      <div className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] text-hud-bad-soft">
        Short-handed team
      </div>
      <p className="my-1.5">
        Only {status?.availablePlayerCount ?? 0} players are available. You may
        concede now without an additional penalty, or play on.
      </p>
      <div className="flex gap-2">
        <SetupActionButton
          onAction={onAction}
          action="continue"
          label="PLAY ON"
          color="green"
        />
        <SetupActionButton
          onAction={onAction}
          action="concede"
          label="CONCEDE"
          color="red"
        />
      </div>
    </div>
  );
}

function FormationSelect({
  formations,
  selected,
  onSelect,
}: {
  formations: readonly FormationEntry[];
  selected: string;
  onSelect: (name: string) => void;
}) {
  return (
      <select
        value={selected}
        onChange={(e) => {
          onSelect(e.target.value);
        }}
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
  );
}

function FormationTools({
  formations,
  isTeam1,
  kicking,
  selectedFormation,
  onSelectFormation,
  saveName,
  onSaveName,
  compact,
  concessionPending,
  onAction,
}: {
  formations: FormationEntry[];
  isTeam1: boolean;
  kicking: boolean;
  selectedFormation: string;
  onSelectFormation: (name: string) => void;
  saveName: string;
  onSaveName: (name: string) => void;
  compact: boolean;
  concessionPending: boolean;
  onAction: SetupAction;
}) {
  const selected = formations.find((f) => f.name === selectedFormation);
  return (
    <>
      {compact ? (
        <FormationSelect
          formations={formations}
          selected={selectedFormation}
          onSelect={onSelectFormation}
        />
      ) : (
        <FormationPicker
          formations={formations}
          selected={selectedFormation}
          isTeam1={isTeam1}
          kicking={kicking}
          disabled={concessionPending}
          onPick={(name) => {
            onSelectFormation(name);
            onAction("load", name);
          }}
        />
      )}

      <div className="flex gap-2">
        <SetupActionButton
          onAction={onAction}
          action="load"
          label="LOAD"
          color="blue"
          disabled={!selectedFormation || concessionPending}
          onClick={() => {
            onAction("load", selectedFormation);
          }}
        />
        {compact ? (
          <SetupActionButton
            onAction={onAction}
            action="clear"
            label="CLEAR"
            color="red"
            disabled={concessionPending}
          />
        ) : (
          <SetupActionButton
            onAction={onAction}
            action="delete"
            label="DELETE"
            color="red"
            disabled={!selected || selected.builtIn}
            onClick={() => {
              onAction("delete", selectedFormation);
            }}
          />
        )}
      </div>

      <div className={compact ? "hidden" : "flex items-stretch gap-2"}>
        <input
          type="text"
          value={saveName}
          onChange={(e) => {
            onSaveName(e.target.value);
          }}
          placeholder="Formation name…"
          maxLength={24}
          className="hud-field min-w-0 flex-1"
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
        <div className="w-24">
          <SetupActionButton
            onAction={onAction}
            action="save"
            label="SAVE"
            color="yellow"
            disabled={saveName.trim().length === 0}
            onClick={() => {
              onAction("save", saveName.trim());
              onSaveName("");
            }}
          />
        </div>
      </div>

      {!compact && (
        <>
          <div className="my-0.5 h-px bg-white/10"></div>
          <SetupActionButton
            onAction={onAction}
            action="clear"
            label="CLEAR PITCH"
            color="red"
            disabled={concessionPending}
          />
        </>
      )}
    </>
  );
}
