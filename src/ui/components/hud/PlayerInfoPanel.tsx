import type React from "react";
import { type Player, PlayerStatus } from "../../../types/Player";
import type { GameState } from "../../../types/GameState";
import type { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  effectiveAV,
  effectiveMA,
  getDriveEffects,
  type PlayerDriveModifiers,
} from "../../../game/kickoff/driveEffects";
import { rushAllowance } from "../../../game/skills/movement";
import type { SidelineCrewInfo } from "../../../game/presentation/sidelineStaff";
import { Chip, Panel, Stat } from "../componentWarehouse/HudKit";
import {
  useInfoSubjects,
  useHeldStatuses,
  useInfoUpdates,
  type StatusView,
} from "./usePlayerInfo";

interface PlayerInfoPanelProps {
  eventBus: EventBus;

  phone?: boolean;
}

export const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({
  eventBus,
  phone = false,
}) => {
  const subjects = useInfoSubjects(eventBus, phone);
  const { selectedPlayer, hoveredPlayer, hoveredCrew } = subjects;
  const shownStatus = useHeldStatuses(eventBus);
  useInfoUpdates(eventBus);
  const renderPanel = (player: Player, isComparison: boolean) => (
    <PlayerCard
      key={player.id}
      player={player}
      isComparison={isComparison}
      status={shownStatus(player)}
    />
  );

  if (phone)
    return <PhonePlayerPanels subjects={subjects} renderPanel={renderPanel} />;

  return (
    <div className="flex w-full shrink-0 flex-col items-end gap-3 empty:hidden">
      {selectedPlayer && renderPanel(selectedPlayer, false)}
      {hoveredPlayer &&
        hoveredPlayer.id !== selectedPlayer?.id &&
        renderPanel(hoveredPlayer, selectedPlayer != null)}
      {hoveredCrew && <CrewPanel crew={hoveredCrew} />}
    </div>
  );
};

function cardReadings(player: Player, isComparison: boolean) {
  const state = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getState()
    : null;
  return {
    ma: state ? effectiveMA(player, state) : player.stats.MA,
    av: state ? effectiveAV(player, state) : player.stats.AV,
    driveModifier: state
      ? getDriveEffects(state).playerModifiers[player.id]
      : undefined,
    used: state?.turn.movementUsed.get(player.id) ?? 0,
    activating: !isComparison && state?.activePlayer?.id === player.id,
    holdsBall: holdsBall(player, state),
  };
}

function holdsBall(player: Player, state: GameState | null): boolean {
  const pending = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getDecisionService().pending()
    : null;
  const pickingUp =
    pending?.type === "reroll" &&
    pending.rollKind === "pickup" &&
    pending.playerId === player.id;
  return (
    !pickingUp &&
    player.status === PlayerStatus.ACTIVE &&
    player.gridPosition != null &&
    state?.ballPosition?.x === player.gridPosition.x &&
    state?.ballPosition?.y === player.gridPosition.y
  );
}

