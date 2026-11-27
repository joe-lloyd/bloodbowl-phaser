import { useState } from "react";
import type { SeasonFormat, Team } from "../../../types/Team";
import { CLUB_GAME_TYPES, gutterLockReason } from "../../../game/rules/club";
import {
  formatGameTypes,
  seasonFormatFor,
  type SeasonMix,
} from "../../../game/rules/seasonFormat";
import { GAME_TYPE_LABELS, type GameType } from "../../../game/variants/gameTypes";
import { HudButton } from "../componentWarehouse/HudKit";
import { GameTypeBadge, GameTypeName } from "../common/GameTypeBadge";

type Change = (format: SeasonFormat) => void;

const MIXES: readonly SeasonMix[] = ["random", "order"];

const MIX_LABELS: Record<SeasonMix, string> = {
  random: "Random each round",
  order: "Set order",
};

const NOTES: Record<SeasonFormat["kind"], string> = {
  single: "Every round and the play-offs use this game type.",
  random:
    "Each round's game type is drawn from these when the round comes up, so nobody knows the next one until the round before it is over. The play-off rounds are drawn the same way.",
  order:
    "Pick the game type for each round. The play-offs start again from the top: the semi-finals use round 1's game type, and the final and third-place game use round 2's.",
};

function openGameTypes(club: Team): GameType[] {
  return CLUB_GAME_TYPES.filter(
    (gameType) => gameType !== "gutter-bowl" || !gutterLockReason(club)
  );
}

function toggled(involved: readonly GameType[], gameType: GameType): GameType[] {
  if (!involved.includes(gameType))
    return CLUB_GAME_TYPES.filter((each) => each === gameType || involved.includes(each));
  return involved.length > 1 ? involved.filter((each) => each !== gameType) : [...involved];
}

function InvolvedChoice({ involved, open, onToggle }: { involved: readonly GameType[]; open: readonly GameType[]; onToggle: (gameType: GameType) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Game types in the season">
      {CLUB_GAME_TYPES.map((gameType) => {
        const picked = involved.includes(gameType);
        return (
          <HudButton
            key={gameType}
            aria-pressed={picked}
            variant={picked ? "selected" : "secondary"}
            disabled={!open.includes(gameType) || (picked && involved.length === 1)}
            onClick={() => {
              onToggle(gameType);
            }}
          >
            <GameTypeName gameType={gameType} size={18} />
          </HudButton>
        );
      })}
    </div>
  );
}

function MixChoice({ value, onPick }: { value: SeasonMix; onPick: (mix: SeasonMix) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How the game types mix">
      {MIXES.map((mix) => (
        <HudButton
          key={mix}
          role="radio"
          aria-checked={mix === value}
          variant={mix === value ? "selected" : "secondary"}
          onClick={() => {
            onPick(mix);
          }}
        >
          {MIX_LABELS[mix]}
        </HudButton>
      ))}
    </div>
  );
}

function RoundRow({ round, value, choices, onPick }: { round: number; value: GameType; choices: readonly GameType[]; onPick: (gameType: GameType) => void }) {
  return (
    <li className="flex items-center gap-3">
      <span className="hud-label w-16 shrink-0">Round {round}</span>
      <span className="flex gap-1.5" role="radiogroup" aria-label={`Round ${String(round)} game type`}>
        {choices.map((gameType) => (
          <HudButton
            key={gameType}
            size="xs"
            role="radio"
            aria-checked={gameType === value}
            aria-label={GAME_TYPE_LABELS[gameType]}
            title={GAME_TYPE_LABELS[gameType]}
            variant={gameType === value ? "selected" : "ghost"}
            onClick={() => {
              onPick(gameType);
            }}
          >
            <GameTypeBadge gameType={gameType} size={20} />
          </HudButton>
        ))}
      </span>
      <span className="hidden font-hud-body text-hud-sm text-hud-dim sm:inline">{GAME_TYPE_LABELS[value]}</span>
    </li>
  );
}

function OrderChoice({ value, choices, onChange }: { value: readonly GameType[]; choices: readonly GameType[]; onChange: Change }) {
  return (
    <ol className="flex flex-col gap-2">
      {value.map((gameType, index) => (
        <RoundRow
          key={index}
          round={index + 1}
          value={gameType}
          choices={choices}
          onPick={(picked) => {
            onChange({ kind: "order", gameTypes: value.map((each, at) => (at === index ? picked : each)) });
          }}
        />
      ))}
    </ol>
  );
}

export function SeasonFormatPicker({ club, value, onChange }: { club: Team; value: SeasonFormat; onChange: Change }) {
  const [involved, setInvolved] = useState(() => formatGameTypes(value));
  const mix: SeasonMix = value.kind === "order" ? "order" : "random";
  const locked = gutterLockReason(club);
  const choose = (next: GameType[], nextMix: SeasonMix) => {
    setInvolved(next);
    onChange(seasonFormatFor(next, nextMix));
  };
  return (
    <div className="flex flex-col gap-3">
      <span className="hud-label">Game types in the season</span>
      <InvolvedChoice
        involved={involved}
        open={openGameTypes(club)}
        onToggle={(gameType) => {
          choose(toggled(involved, gameType), mix);
        }}
      />
      {locked && <p className="font-hud-body text-hud-sm text-hud-dim">{locked}</p>}
      {involved.length > 1 && (
        <MixChoice
          value={mix}
          onPick={(picked) => {
            choose(involved, picked);
          }}
        />
      )}
      <p className="font-hud-body text-hud-sm text-hud-dim">{NOTES[value.kind]}</p>
      {value.kind === "order" && <OrderChoice value={value.gameTypes} choices={involved} onChange={onChange} />}
    </div>
  );
}
