import type { SeasonFormat, Team } from "../../../types/Team";
import { CLUB_GAME_TYPES, gutterLockReason } from "../../../game/rules/club";
import {
  reshapeFormat,
  seasonFormatProblem,
} from "../../../game/rules/seasonFormat";
import { GAME_TYPE_LABELS, type GameType } from "../../../game/variants/gameTypes";
import { HudButton } from "../componentWarehouse/HudKit";
import { GameTypeBadge, GameTypeName } from "../common/GameTypeBadge";

type Kind = SeasonFormat["kind"];
type Change = (format: SeasonFormat) => void;

const KINDS: readonly Kind[] = ["single", "random", "order"];

const KIND_LABELS: Record<Kind, string> = {
  single: "One game type",
  random: "Random each round",
  order: "Set order",
};

const KIND_NOTES: Record<Kind, string> = {
  single: "Every round and the play-offs use the same game type.",
  random:
    "When the season starts, each round's game type is drawn from the ones you pick. The play-off rounds are drawn the same way.",
  order:
    "Pick the game type for each round. The play-offs start again from the top: the semi-finals use round 1's game type, and the final and third-place game use round 2's.",
};

function openGameTypes(club: Team): GameType[] {
  return CLUB_GAME_TYPES.filter(
    (gameType) => gameType !== "gutter-bowl" || !gutterLockReason(club)
  );
}

function KindChoice({ value, onPick }: { value: Kind; onPick: (kind: Kind) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Season format">
      {KINDS.map((kind) => (
        <HudButton
          key={kind}
          role="radio"
          aria-checked={kind === value}
          variant={kind === value ? "selected" : "secondary"}
          onClick={() => {
            onPick(kind);
          }}
        >
          {KIND_LABELS[kind]}
        </HudButton>
      ))}
    </div>
  );
}

function SingleChoice({ value, open, onChange }: { value: GameType; open: readonly GameType[]; onChange: Change }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Game type">
      {CLUB_GAME_TYPES.map((gameType) => (
        <HudButton
          key={gameType}
          role="radio"
          aria-checked={gameType === value}
          variant={gameType === value ? "selected" : "secondary"}
          disabled={!open.includes(gameType)}
          onClick={() => {
            onChange({ kind: "single", gameType });
          }}
        >
          <GameTypeName gameType={gameType} size={18} />
        </HudButton>
      ))}
    </div>
  );
}

function PoolChoice({ value, open, onChange }: { value: readonly GameType[]; open: readonly GameType[]; onChange: Change }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Game types to draw from">
      {CLUB_GAME_TYPES.map((gameType) => {
        const picked = value.includes(gameType);
        return (
          <HudButton
            key={gameType}
            aria-pressed={picked}
            variant={picked ? "selected" : "secondary"}
            disabled={!open.includes(gameType)}
            onClick={() => {
              const gameTypes = picked
                ? value.filter((each) => each !== gameType)
                : CLUB_GAME_TYPES.filter((each) => each === gameType || value.includes(each));
              onChange({ kind: "random", gameTypes });
            }}
          >
            <GameTypeName gameType={gameType} size={18} />
          </HudButton>
        );
      })}
    </div>
  );
}

function RoundRow({ round, value, open, onPick }: { round: number; value: GameType; open: readonly GameType[]; onPick: (gameType: GameType) => void }) {
  return (
    <li className="flex items-center gap-3">
      <span className="hud-label w-16 shrink-0">Round {round}</span>
      <span className="flex gap-1.5" role="radiogroup" aria-label={`Round ${String(round)} game type`}>
        {CLUB_GAME_TYPES.map((gameType) => (
          <HudButton
            key={gameType}
            size="xs"
            role="radio"
            aria-checked={gameType === value}
            aria-label={GAME_TYPE_LABELS[gameType]}
            title={GAME_TYPE_LABELS[gameType]}
            variant={gameType === value ? "selected" : "ghost"}
            disabled={!open.includes(gameType)}
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

function OrderChoice({ value, open, onChange }: { value: readonly GameType[]; open: readonly GameType[]; onChange: Change }) {
  return (
    <ol className="flex flex-col gap-2">
      {value.map((gameType, index) => (
        <RoundRow
          key={index}
          round={index + 1}
          value={gameType}
          open={open}
          onPick={(picked) => {
            onChange({ kind: "order", gameTypes: value.map((each, at) => (at === index ? picked : each)) });
          }}
        />
      ))}
    </ol>
  );
}

function FormatDetail({ value, open, onChange }: { value: SeasonFormat; open: readonly GameType[]; onChange: Change }) {
  switch (value.kind) {
    case "single":
      return <SingleChoice value={value.gameType} open={open} onChange={onChange} />;
    case "random":
      return <PoolChoice value={value.gameTypes} open={open} onChange={onChange} />;
    case "order":
      return <OrderChoice value={value.gameTypes} open={open} onChange={onChange} />;
  }
}

export function SeasonFormatPicker({ club, value, onChange }: { club: Team; value: SeasonFormat; onChange: Change }) {
  const open = openGameTypes(club);
  const locked = gutterLockReason(club);
  const problem = seasonFormatProblem(value);
  return (
    <div className="flex flex-col gap-3">
      <KindChoice value={value.kind} onPick={(kind) => { onChange(reshapeFormat(value, kind, open)); }} />
      <p className="font-hud-body text-hud-sm text-hud-dim">{KIND_NOTES[value.kind]}</p>
      <FormatDetail value={value} open={open} onChange={onChange} />
      {locked && <p className="font-hud-body text-hud-sm text-hud-dim">{locked}</p>}
      {problem && <p className="font-hud-body text-hud-sm text-hud-warn">{problem}</p>}
    </div>
  );
}
