import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Team, RosterName, createTeam } from "../../../types/Team";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import {
  TeamMode,
  getTeamMode,
  isActiveTeam,
} from "../../../game/rules/teamLifecycle";
import { canEdit } from "../../../game/rules/teamEditLegality";
import {
  StaffItem,
  hirePlayer,
  hireRefusal,
  purchase,
} from "../../../game/rules/teamPricing";
import { APOTHECARY_COST } from "../../../game/rules/sevensPrices";
import { chooseVeteran } from "../../../game/rules/veteran";
import {
  chooseTeamCaptain,
  hasTeamCaptainRule,
} from "../../../game/rules/teamCaptain";
import {
  chooseFavouredOf,
  chooseLeague,
} from "../../../game/rules/teamAllegiance";
import { getRosterByRosterName } from "../../../data/RosterTemplates";
import * as TeamManager from "../../../game/managers/TeamManager";
import { dehydrateTeam } from "../../../data/persistence/teamPersistence";
import {
  EmptyState,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";
import { AvailableHires } from "../TeamBuilder/AvailableHires";
import { TeamRoster } from "../TeamBuilder/TeamRoster";
import { AdvancementModePanel } from "../TeamBuilder/AdvancementModePanel";
import { TeamBuilderActionBar } from "../TeamBuilder/TeamBuilderActionBar";
import { PostMatchSection } from "../TeamBuilder/PostMatchSection";
import { MainChoicesSection } from "../TeamBuilder/MainChoicesSection";
import { TeamDetailsSection } from "../TeamBuilder/TeamDetailsSection";
import {
  DraftInducementsSection,
  SidelineStaffSection,
} from "../TeamBuilder/SidelineStaffSection";
import {
  FavouredOfRule,
  League,
  lockAdvancementMode,
} from "../../../types/Team";
import { mustAdvance } from "../../../game/progression/progression";
import {
  clearUnneededExpensiveMistakes,
  describeExpensiveMistakes,
  resolveExpensiveMistakes,
  rollsForExpensiveMistakes,
  stepsBeforeExpensiveMistakes,
} from "../../../game/rules/expensiveMistakes";
import { RNGService } from "../../../services/rng/RNGService";
import { RosterPicker } from "../TeamBuilder/RosterPicker";
import { PlayedGames } from "../TeamManagement/PlayedGames";
import { PendingDevelopmentPanel } from "../TeamManagement/PendingDevelopmentPanel";
import { TeamLibraryUnavailable } from "../TeamManagement/TeamLibraryUnavailable";

// interface TeamBuilderProps {}

const MODE_EYEBROWS: Record<TeamMode, string> = {
  active: "Active team",
  draft: "Draft team",
};

const MODE_SUBTITLES: Record<TeamMode, string> = {
  active:
    "This team has played its first match. Roster type is locked and nobody can be fired. Between league fixtures, spend the Treasury on players at roster price, and on re-rolls and Sideline Staff at their Sevens prices, within the roster limits.",
  draft:
    "Draft teams may be edited freely and saved even while incomplete, but must pass roster legality before they can be selected for a match or entered in a competition.",
};

/** A comparable copy of what storage would hold for this team. */
function snapshotOf(team: Team): string {
  return JSON.stringify(dehydrateTeam(team));
}

/** Whether storage already holds exactly this team. */
function isStored(current: Team): boolean {
  const stored = TeamManager.loadTeams().find((t) => t.id === current.id);
  return !!stored && snapshotOf(stored) === snapshotOf(current);
}

/** Write the team to storage (shared by Save and opening a player). */
function persistTeam(toSave: Team) {
  // Draft work may be persisted incomplete or illegal — only play and
  // competition entry require a valid roster (team-lifecycle-modes).
  // Locking is a no-op until a mode has actually been chosen, so this is
  // safe to call unconditionally on every save (team-advancement-modes:
  // the mode is immutable from the moment it's first set).
  lockAdvancementMode(toSave);

  const teams = TeamManager.loadTeams();
  const existingIndex = teams.findIndex((t) => t.id === toSave.id);

  if (existingIndex >= 0) {
    teams[existingIndex] = toSave;
  } else {
    teams.push(toSave);
  }

  return TeamManager.saveTeams(teams);
}

/** Saving locks a chosen mode; an unsaved team must stay changeable. */
function restoreAdvancementLock(
  team: Team,
  wasLocked: Team["advancementModeLocked"]
): void {
  if (wasLocked) team.advancementModeLocked = wasLocked;
  else delete team.advancementModeLocked;
}

/** Development a coach must finish before Finish post-match can save. */
function developmentPending(team: Team): boolean {
  return (
    stepsBeforeExpensiveMistakes(team) > 0 || team.players.some(mustAdvance)
  );
}

function hasPendingExpensiveMistakes(team: Team): boolean {
  return (
    !!team.pendingDevelopment?.some(
      (entry) => entry.kind === "expensive-mistakes"
    ) && rollsForExpensiveMistakes(team.treasury)
  );
}

/** Roll every pending Expensive Mistakes entry once nothing else waits. */
function rollExpensiveMistakes(team: Team): string[] {
  const results: string[] = [];
  if (stepsBeforeExpensiveMistakes(team) > 0) return results;
  const rng = new RNGService(Date.now());
  for (const entry of [...(team.pendingDevelopment ?? [])]) {
    if (entry.kind !== "expensive-mistakes") continue;
    results.push(
      describeExpensiveMistakes(resolveExpensiveMistakes(team, entry, rng))
    );
  }
  return results;
}

/** What the URL says about a post-match visit and where it returns to. */
function readSearch(search: string, teamId: string | undefined) {
  const searchParams = new URLSearchParams(search);
  const returnTo = searchParams.get("returnTo") ?? "";
  return {
    searchParams,
    postMatch: searchParams.get("postMatch") === "1",
    destination: /^\/leagues\/[^/?#]+$/.test(returnTo)
      ? returnTo
      : "/build-team",
    matchWinnings: searchParams.get(`winnings-${teamId ?? ""}`),
  };
}

/** Why a team's page has no team to show yet. */
type TeamPendingView = "loading" | "missing" | "failed";

/**
 * What a team's page shows before it has the team: loading while the
 * library may still arrive, "not found" once it has settled without it,
 * and a retry when the coach's library failed to load. Never another team
 * (or an older local copy of this one) in its place.
 */
function TeamPending({
  view,
  onBack,
}: {
  view: TeamPendingView;
  onBack: () => void;
}) {
  if (view === "loading") {
    return (
      <PageShell>
        <p className="hud-label">Loading team...</p>
      </PageShell>
    );
  }
  if (view === "failed") {
    return (
      <PageShell width="narrow" className="flex flex-col justify-center">
        <TeamLibraryUnavailable
          action={
            <HudButton variant="ghost" onClick={onBack}>
              Back to Team Management
            </HudButton>
          }
        />
      </PageShell>
    );
  }
  return (
    <PageShell width="narrow" className="flex flex-col justify-center">
      <EmptyState
        title="Team not found"
        titleAs="h2"
        action={
          <HudButton variant="ghost" onClick={onBack}>
            Back to Team Management
          </HudButton>
        }
      >
        No saved team has this ID. It may have been deleted, or saved while
        signed in to another account.
      </EmptyState>
    </PageShell>
  );
}

export function TeamBuilder() {
  const [team, setTeam] = useState<Team | null>(null);
  /** Why the route's team is not shown yet. */
  const [pendingView, setPendingView] = useState<TeamPendingView>("loading");
  const [selectedRace, setSelectedRace] = useState<RosterName>(
    RosterName.AMAZON
  );
  const [selectedColor, setSelectedColor] = useState<number>(0x8e1b1b);
  /** A new team picks its roster before anything else. */
  const [rosterChosen, setRosterChosen] = useState(true);
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();
  const { search } = useLocation();
  const { searchParams, postMatch, destination, matchWinnings } = readSearch(
    search,
    teamId
  );
  const [completion, setCompletion] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  // What storage held when this team was loaded or last saved from here.
  // Kept as a string because a cloud repository hands out its cached team
  // objects, which this page then edits in place.
  const savedSnapshot = useRef<string | null>(null);

  useEffect(() => {
    setCompletion("");
    setSaveError("");
    setPendingView("loading");
    if (teamId) {
      // A team's page only ever shows that team, read from the coach's
      // settled library. After a refresh a signed-in coach's cloud library
      // arrives a moment after this page mounts; until then the active
      // library is localStorage, which may hold nothing or an older copy of
      // this team. Nothing is shown (or can be saved) until it settles.
      savedSnapshot.current = null;
      setTeam(null);
      const loadRequestedTeam = (): boolean => {
        const status = TeamManager.getTeamLibraryStatus();
        if (status !== "loaded") {
          setPendingView(status);
          return false;
        }
        const existingTeam = TeamManager.loadTeams().find(
          (t) => t.id === teamId
        );
        if (!existingTeam) {
          setPendingView("missing");
          return false;
        }
        savedSnapshot.current = snapshotOf(existingTeam);
        setTeam(existingTeam);
        setSelectedRace(existingTeam.rosterName);
        setSelectedColor(existingTeam.colors.primary);
        setRosterChosen(true);
        return true;
      };
      if (loadRequestedTeam()) return;
      const stopWaiting = TeamManager.onTeamRepositoryChanged(() => {
        if (loadRequestedTeam()) stopWaiting();
      });
      return stopWaiting;
    }

    // No team in the route: start a new one
    savedSnapshot.current = null;
    setRosterChosen(false);
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
    newTeam.draftRuleset = team.draftRuleset;
    setTeam(newTeam);
  };

  const handleFirstRoster = (race: RosterName) => {
    if (!team) return;
    setSelectedRace(race);
    const newTeam = createTeam(
      team.name,
      race,
      { primary: selectedColor, secondary: 0xffffff },
      team.treasury
    );
    newTeam.draftRuleset = team.draftRuleset;
    setTeam(newTeam);
    setRosterChosen(true);
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

  const handleHirePlayer = (positionName: string) => {
    if (!team) return;

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

    // The roster limits and the Treasury decide, at the draft and between
    // league fixtures alike (teamPricing.ts)
    const hired = hirePlayer(team, template);
    if (hired.amount == null) {
      alert(hired.reason ?? "This player cannot be hired.");
      return;
    }
    setTeam({ ...team });
  };

  const handleFirePlayer = (playerId: string) => {
    if (!team) return;

    const fireDecision = canEdit(team, { type: "fire-player", playerId });
    if (!fireDecision.allowed) {
      alert(fireDecision.reason);
      return;
    }

    const player = team.players.find((p) => p.id === playerId);
    if (!player) return;

    // Only a draft team may let a player go (L6), and it gets a full refund
    // since the roster is still being assembled. An active team may only
    // release a player above a corrected roster limit, for nothing back.
    team.players = team.players.filter((p) => p.id !== playerId);
    if (!isActiveTeam(team)) team.treasury += Math.floor(player.cost);
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

  const handleChooseTeamCaptain = (playerId: string) => {
    if (!team) return;
    const decision = chooseTeamCaptain(team, playerId);
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }
    setTeam({ ...team, players: [...team.players] });
  };

  const handleChooseLeague = (league: League) => {
    if (!team) return;
    const next = { ...team };
    const decision = chooseLeague(next, league);
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }
    setTeam(next);
  };

  const handleChooseFavouredOf = (alignment: FavouredOfRule) => {
    if (!team) return;
    const next = { ...team };
    const decision = chooseFavouredOf(next, alignment);
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }
    setTeam(next);
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
    const insignificantError = validateInsignificant(
      team.players,
      team.draftRuleset
    );
    if (insignificantError) messages.push(insignificantError);
    const roster = getRosterByRosterName(team.rosterName);
    messages.push(...validateRosterLegality(team, roster).map((v) => v.detail));
    return messages;
  };

  /** Leave after a save: the next team to manage, the league, or the list. */
  const leaveAfterSave = () => {
    const [nextTeam, ...remaining] = searchParams.getAll("nextTeam");
    if (postMatch && nextTeam) {
      searchParams.delete("nextTeam");
      remaining.forEach((id) => searchParams.append("nextTeam", id));
      navigate(`/build-team/${encodeURIComponent(nextTeam)}?${searchParams}`, {
        replace: true,
      });
    } else {
      navigate(postMatch ? destination : "/build-team", {
        replace: postMatch,
      });
    }
  };

  const handleSave = async () => {
    if (!team || saveInFlight.current) return;
    clearUnneededExpensiveMistakes(team);
    if (postMatch && developmentPending(team)) return;
    const results = rollExpensiveMistakes(team);
    setTeam({ ...team });
    if (results.length) setCompletion(results.join(" "));
    saveInFlight.current = true;
    setSaving(true);
    try {
      await persistTeam(team);
      if (!isStored(team)) {
        setSaveError(
          "Your team could not be saved. Your changes are still here. Try saving again."
        );
        return;
      }
      savedSnapshot.current = snapshotOf(team);
      setSaveError("");
      if (!results.length) leaveAfterSave();
    } catch (cause) {
      setSaveError(
        `Your team could not be saved. ${cause instanceof Error ? cause.message : String(cause)}. Retry saving to continue.`
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  /** Save unsaved edits before the player page; false keeps them here. */
  const saveBeforeOpeningPlayer = async (current: Team): Promise<boolean> => {
    if (
      !postMatch &&
      !confirm("Save your changes to this team before opening the player?")
    ) {
      return false;
    }
    const wasLocked = current.advancementModeLocked;
    saveInFlight.current = true;
    setSaving(true);
    try {
      await persistTeam(current);
    } catch (cause) {
      restoreAdvancementLock(current, wasLocked);
      setTeam({ ...current });
      alert(
        `Your changes could not be saved, so the player was not opened. Your edits are still here. ${cause instanceof Error ? cause.message : String(cause)}`
      );
      return false;
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
    // The repository logs a failed write instead of throwing (a full
    // localStorage, say), so read it back before leaving these edits.
    if (!isStored(current)) {
      restoreAdvancementLock(current, wasLocked);
      setTeam({ ...current });
      alert(
        "Your changes could not be saved, so the player was not opened. Your edits are still here."
      );
      return false;
    }
    savedSnapshot.current = snapshotOf(current);
    return true;
  };

  /**
   * The player page reads the team from storage, so unsaved edits here
   * (a hire, a reorder, a brand-new team) would be missing there. Offer to
   * save them first; cancelling stays on this page with the edits intact.
   */
  const handleOpenPlayer = async (playerId: string) => {
    if (!team || saveInFlight.current) return;
    if (
      savedSnapshot.current !== snapshotOf(team) &&
      !(await saveBeforeOpeningPlayer(team))
    ) {
      return;
    }
    navigate(`/build-team/${team.id}/player/${playerId}${search}`);
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
    return <TeamPending view={pendingView} onBack={handleBack} />;
  }

  if (!rosterChosen) {
    return (
      <PageShell
        actionBar={
          <HudButton variant="ghost" onClick={handleBack}>
            Cancel
          </HudButton>
        }
      >
        <PageHeader
          eyebrow="New team"
          title="CHOOSE YOUR TEAM"
          subtitle="Pick the roster first. Its players and special rules shape everything else on the team sheet."
        />
        <Section title="Rosters">
          <RosterPicker onChoose={handleFirstRoster} />
        </Section>
      </PageShell>
    );
  }

  const roster = getRosterByRosterName(selectedRace);
  const mode = getTeamMode(team);
  const active = mode === "active";
  const violations = rosterViolations();
  const waitingForDevelopment = postMatch && developmentPending(team);
  const pendingMistakes = hasPendingExpensiveMistakes(team);

  return (
    <PageShell
      actionBar={
        <TeamBuilderActionBar
          team={team}
          postMatch={postMatch}
          completion={completion}
          saving={saving}
          saveError={saveError}
          waitingForDevelopment={waitingForDevelopment}
          pendingMistakes={pendingMistakes}
          incomplete={violations.length > 0}
          hasNextTeam={searchParams.has("nextTeam")}
          returnsToLeague={postMatch && destination !== "/build-team"}
          onBack={handleBack}
          onSave={handleSave}
        />
      }
    >
      <PageHeader
        eyebrow={`${MODE_EYEBROWS[mode]} · ${team.rosterName}`}
        title="TEAM BUILDER"
        subtitle={MODE_SUBTITLES[mode]}
      />

      <PostMatchSection
        postMatch={postMatch}
        pendingMistakes={pendingMistakes}
        completion={completion}
        matchWinnings={matchWinnings}
        waitingForDevelopment={waitingForDevelopment}
      />
      {saveError && (
        <Notice tone="bad" role="alert" className="mb-4">
          {saveError}
        </Notice>
      )}

      <fieldset disabled={!!completion || saving} className="min-w-0">
        {!(postMatch || completion) && (
          <MainChoicesSection
            team={team}
            selectedRace={selectedRace}
            active={active}
            saving={saving}
            onRaceChange={handleRaceChange}
            onChange={setTeam}
          />
        )}
        <PendingDevelopmentPanel
          team={team}
          showExpensiveMistakes={false}
          onOpenPlayer={handleOpenPlayer}
          onChange={(updated) => {
            savedSnapshot.current = snapshotOf(updated);
            setTeam(updated);
          }}
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

        <TeamDetailsSection
          team={team}
          active={active}
          selectedColor={selectedColor}
          onChange={setTeam}
          onColorChange={handleColorChange}
          onChooseLeague={handleChooseLeague}
          onChooseFavouredOf={handleChooseFavouredOf}
        />

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
            hireRefusal={(template) => hireRefusal(team, template)}
          />
        </div>

        <div className="mb-6">
          <TeamRoster
            team={team}
            onFirePlayer={handleFirePlayer}
            onReorderPlayers={handleReorderPlayers}
            onOpenPlayer={handleOpenPlayer}
            onChooseVeteran={active ? undefined : handleChooseVeteran}
            onChooseTeamCaptain={
              !active && hasTeamCaptainRule(team)
                ? handleChooseTeamCaptain
                : undefined
            }
          />
        </div>

        <SidelineStaffSection
          team={team}
          active={active}
          onBuy={handleBuy}
          onApothecaryToggle={handleApothecaryToggle}
        />

        <DraftInducementsSection team={team} onBuy={handleBuy} />
      </fieldset>

      <PlayedGames games={team.playedGames ?? []} />
    </PageShell>
  );
}
