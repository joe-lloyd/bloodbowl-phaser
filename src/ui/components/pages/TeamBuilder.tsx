import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Team,
  RosterName,
  createTeam,
  addPlayerToTeam,
  calculateTeamValue,
} from "../../../types/Team";
import { createPlayer } from "../../../types/Player";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import { getTeamMode, isActiveTeam } from "../../../game/rules/teamLifecycle";
import { canEdit } from "../../../game/rules/teamEditLegality";
import {
  StaffItem,
  draftInducementCount,
  priceOf,
  purchase,
} from "../../../game/rules/teamPricing";
import { sevensInducementCatalog } from "../../../game/inducements/catalog";
import { APOTHECARY_COST } from "../../../game/rules/sevensPrices";
import { chooseVeteran } from "../../../game/rules/veteran";
import {
  getRosterByRosterName,
  getAvailableRosterNames,
} from "../../../data/RosterTemplates";
import * as TeamManager from "../../../game/managers/TeamManager";
import {
  cx,
  Field,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";
import { AvailableHires } from "../TeamBuilder/AvailableHires";
import { TeamRoster } from "../TeamBuilder/TeamRoster";
import {
  AdvancementModePanel,
  AdvancementModeSelector,
} from "../TeamBuilder/AdvancementModePanel";
import {
  TeamStatsOverview,
  formatGold,
  numToHex,
} from "../TeamManagement/TeamStatsOverview";
import { lockAdvancementMode } from "../../../types/Team";

// interface TeamBuilderProps {}

const TEAM_COLORS = [
  0x8e1b1b, // Blood Red
  0x1e3a5f, // Ink Blue
  0x556b2f, // Pitch Green
  0xd6b25e, // Gold
  0x2a1f1a, // Text Dark
  0xb32020, // Deep Crimson
  0xe8ddc4, // Warm Paper
  0x6b5e54, // Muted Text
  0xffffff, // White
  0x000000, // Black
];

export function TeamBuilder() {
  const [team, setTeam] = useState<Team | null>(null);
  const [selectedRace, setSelectedRace] = useState<RosterName>(
    RosterName.AMAZON
  );
  const [selectedColor, setSelectedColor] = useState<number>(0x8e1b1b);
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();

  useEffect(() => {
    // Load existing team or create new one
    if (teamId) {
      const teams = TeamManager.loadTeams();
      const existingTeam = teams.find((t) => t.id === teamId);
      if (existingTeam) {
        setTeam(existingTeam);
        setSelectedRace(existingTeam.rosterName);
        setSelectedColor(existingTeam.colors.primary);
        return;
      }
    }

    // Create new team
    const newTeam = createTeam(
      "New Team",
      selectedRace,
      { primary: selectedColor, secondary: 0xffffff },
      50000
    );
    setTeam(newTeam);
  }, [teamId]);

  const handleRaceChange = (race: RosterName) => {
    if (!team) return;

    const decision = canEdit(team, { type: "change-roster-type" });
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }

    if (team.players.length > 0) {
      if (!confirm("Changing race will clear your roster. Continue?")) return;
    }

    setSelectedRace(race);
    const newTeam = createTeam(
      team?.name || "New Team",
      race,
      { primary: selectedColor, secondary: 0xffffff },
      team?.treasury || 50000
    );
    setTeam(newTeam);
  };

  const handleColorChange = (color: number) => {
    setSelectedColor(color);
    if (team) {
      setTeam({
        ...team,
        colors: { ...team.colors, primary: color },
      });
    }
  };

  const handleNameChange = (name: string) => {
    if (team) {
      setTeam({ ...team, name });
    }
  };

  const handleHirePlayer = (positionName: string) => {
    if (!team) return;

    // Check for max roster size first
    if (team.players.length >= 11) {
      alert("Roster full (max 11 players)! Fire someone to make room.");
      return;
    }

    const hireDecision = canEdit(team, { type: "hire-player" });
    if (!hireDecision.allowed) {
      alert(hireDecision.reason);
      return;
    }

    const roster = getRosterByRosterName(selectedRace);
    const template = roster.playerTemplates.find(
      (p) => p.positionName === positionName
    );

    if (!template) return;
    const price = priceOf(team, { type: "player", cost: template.cost });
    if (price.amount == null) {
      alert(price.reason ?? "This player cannot be hired.");
      return;
    }
    if (team.treasury < price.amount) {
      alert("Not enough gold!");
      return;
    }

    // Find the first available number between 1 and 11
    const usedNumbers = new Set(team.players.map((p) => p.number));
    let playerNumber = 1;
    while (usedNumbers.has(playerNumber) && playerNumber <= 11) {
      playerNumber++;
    }

    const player = createPlayer(template, team.id, playerNumber);
    player.cost = price.amount;

    if (addPlayerToTeam(team, player)) {
      setTeam({ ...team });
    }
  };

  const handleFirePlayer = (playerId: string) => {
    if (!team) return;

    const fireDecision = canEdit(team, { type: "fire-player" });
    if (!fireDecision.allowed) {
      alert(fireDecision.reason);
      return;
    }

    const player = team.players.find((p) => p.id === playerId);
    if (!player) return;

    // Only a draft team may let a player go (L6), and it gets a full refund
    // since the roster is still being assembled.
    team.players = team.players.filter((p) => p.id !== playerId);
    team.treasury += Math.floor(player.cost);
    setTeam({ ...team });
  };

  const handleChooseVeteran = (playerId: string) => {
    if (!team) return;
    const decision = chooseVeteran(team, playerId);
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }
    setTeam({ ...team });
  };

  const handleReorderPlayers = (sourceSlot: number, targetSlot: number) => {
    if (!team) return;

    // Deep copy players for safe state mutation
    const newPlayers = team.players.map((p) => ({ ...p }));
    const sourcePlayer = newPlayers.find((p) => p.number === sourceSlot);
    const targetPlayer = newPlayers.find((p) => p.number === targetSlot);

    if (sourcePlayer) {
      sourcePlayer.number = targetSlot;
      // Swap if target exists
      if (targetPlayer) {
        targetPlayer.number = sourceSlot;
      }

      setTeam({
        ...team,
        players: newPlayers,
      });
    }
  };

  const handleBuy = (item: StaffItem) => {
    if (!team) return;
    const result = purchase(team, item);
    if (result.amount == null) {
      alert(result.reason);
      return;
    }
    setTeam({ ...team });
  };

  /**
   * Shared roster legality (roster size, Lineman rule, positional limits,
   * budget), plus the whole-list Insignificant check — the same validator
   * the development seeds and match/competition entry are checked against.
   * A draft may be saved while this is non-empty (1.6): it is only a gate
   * on finalizing for play or competition entry, never on persistence.
   */
  const rosterViolations = (): string[] => {
    if (!team) return [];
    const messages: string[] = [];
    const insignificantError = validateInsignificant(team.players);
    if (insignificantError) messages.push(insignificantError);
    const roster = getRosterByRosterName(team.rosterName);
    messages.push(...validateRosterLegality(team, roster).map((v) => v.detail));
    return messages;
  };

  const handleSave = () => {
    if (!team) return;

    // Draft work may be persisted incomplete or illegal — only play and
    // competition entry require a valid roster (team-lifecycle-modes).
    // Locking is a no-op until a mode has actually been chosen, so this is
    // safe to call unconditionally on every save (team-advancement-modes:
    // the mode is immutable from the moment it's first set).
    lockAdvancementMode(team);

    const teams = TeamManager.loadTeams();
    const existingIndex = teams.findIndex((t) => t.id === team.id);

    if (existingIndex >= 0) {
      teams[existingIndex] = team;
    } else {
      teams.push(team);
    }

    TeamManager.saveTeams(teams);
    navigate("/build-team");
  };

  const handleBack = () => {
    navigate("/build-team");
  };

  const handleApothecaryToggle = () => {
    if (!team) return;
    if (!team.apothecary) {
      handleBuy({ type: "apothecary" });
      return;
    }
    // A draft team may still change its mind and get the gold back.
    if (isActiveTeam(team)) return;
    team.treasury += APOTHECARY_COST;
    team.apothecary = false;
    setTeam({ ...team });
  };

  if (!team) {
    return (
      <PageShell>
        <p className="hud-label">Loading...</p>
      </PageShell>
    );
  }

  const roster = getRosterByRosterName(selectedRace);
  const mode = getTeamMode(team);
  const active = mode === "active";
  const violations = rosterViolations();
  const apothecaryPrice = priceOf(team, { type: "apothecary" });

  return (
    <PageShell
      actionBar={
        <>
          <HudButton variant="ghost" onClick={handleBack}>
            Cancel
          </HudButton>
          <div className="flex items-baseline gap-5 font-hud-label font-bold uppercase tracking-[0.06em]">
            <span>
              <span className="font-hud-display text-hud-xl text-hud-bone">
                {team.players.length}/11
              </span>{" "}
              <span className="hud-label">Players</span>
            </span>
            <span>
              <span className="hud-label">TV</span>{" "}
              <span className="font-hud-display text-hud-xl text-hud-gold">
                {formatGold(calculateTeamValue(team))}
              </span>
            </span>
          </div>
          <HudButton variant="primary" onClick={handleSave}>
            Save Team {violations.length > 0 && "(saved as incomplete draft)"}
          </HudButton>
        </>
      }
    >
      <PageHeader
        eyebrow={`${active ? "Active team" : "Draft team"} · ${team.rosterName}`}
        title="TEAM BUILDER"
        subtitle={
          active
            ? "This team has played its first match. Roster type is locked. Eligible players may still be hired at roster price, and re-rolls and Sideline Staff at their usual prices."
            : "Draft teams may be edited freely and saved even while incomplete, but must pass roster legality before they can be selected for a match or entered in a competition."
        }
      />

      {violations.length > 0 && (
        <Notice
          tone="warn"
          title="Not yet legal for play or competition entry"
          className="mb-6"
        >
          <ul className="list-disc pl-5">
            {violations.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Section
        title="Team details"
        accent={{ color: numToHex(team.colors.primary) }}
      >
        <div className="mb-5 max-w-xl">
          <TeamStatsOverview team={team} />
        </div>
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Team Name">
            <input
              type="text"
              className="hud-field font-hud-label text-base font-bold uppercase tracking-[0.03em]"
              value={team.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter Team Name"
            />
          </Field>
          <Field label="Roster">
            <select
              className="hud-field cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedRace}
              disabled={active}
              title={
                active ? "Active teams cannot change roster type" : undefined
              }
              onChange={(e) => handleRaceChange(e.target.value as RosterName)}
            >
              {getAvailableRosterNames().map((race) => (
                <option key={race} value={race}>
                  {race}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Coach">
            <input
              type="text"
              className="hud-field"
              value={team.coachName || ""}
              onChange={(e) => setTeam({ ...team, coachName: e.target.value })}
              placeholder="Coach Name"
            />
          </Field>
          <Field label="Starting Treasury">
            <input
              type="number"
              step="10000"
              className="hud-field disabled:cursor-not-allowed disabled:opacity-50"
              value={team.startingTreasury}
              disabled={team.players.length > 0}
              onChange={(e) => {
                const newVal = parseInt(e.target.value) || 0;
                setTeam({
                  ...team,
                  startingTreasury: newVal,
                  treasury: newVal, // synchronise current treasury as long as we are in drafting mode and no players bought
                });
              }}
            />
          </Field>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="hud-label">Team Colors</span>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  aria-pressed={selectedColor === color}
                  className={cx(
                    "h-7 w-7 -skew-x-12 rounded-[2px] border transition-[transform,box-shadow] duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold focus-visible:ring-offset-2 focus-visible:ring-offset-hud-ink",
                    selectedColor === color
                      ? "scale-110 border-hud-gold shadow-hud-glow"
                      : "border-white/30"
                  )}
                  style={{ backgroundColor: numToHex(color) }}
                  onClick={() => handleColorChange(color)}
                  title={numToHex(color)}
                />
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <AdvancementModeSelector team={team} onChange={setTeam} />
          </div>
        </div>
      </Section>

      <AdvancementModePanel
        team={team}
        roster={roster}
        onChange={(next) => setTeam(next)}
      />

      <div className="mb-6">
        <AvailableHires
          roster={roster}
          colors={team.colors}
          treasury={team.treasury}
          onHirePlayer={handleHirePlayer}
        />
      </div>

      <div className="mb-6">
        <TeamRoster
          team={team}
          onFirePlayer={handleFirePlayer}
          onReorderPlayers={handleReorderPlayers}
          onChooseVeteran={active ? undefined : handleChooseVeteran}
        />
      </div>

      <Section
        title="Sideline staff"
        aside={`Gold ${formatGold(team.treasury)}`}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StaffCounter
            label="Re-Rolls"
            count={team.rerolls}
            team={team}
            item={{ type: "reroll" }}
            onBuy={handleBuy}
          />
          <label className="flex flex-col gap-1">
            <span className="hud-label">
              Apothecary ({formatGold(APOTHECARY_COST)})
            </span>
            <span className="flex h-11 items-center justify-between rounded-hud border border-white/10 bg-black/35 px-3">
              <span className="font-hud-display text-hud-lg">
                {team.apothecary ? "Yes" : "No"}
              </span>
              <input
                type="checkbox"
                checked={team.apothecary}
                onChange={handleApothecaryToggle}
                disabled={
                  team.apothecary
                    ? active
                    : team.treasury < (apothecaryPrice.amount ?? Infinity)
                }
                title={apothecaryPrice.reason}
                className="hud-check"
              />
            </span>
          </label>
          <StaffCounter
            label="Dedicated Fans"
            count={team.dedicatedFans}
            team={team}
            item={{ type: "dedicated-fan" }}
            onBuy={handleBuy}
          />
          <StaffCounter
            label="Asst. Coaches"
            count={team.coaches}
            team={team}
            item={{ type: "coach" }}
            onBuy={handleBuy}
          />
          <StaffCounter
            label="Cheerleaders"
            count={team.cheerleaders}
            team={team}
            item={{ type: "cheerleader" }}
            onBuy={handleBuy}
          />
        </div>
      </Section>

      {/* Matched Play buys inducements from the draft budget (MP2) */}
      {team.advancementMode === "matched-play" && (
        <Section title="Inducements on the draft list">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {sevensInducementCatalog(team).map((entry) => (
              <StaffCounter
                key={entry.inducement}
                label={entry.inducement}
                count={draftInducementCount(team, entry.inducement)}
                team={team}
                item={{ type: "inducement", inducement: entry.inducement }}
                onBuy={handleBuy}
              />
            ))}
          </div>
        </Section>
      )}
    </PageShell>
  );
}

/** A team asset bought one at a time, with its price and a "+" button. The
 *  price and any refusal come from priceOf, so a reached limit shows as a
 *  disabled button whose tooltip names it. */
function StaffCounter({
  label,
  count,
  team,
  item,
  onBuy,
}: {
  label: string;
  count: number;
  team: Team;
  item: StaffItem;
  onBuy: (item: StaffItem) => void;
}) {
  const price = priceOf(team, item);
  const affordable = price.amount != null && team.treasury >= price.amount;
  // The fullgame e2e driver finds a counter by this wrapper and its label.
  return (
    <div className="flex flex-col gap-1">
      <span className="hud-label">
        {label}
        {price.amount != null && ` (${formatGold(price.amount)})`}
      </span>
      <div className="flex h-11 items-center justify-between rounded-hud border border-white/10 bg-black/35 pl-3 pr-1">
        <span className="font-hud-display text-hud-lg">{count}</span>
        <HudButton
          size="sm"
          variant="secondary"
          className="w-9 !px-0"
          onClick={() => onBuy(item)}
          disabled={!affordable}
          title={price.reason}
        >
          +
        </HudButton>
      </div>
    </div>
  );
}
