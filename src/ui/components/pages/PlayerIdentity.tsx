import { useState } from "react";
import type { LookOption } from "../../../boundary/layeredArt";
import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { appearanceOf, rollName } from "../../../game/names/playerIdentity";
import { lookOptions } from "../../../game/presentation/layered/layeredModels";
import { modelFor } from "../../../game/presentation/playerArt";
import { HudButton } from "../componentWarehouse/HudButton";

const MAX_NAME = 40;

interface PlayerIdentityProps {
  readonly player: Player;
  readonly team: Team;
  readonly onSaved: () => void;
}

function savePlayer(team: Team, playerId: string, change: (player: Player) => void): void {
  const latest = loadTeams().find((candidate) => candidate.id === team.id);
  const target = latest?.players.find((candidate) => candidate.id === playerId);
  if (!latest || !target) return;
  change(target);
  void saveTeam(latest);
  const shown = team.players.find((candidate) => candidate.id === playerId);
  if (shown) change(shown);
}

function NameEditor({ player, team, onSaved }: PlayerIdentityProps) {
  const [draft, setDraft] = useState(player.playerName);
  const position = { rosterName: team.rosterName, positionName: player.positionName };
  const canRoll = rollName(position, player.appearance) !== undefined;
  const save = (name: string) => {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) return;
    savePlayer(team, player.id, (target) => {
      target.playerName = clean;
    });
    setDraft(clean);
    onSaved();
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(draft);
      }}
    >
      <input
        type="text"
        aria-label="Player name"
        className="hud-field min-w-0 flex-1 font-hud-label text-base font-bold"
        maxLength={MAX_NAME}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <HudButton type="submit" size="sm" disabled={draft.trim() === player.playerName}>
        Rename
      </HudButton>
      {canRoll && (
        <HudButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            save(rollName(position, appearanceOf(player, team.rosterName)) ?? player.playerName);
          }}
        >
          New name
        </HudButton>
      )}
    </form>
  );
}

function OptionCycler({ option, value, onPick }: { option: LookOption; value: string; onPick: (value: string) => void }) {
  const [name, label, values] = option;
  const index = Math.max(0, values.findIndex(([candidate]) => candidate === value));
  const step = (delta: number) => {
    const next = values[(index + delta + values.length) % values.length];
    if (next) onPick(next[0]);
  };
  return (
    <div className="flex items-center gap-2" data-option={name}>
      <span className="hud-label w-16 text-hud-2xs">{label}</span>
      <HudButton type="button" size="sm" variant="ghost" aria-label={`Previous ${label}`} onClick={() => { step(-1); }}>
        ‹
      </HudButton>
      <span className="min-w-28 text-center text-hud-sm text-hud-bone">{values[index]?.[1] ?? ""}</span>
      <HudButton type="button" size="sm" variant="ghost" aria-label={`Next ${label}`} onClick={() => { step(1); }}>
        ›
      </HudButton>
    </div>
  );
}

export function PlayerLookControls({ player, team, onSaved }: PlayerIdentityProps) {
  const options = lookOptions(modelFor(team.rosterName, player.positionName));
  if (options.length === 0) return null;
  const current = appearanceOf(player, team.rosterName) ?? {};
  return (
    <div className="flex flex-col gap-1.5" aria-label="Player look">
      {options.map((option) => (
        <OptionCycler
          key={option[0]}
          option={option}
          value={current[option[0]] ?? option[2][0]?.[0] ?? ""}
          onPick={(value) => {
            savePlayer(team, player.id, (target) => {
              target.appearance = { ...current, [option[0]]: value };
            });
            onSaved();
          }}
        />
      ))}
    </div>
  );
}

export function PlayerNameEditor(props: PlayerIdentityProps) {
  return <NameEditor key={props.player.playerName} {...props} />;
}
