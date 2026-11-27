import { useState } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import {
  DEFAULT_GAME_TYPE,
  GAME_TYPES,
  GAME_TYPE_SUMMARIES,
  type GameType,
} from "../../../game/variants/gameTypes";
import { gameTypeRules } from "../../../game/variants/gameTypeRules";
import { PITCH_LAYOUTS, type Venue } from "../../../game/variants/pitchLayouts";
import { venueArtPath } from "../../../game/presentation/matchStyle";
import { cx, hudChoiceClass } from "../componentWarehouse/HudKit";
import { choiceKeys } from "../componentWarehouse/choiceKeys";
import { VenuePicker } from "./VenuePicker";
import { GameTypeName } from "./GameTypeBadge";

const GROUNDS: Record<GameType, string> = {
  sevens: "stadium pitch",
  "gutter-bowl": "street or sewer, chosen or rolled",
  "street-bowl": "street between two walls",
  "beach-bowl": "sand, no casualties",
};

function pitchLine(gameType: GameType): string {
  const [venue] = gameTypeRules(gameType).venues;
  const { cols, rows } = PITCH_LAYOUTS[venue];
  return `${String(cols)} × ${String(rows)} ${GROUNDS[gameType]}`;
}

const cardImage = (venue: Venue) => `${venueArtPath(venue)}/card.webp`;

function PitchPicture({
  venues,
  selected,
}: {
  venues: readonly [Venue, ...Venue[]];
  selected: boolean;
}) {
  const [first, second] = venues;
  const image = cx(
    "absolute inset-0 h-full w-full object-cover transition-[filter,opacity] duration-200",
    selected ? "opacity-100" : "opacity-70 saturate-50"
  );
  return (
    <span className="relative block aspect-video w-full overflow-hidden border-b border-white/10 bg-black">
      <img src={cardImage(first)} alt="" loading="lazy" className={image} />
      {second && (
        <img
          src={cardImage(second)}
          alt=""
          loading="lazy"
          className={cx(
            image,
            "[clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]"
          )}
        />
      )}
    </span>
  );
}

function GameTypeCard({
  gameType,
  selected,
  disabled,
  keys,
  onSelect,
}: {
  gameType: GameType;
  selected: boolean;
  disabled: boolean;
  keys: ReturnType<ReturnType<typeof choiceKeys<GameType>>> & {
    onFocus: () => void;
  };
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      {...keys}
      onClick={onSelect}
      className={cx(hudChoiceClass(selected), "flex flex-col overflow-hidden")}
    >
      <PitchPicture
        venues={gameTypeRules(gameType).venues}
        selected={selected}
      />
      <Title level="row" as="span" className="block px-3 pt-2.5">
        <GameTypeName gameType={gameType} size={20} />
      </Title>
      <span className="block px-3 pb-3 text-hud-sm text-hud-dim">
        {pitchLine(gameType)}
      </span>
    </button>
  );
}

function GameTypeCards({
  value,
  onChange,
  disabled,
  label,
}: {
  value: GameType;
  onChange: (gameType: GameType) => void;
  disabled: boolean;
  label: string;
}) {
  const [tabStop, setTabStop] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setTabStop(value);
  }
  const keys = choiceKeys({
    ids: GAME_TYPES,
    value: tabStop,
    onChange: setTabStop,
  });
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4 phone:landscape:grid-cols-4"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setTabStop(value);
      }}
    >
      {GAME_TYPES.map((gameType) => (
        <GameTypeCard
          key={gameType}
          gameType={gameType}
          selected={value === gameType}
          disabled={disabled}
          keys={{
            ...keys(gameType),
            onFocus: () => {
              setTabStop(gameType);
            },
          }}
          onSelect={() => {
            if (gameType !== value) onChange(gameType);
          }}
        />
      ))}
    </div>
  );
}

export function GameTypeSelector({
  value = DEFAULT_GAME_TYPE,
  onChange,
  disabled = false,
  label,
  venue,
  onVenueChange,
}: {
  value?: GameType;
  onChange: (gameType: GameType) => void;
  disabled?: boolean;
  label?: string;
  venue?: Venue | undefined;
  onVenueChange?: (venue: Venue | undefined) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="hud-label">{label}</span>}
      <GameTypeCards
        value={value}
        onChange={onChange}
        disabled={disabled}
        label={label ?? "Game type"}
      />
      <p className="mt-1.5 font-hud-body text-hud-sm text-hud-dim">
        {GAME_TYPE_SUMMARIES[value]}
      </p>
      {onVenueChange && (
        <VenuePicker
          gameType={value}
          venue={venue}
          onChange={onVenueChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