function PlayerCard({
  player,
  isComparison,
  status,
}: {
  player: Player;
  isComparison: boolean;
  status: StatusView;
}) {
  const { ma, av, driveModifier, used, activating, holdsBall } = cardReadings(
    player,
    isComparison
  );
  return (
    <Panel
      accent={isComparison ? "info" : "gold"}
      className="w-full pointer-events-none animate-hud-in px-3 pb-3 pt-3"
    >
      <CardHeader player={player} isComparison={isComparison} />

      <div className="mt-2.5 flex gap-1">
        <Stat
          label="MA"
          value={ma}
          {...(ma < player.stats.MA
            ? { tone: "warn", title: `Base ${String(player.stats.MA)}` }
            : {})}
        />
        <Stat label="ST" value={player.stats.ST} />
        <Stat label="AG" value={`${String(player.stats.AG)}+`} />
        <Stat
          label="PA"
          value={player.stats.PA > 0 ? `${String(player.stats.PA)}+` : "-"}
        />
        <Stat
          label="AV"
          value={av}
          {...(av < player.stats.AV
            ? { tone: "warn", title: `Base ${String(player.stats.AV)}` }
            : {})}
        />
      </div>

      {(activating || holdsBall) && (
        <div
          data-testid="player-activation-info"
          className="mt-2 flex flex-wrap items-center gap-1.5 text-hud-sm text-hud-bone"
        >
          {activating && (
            <span data-testid="movement-left">
              MA {ma}, {Math.max(0, ma - used)} left,{" "}
              {Math.max(0, rushAllowance(player) - Math.max(0, used - ma))} rush
            </span>
          )}
          {holdsBall && <Chip tone="gold">Holding ball</Chip>}
        </div>
      )}

      {driveModifier && <DodgySnack modifier={driveModifier} />}

      <div className="mt-2.5">
        <span className="hud-label mb-1 block text-hud-2xs">Skills</span>
        <div className="text-hud-sm leading-snug text-hud-bone">
          {player.skills.length > 0
            ? player.skills.map((s) => s.type).join(", ")
            : "No skills"}
        </div>
      </div>

      {status.status !== PlayerStatus.ACTIVE && <StatusRow status={status} />}

      {(player.conditions?.length ?? 0) > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <Chip tone="skill">
            {player.conditions?.map((c) => c.type).join(", ")}
          </Chip>
        </div>
      )}
    </Panel>
  );
}

