import React, { useRef, useState } from "react";
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
}

export const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({
  eventBus,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);
  const [hoveredCrew, setHoveredCrew] = useState<SidelineCrewInfo | null>(null);
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
    const holdsBall =
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
