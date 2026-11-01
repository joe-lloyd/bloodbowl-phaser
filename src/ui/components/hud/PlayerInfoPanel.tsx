import React, { useEffect, useRef, useState } from "react";
import { Player, PlayerStatus } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames, InfoPanelSubject } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import {
  effectiveAV,
  effectiveMA,
  getDriveEffects,
} from "../../../game/kickoff/driveEffects";
import { rushAllowance } from "../../../game/skills/movement";
import { SidelineCrewInfo } from "../../../game/presentation/sidelineStaff";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import { Chip, Panel, Stat } from "../componentWarehouse/HudKit";

/** The part of a player the card shows only once the dice have landed. */
type StatusView = Pick<Player, "status" | "injuries">;

const statusView = (player: Player): StatusView => ({
  status: player.status,
  injuries: [...player.injuries],
});

interface PlayerInfoPanelProps {
  eventBus: EventBus;
  /**
   * A phone has no hover: a small chip for the selected player, and the
   * full card over the board on a tap of the chip or a press and hold on a
   * player. A press anywhere else puts the card away.
   */
  phone?: boolean;
}

export const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({
  eventBus,
  phone = false,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);
  const [hoveredCrew, setHoveredCrew] = useState<SidelineCrewInfo | null>(null);
  const [chipOpened, setChipOpened] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const cardShown = phone && (chipOpened || !!hoveredPlayer || !!hoveredCrew);
  useEffect(() => {
    if (!cardShown) return;
    const putAway = (event: Event) => {
      const target = event.target as Node;
      // The chip toggles the card itself
      if (cardRef.current?.contains(target)) return;
      if (chipRef.current?.contains(target)) return;
      setChipOpened(false);
      setHoveredPlayer(null);
      setHoveredCrew(null);
    };
    // Capture: before the board or a panel sees the press
    window.addEventListener("pointerdown", putAway, true);
    return () => window.removeEventListener("pointerdown", putAway, true);
  }, [cardShown]);
  const [, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((tick) => tick + 1);

  // The engine settles a fall or an injury at once, while the dice that
  // decide it still roll in the tray. A roll is thrown before the engine
  // applies what it decides, so the card keeps every player's status as it
  // stood when each roll was thrown, keyed by the roll's number. It shows
  // the one from the first roll still in the air: every landed roll's
  // effect, and none of the rest. This needs no status event, so a foul's
  // Stunned waits for its injury die too. With no tray (headless runs, unit
  // tests) nothing is ever thrown and the card shows the live status.
  const dice = DiceWatch.shared(eventBus);
  const atThrow = useRef(new Map<number, Map<string, StatusView>>());
  const lastThrown = useRef(0);
  const releaseThrough = (seq: number) => {
    for (const key of atThrow.current.keys())
      if (key <= seq) atThrow.current.delete(key);
    refresh();
  };
  useEventBus(
    eventBus,
    GameEventNames.UI_DiceInAir,
    ({ thrown, landedThrough }) => {
      if (thrown > lastThrown.current && ServiceContainer.isInitialized()) {
        const now = new Map(
          ServiceContainer.getInstance()
            .gameService.getTeams()
            .flatMap((team) => team.players)
            .map((player) => [player.id, statusView(player)])
        );
        for (let seq = lastThrown.current + 1; seq <= thrown; seq++)
          atThrow.current.set(seq, now);
        // A tray that goes quiet: release with the log and the banners when
        // the shared watch gives up. Wait a tick so it has seen this throw.
        queueMicrotask(
          () => void dice.landed().then(() => releaseThrough(thrown))
        );
      }
      lastThrown.current = Math.max(lastThrown.current, thrown);
      releaseThrough(landedThrough);
    }
  );
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, refresh);
  const forgetHeld = () => {
    atThrow.current.clear();
    refresh();
  };
  const shownStatus = (player: Player): StatusView => {
    // Map keys keep their insertion order, which is the order thrown
    const firstInAir = atThrow.current.values().next();
    return (
      (firstInAir.done ? undefined : firstInAir.value.get(player.id)) ??
      statusView(player)
    );
  };
  // Hover Events
  useEventBus(eventBus, GameEventNames.UI_ShowPlayerInfo, (player: Player) => {
    setHoveredPlayer(player);
    setHoveredCrew(null);
  });

  // A non-player subject (currently only sideline crew) fills the same
  // panel slot as a hovered player, without disturbing the selection.
  useEventBus(
    eventBus,
    GameEventNames.UI_ShowInfo,
    (subject: InfoPanelSubject) => {
      if (subject.kind === "player") {
        setHoveredPlayer(subject.player);
        setHoveredCrew(null);
      } else {
        setHoveredCrew(subject.crew);
        setHoveredPlayer(null);
      }
    }
  );

  useEventBus(eventBus, GameEventNames.UI_HidePlayerInfo, () => {
    setHoveredPlayer(null);
    setHoveredCrew(null);
  });

  // A hover from the last turn is stale once the turn passes: the pointer
  // may still rest on that player, so no pointer-out ever clears it
  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setHoveredPlayer(null);
    setHoveredCrew(null);
  });

  // Selection Events
  // Note: We use 'playerSelected' from GameEvents (emitted by Controller)
  // Payload is { player: Player } or { player: null } for deselect (via our manual emission in Deselect)
  // Verify event payload structure in Controller!
  useEventBus(
    eventBus,
    GameEventNames.PlayerSelected,
    (data: { player: Player | null }) => {
      setSelectedPlayer(data.player);
      setChipOpened(false);
    }
  );
  useEventBus(eventBus, GameEventNames.PlayerMoved, refresh);
  useEventBus(eventBus, GameEventNames.PlayerActivated, refresh);
  useEventBus(eventBus, GameEventNames.TurnDataUpdated, refresh);
  useEventBus(eventBus, GameEventNames.TurnStarted, refresh);
  useEventBus(eventBus, GameEventNames.ActionResolved, refresh);
  useEventBus(eventBus, GameEventNames.BallPickup, refresh);
  useEventBus(eventBus, GameEventNames.BallPlaced, refresh);
  useEventBus(eventBus, GameEventNames.BallScattered, refresh);
  useEventBus(eventBus, GameEventNames.DriveEffectExpired, refresh);
  useEventBus(eventBus, GameEventNames.DriveEffectGranted, refresh);
  useEventBus(eventBus, GameEventNames.GameStateRestored, forgetHeld);
  useEventBus(eventBus, GameEventNames.ScenarioLoaded, forgetHeld);

  // Logic (top-to-bottom order: kickoff panel, selected, hovered — see
  // GameHUD.tsx and the container's flex-col below):
  // 1. If Selected exists, it is ALWAYS shown, above any hovered panel.
  // 2. If Hovered exists AND Hovered != Selected, it is shown as COMPARING,
  //    below the selected panel.
  // 3. If NO Selected, Hovered is shown normally in the selected panel's slot.

  const renderPanel = (player: Player, isComparison: boolean) => {
    const state = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService.getState()
      : null;
    const ma = state ? effectiveMA(player, state) : player.stats.MA;
    const av = state ? effectiveAV(player, state) : player.stats.AV;
    const driveModifier = state
      ? getDriveEffects(state).playerModifiers[player.id]
      : undefined;
    const used = state?.turn.movementUsed.get(player.id) ?? 0;
    const activating = !isComparison && state?.activePlayer?.id === player.id;
    // A failed pickup waiting on its re-roll leaves the ball on the square,
    // not in the player's hands
    const pending = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService.getDecisionService().pending()
      : null;
    const pickingUp =
      pending?.type === "reroll" &&
      pending.rollKind === "pickup" &&
      pending.playerId === player.id;
    const holdsBall =
      !pickingUp &&
      player.status === PlayerStatus.ACTIVE &&
      player.gridPosition != null &&
      state?.ballPosition?.x === player.gridPosition.x &&
      state?.ballPosition?.y === player.gridPosition.y;
    const status = shownStatus(player);
    const lowered = (value: number, base: number) =>
      value < base ? "warn" : undefined;

    return (
      <Panel
        key={player.id}
        accent={isComparison ? "info" : "gold"}
        className="w-full pointer-events-none animate-hud-in px-3 pb-3 pt-3"
      >
        {/* Header */}
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
              {player.level > 1 && ` • Lvl ${player.level}`}
              {player.spp > 0 && ` • ${player.spp} SPP`}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-2.5 flex gap-1">
          <Stat
            label="MA"
            value={ma}
            tone={lowered(ma, player.stats.MA)}
            title={ma < player.stats.MA ? `Base ${player.stats.MA}` : undefined}
          />
          <Stat label="ST" value={player.stats.ST} />
          <Stat label="AG" value={`${player.stats.AG}+`} />
          <Stat
            label="PA"
            value={player.stats.PA > 0 ? `${player.stats.PA}+` : "-"}
          />
          <Stat
            label="AV"
            value={av}
            tone={lowered(av, player.stats.AV)}
            title={av < player.stats.AV ? `Base ${player.stats.AV}` : undefined}
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
                {Math.max(0, rushAllowance(player) - Math.max(0, used - ma))}{" "}
                rush
              </span>
            )}
            {holdsBall && <Chip tone="gold">Holding ball</Chip>}
          </div>
        )}

        {driveModifier && (
          <div className="mt-2 rounded-hud border border-hud-warn/50 bg-hud-warn/10 px-2 py-1 text-hud-sm font-semibold text-hud-warn">
            Dodgy Snack:{" "}
            {driveModifier.confinedToReserves
              ? "confined to Reserves for this drive"
              : `${driveModifier.maModifier ?? 0} MA, ${driveModifier.avModifier ?? 0} AV for this drive`}
          </div>
        )}

        {/* Skills */}
        <div className="mt-2.5">
          <span className="hud-label mb-1 block text-hud-2xs">Skills</span>
          <div className="text-hud-sm leading-snug text-hud-bone">
            {player.skills.length > 0
              ? player.skills.map((s) => s.type).join(", ")
              : "No skills"}
          </div>
        </div>

        {/* Status (if not active) */}
        {status.status !== PlayerStatus.ACTIVE && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
            <span data-testid="player-status" className="inline-flex">
              <Chip
                tone={
                  status.status === PlayerStatus.RESERVE ? "neutral" : "bad"
                }
              >
                {status.status}
              </Chip>
            </span>
            {status.injuries.length > 0 && (
              <span className="text-hud-sm text-hud-bad-soft">
                {status.injuries.join(", ")}
              </span>
            )}
          </div>
        )}

        {/* Conditions (Distracted, Rooted, ...) — a Standing player can
            still carry one of these, so this is independent of Status */}
        {(player.conditions?.length ?? 0) > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <Chip tone="skill">
              {player.conditions!.map((c) => c.type).join(", ")}
            </Chip>
          </div>
        )}
      </Panel>
    );
  };

  /** The selected player in a thumb's width: tap it for the full card. */
  const renderChip = (player: Player) => {
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
        onClick={() => setChipOpened((open) => !open)}
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
            ["AG", `${player.stats.AG}+`],
            ["PA", player.stats.PA > 0 ? `${player.stats.PA}+` : "-"],
            ["AV", av],
          ].map(([label, value]) => (
            <span key={label} className="whitespace-nowrap">
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
  };

  // A sideline crew figure (or the NO STAFF placeholder) renders name, its
  // match effect, and the team's real count — no statline, skills, or
  // player status, since it is not a player.
  const renderCrewPanel = (crew: SidelineCrewInfo) => (
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

  if (phone) {
    const cardPlayer = chipOpened ? selectedPlayer : hoveredPlayer;
    return (
      <div className="flex flex-col items-start empty:hidden">
        {selectedPlayer && renderChip(selectedPlayer)}
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
            className="hud-scroll fixed z-[60] max-h-[calc(100dvh-80px)] w-[min(300px,60vw)] overflow-y-auto pointer-events-auto"
            style={{
              left: "calc(env(safe-area-inset-left) + 8px)",
              top: "calc(env(safe-area-inset-top) + 60px)",
            }}
          >
            {cardPlayer
              ? renderPanel(cardPlayer, false)
              : hoveredCrew && renderCrewPanel(hoveredCrew)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-end gap-3 empty:hidden">
      {selectedPlayer && renderPanel(selectedPlayer, false)}
      {hoveredPlayer &&
        hoveredPlayer.id !== selectedPlayer?.id &&
        renderPanel(hoveredPlayer, selectedPlayer != null)}
      {hoveredCrew && renderCrewPanel(hoveredCrew)}
    </div>
  );
};