function CardHeader({
  player,
  isComparison,
}: {
  player: Player;
  isComparison: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-9 min-w-[36px] items-center justify-center rounded-hud border font-hud-display text-hud-lg leading-none ${
          isComparison
            ? "border-hud-info/60 text-hud-info"
            : "border-hud-gold/60 text-hud-gold"
        }`}
      >
        #{player.number}
      </span>
      <div className="min-w-0 flex-1">
        {isComparison && (
          <span className="hud-label block text-hud-2xs text-hud-info">
            COMPARING
          </span>
        )}
        <div className="truncate font-hud-label text-hud-lg font-bold uppercase leading-tight tracking-[0.03em] text-hud-bone">
          {player.playerName}
        </div>
        <div className="truncate text-hud-sm text-hud-dim">
          {player.positionName}
          {player.level > 1 && ` • Lvl ${String(player.level)}`}
          {player.spp > 0 && ` • ${String(player.spp)} SPP`}
        </div>
      </div>
    </div>
  );
}

function DodgySnack({ modifier }: { modifier: PlayerDriveModifiers }) {
  return (
    <div className="mt-2 rounded-hud border border-hud-warn/50 bg-hud-warn/10 px-2 py-1 text-hud-sm font-semibold text-hud-warn">
      Dodgy Snack:{" "}
      {modifier.confinedToReserves
        ? "confined to Reserves for this drive"
        : `${String(modifier.maModifier ?? 0)} MA, ${String(modifier.avModifier ?? 0)} AV for this drive`}
    </div>
  );
}

function StatusRow({ status }: { status: StatusView }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
      <span data-testid="player-status" className="inline-flex">
        <Chip tone={status.status === PlayerStatus.RESERVE ? "neutral" : "bad"}>
          {status.status}
        </Chip>
      </span>
      {status.injuries.length > 0 && (
        <span className="text-hud-sm text-hud-bad-soft">
          {status.injuries.join(", ")}
        </span>
      )}
    </div>
  );
}

function PlayerChip({
  player,
  chipRef,
  onToggle,
}: {
  player: Player;
  chipRef: React.RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
}) {
  const state = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getState()
    : null;
  const ma = state ? effectiveMA(player, state) : player.stats.MA;
  const av = state ? effectiveAV(player, state) : player.stats.AV;
  const used = state?.turn.movementUsed.get(player.id) ?? 0;
  const activating = state?.activePlayer?.id === player.id;
  return (
    <button
      ref={chipRef}
      type="button"
      data-testid="player-chip"
      aria-label={`${player.playerName}, show card`}
      onClick={() => {
        onToggle();
      }}
      className="hud-slab flex w-[148px] flex-col items-start gap-1 px-2 py-1.5 text-left pointer-events-auto animate-hud-in"
    >
      <span className="flex w-full items-center gap-1.5">
        <span className="flex h-7 min-w-[28px] items-center justify-center rounded-hud border border-hud-gold/60 font-hud-display text-hud-base leading-none text-hud-gold">
          {player.number}
        </span>
        <span className="min-w-0 flex-1 truncate font-hud-label text-hud-sm font-bold uppercase leading-tight text-hud-bone">
          {player.positionName}
        </span>
      </span>
      <span className="flex flex-wrap gap-x-2 font-hud-label text-hud-xs font-semibold leading-tight text-hud-dim">
        {[
          ["MA", ma],
          ["ST", player.stats.ST],
          ["AG", `${String(player.stats.AG)}+`],
          ["PA", player.stats.PA > 0 ? `${String(player.stats.PA)}+` : "-"],
          ["AV", av],
        ].map(([label, value]) => (
          <span
            {...(label === undefined ? {} : { key: label })}
            className="whitespace-nowrap"
          >
            {label} <span className="text-hud-bone">{value}</span>
          </span>
        ))}
      </span>
      {activating && (
        <span
          data-testid="movement-left"
          className="font-hud-label text-hud-xs font-bold text-hud-gold"
        >
          {Math.max(0, ma - used)} left,{" "}
          {Math.max(0, rushAllowance(player) - Math.max(0, used - ma))} rush
        </span>
      )}
    </button>
  );
}
function CrewPanel({ crew }: { crew: SidelineCrewInfo }) {
  return (
    <Panel
      key="sideline-crew"
      accent="gold"
      className="w-full pointer-events-none animate-hud-in px-3 pb-3 pt-3"
    >
      <div className="font-hud-label text-hud-lg font-bold uppercase leading-tight tracking-[0.03em] text-hud-gold">
        {crew.name}
      </div>
      {crew.type !== null && (
        <div className="text-hud-sm text-hud-dim">
          {crew.count} on this team
        </div>
      )}
      <div className="mt-2 border-t border-white/10 pt-2 text-hud-sm leading-snug text-hud-bone">
        {crew.effect}
      </div>
    </Panel>
  );
}

interface PhonePlayerPanelsProps {
  subjects: ReturnType<typeof useInfoSubjects>;
  renderPanel: (player: Player, comparison: boolean) => React.ReactNode;
}
function PhonePlayerPanels({ subjects, renderPanel }: PhonePlayerPanelsProps) {
  const {
    selectedPlayer,
    hoveredPlayer,
    hoveredCrew,
    chipOpened,
    chipRef,
    cardRef,
    cardShown,
    setChipOpened,
    setHoveredPlayer,
    setHoveredCrew,
  } = subjects;
  const cardPlayer = chipOpened ? selectedPlayer : hoveredPlayer;
  return (
    <div className="flex flex-col items-start empty:hidden">
      {selectedPlayer && (
        <PlayerChip
          player={selectedPlayer}
          chipRef={chipRef}
          onToggle={() => {
            setChipOpened((open) => !open);
          }}
        />
      )}
      {cardShown && (cardPlayer || hoveredCrew) && (
        <div
          ref={cardRef}
          data-testid="player-card"
          role="dialog"
          aria-label="Player card"
          onClick={() => {
            setChipOpened(false);
            setHoveredPlayer(null);
            setHoveredCrew(null);
          }}
          className="phone-card hud-scroll fixed z-[60] w-[min(300px,80vw)] landscape:w-[min(300px,60vw)] overflow-y-auto pointer-events-auto"
        >
          {cardPlayer
            ? renderPanel(cardPlayer, false)
            : hoveredCrew && <CrewPanel crew={hoveredCrew} />}
        </div>
      )}
    </div>
  );
}
