import { useState } from "react";
import type { LookOption } from "../../../boundary/layeredArt";
import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { appearanceOf, rollName } from "../../../game/names/playerIdentity";
import { nameBookFor } from "../../../game/names/playerNames";
import { lookOptions } from "../../../game/presentation/layered/layeredModels";
import { modelFor } from "../../../game/presentation/playerArt";
import { HudButton } from "../componentWarehouse/HudButton";
import { Notice } from "../componentWarehouse/HudKit";
import { commitPlayerChange } from "../hud/commitPlayerChange";

const MAX_NAME = 40;

interface PlayerIdentityProps {
  readonly player: Player;
  readonly team: Team;
  readonly onSaved: () => void;
}

function useSave({ player, team, onSaved }: PlayerIdentityProps) {
  const [error, setError] = useState("");
  const save = async (change: (target: Player) => void): Promise<boolean> => {
    try {
      await commitPlayerChange(team, player.id, (_latestTeam, target) => {
        change(target);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
    setError("");
    onSaved();
    return true;
  };
  return { save, error };
}

function SaveError({ error }: { readonly error: string }) {
  return error ? (
    <Notice tone="bad" role="alert" className="w-full">
      {error}
    </Notice>
  ) : null;
}

function NameEditor(props: PlayerIdentityProps) {
  const { player, team } = props;
  const [draft, setDraft] = useState(player.playerName);
  const { save: commit, error } = useSave(props);
  const position = { rosterName: team.rosterName, positionName: player.positionName };
  const canRoll = nameBookFor(team.rosterName, player.positionName) !== undefined;
  const save = async (name: string) => {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) return;
    const saved = await commit((target) => {
      target.playerName = clean;
    });
    if (saved) setDraft(clean);
  };
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(draft);
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
            void save(rollName(position, appearanceOf(player, team.rosterName)) ?? player.playerName);
          }}
        >
          New name
        </HudButton>
      )}
      <SaveError error={error} />
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

export function PlayerLookControls(props: PlayerIdentityProps) {
  const { player, team } = props;
  const { save, error } = useSave(props);
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
            void save((target) => {
              target.appearance = { ...current, [option[0]]: value };
            });
          }}
        />
      ))}
      <SaveError error={error} />
    </div>
  );
}

export function PlayerNameEditor(props: PlayerIdentityProps) {
  return <NameEditor key={props.player.playerName} {...props} />;
}
