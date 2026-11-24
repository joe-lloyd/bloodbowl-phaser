import { type ReactNode, useState } from "react";
import {
  PLAYGROUND_EVENTS,
  type PlaygroundConfig,
} from "../../../data/kickoffPlayground";
import { RosterName } from "../../../types/Team";
import { Select } from "../common/NativeControls";
import { HudButton, Panel, PanelHeader } from "../componentWarehouse/HudKit";

interface KickoffPlaygroundPanelProps {
  config: PlaygroundConfig;
  onChange: (config: PlaygroundConfig) => void;
  onRestart: () => void;
}

const GROUPS = [...new Set(PLAYGROUND_EVENTS.map(({ group }) => group))];

const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6, 7];

function Choice({
  label,
  value,
  onPick,
  children,
}: {
  label: string;
  value: string;
  onPick: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="hud-label">{label}</span>
      <Select
        aria-label={label}
        className="hud-field cursor-pointer"
        value={value}
        onChange={(event) => {
          onPick(event.target.value);
        }}
      >
        {children}
      </Select>
    </div>
  );
}

function RosterChoice({
  label,
  value,
  onPick,
}: {
  label: string;
  value: RosterName;
  onPick: (roster: RosterName) => void;
}) {
  return (
    <Choice
      label={label}
      value={value}
      onPick={(name) => {
        const roster = Object.values(RosterName).find((known) => known === name);
        if (roster) onPick(roster);
      }}
    >
      {Object.values(RosterName).map((roster) => (
        <option key={roster} value={roster}>
          {roster}
        </option>
      ))}
    </Choice>
  );
}

function EventChoice({ config, onChange }: KickoffPlaygroundPanelProps) {
  return (
    <Choice
      label="Event"
      value={config.scene.id}
      onPick={(id) => {
        const scene = PLAYGROUND_EVENTS.find((entry) => entry.id === id);
        if (scene) onChange({ ...config, scene });
      }}
    >
      {GROUPS.map((group) => (
        <optgroup key={group} label={group}>
          {PLAYGROUND_EVENTS.filter((entry) => entry.group === group).map(
            (entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} ({entry.coach} coach)
              </option>
            )
          )}
        </optgroup>
      ))}
    </Choice>
  );
}

function Choices(props: KickoffPlaygroundPanelProps) {
  const { config, onChange } = props;
  const { rosters } = config;
  return (
    <>
      <EventChoice {...props} />
      <Choice
        label="Kicking side"
        value={config.kicking}
        onPick={(side) => {
          onChange({ ...config, kicking: side === "team2" ? "team2" : "team1" });
        }}
      >
        <option value="team1">Home kicks</option>
        <option value="team2">Away kicks</option>
      </Choice>
      <div className="grid grid-cols-2 gap-2">
        <RosterChoice
          label="Home team"
          value={rosters.team1}
          onPick={(team1) => {
            onChange({ ...config, rosters: { ...rosters, team1 } });
          }}
        />
        <RosterChoice
          label="Away team"
          value={rosters.team2}
          onPick={(team2) => {
            onChange({ ...config, rosters: { ...rosters, team2 } });
          }}
        />
      </div>
      <Choice
        label="Players"
        value={String(config.players ?? "")}
        onPick={(count) => {
          onChange({ ...config, players: count === "" ? null : Number(count) });
        }}
      >
        <option value="">Roll the dice</option>
        {PLAYER_COUNTS.map((count) => (
          <option key={count} value={count}>
            Up to {count}
          </option>
        ))}
      </Choice>
    </>
  );
}

export function KickoffPlaygroundPanel(props: KickoffPlaygroundPanelProps) {
  const [open, setOpen] = useState(false);
  const { config, onRestart } = props;
  return (
    <Panel accent="blood" className="pointer-events-auto w-full animate-hud-in">
      <PanelHeader
        as="h3"
        title="Kick-off playground"
        aside={config.scene.group}
      />
      <div
        data-testid="kickoff-playground"
        className="flex flex-col gap-2 p-2.5"
      >
        {open && <Choices {...props} />}
        <div className="flex gap-2">
          <HudButton variant="gold" size="sm" onClick={onRestart}>
            Restart
          </HudButton>
          <HudButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen((shown) => !shown);
            }}
          >
            {open ? "Hide options" : "Change event"}
          </HudButton>
        </div>
      </div>
    </Panel>
  );
}
