import { useState, useEffect, useRef } from "react";
import { shirtMoveRefusal } from "../../../game/rules/club";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type Team, RosterName, createTeam } from "../../../types/Team";
import { validateInsignificant } from "../../../game/rules/insignificant";
import { validateRosterLegality } from "../../../game/rules/rosterLegality";
import {
  type TeamMode,
  getTeamMode,
  isActiveTeam,
} from "../../../game/rules/teamLifecycle";
import { canEdit } from "../../../game/rules/teamEditLegality";
import { hireWithIdentity } from "../../../game/names/playerIdentity";
import {
  type StaffItem,
  hireRefusal,
  positionAllowance,
  purchase,
  refund,
} from "../../../game/rules/teamPricing";
import { chooseVeteran } from "../../../game/rules/veteran";
import { teamDraftRules } from "../../../game/rules/draftRules";
import { withDraftGameType } from "../../../game/rules/gameTypeChange";
import { GameTypeSelector } from "../common/GameTypeSelector";
import {
  captainVacancyCandidates,
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
  type FavouredOfRule,
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
import {
  isTeamSaving,
  onTeamSaveSettled,
  useTeamSaving,
} from "../../hooks/teamSaveLock";
import { PendingDevelopmentPanel } from "../TeamManagement/PendingDevelopmentPanel";
import { ClubNotice } from "../club/ClubNotice";
import { clubSheetHandlers } from "../club/clubSheet";
import { TeamLibraryUnavailable } from "../TeamManagement/TeamLibraryUnavailable";

const MODE_EYEBROWS: Record<TeamMode, string> = {
  active: "Active team",
  draft: "Draft team",
};

const MODE_SUBTITLES: Record<TeamMode, string> = {
  active:
    "This team has played its first match. Roster type is locked and nobody can be fired. Between league fixtures, spend the Treasury on players at roster price and on Sideline Staff at the prices of the team's game type, within the roster limits. Re-rolls and Dedicated Fans are no longer for sale.",
  draft:
    "Draft teams may be edited freely and saved even while incomplete, but must pass roster legality before they can be selected for a match or entered in a competition.",
};

function freshTeam(race: RosterName, color: number, previous?: Team): Team {
  const team = createTeam(
    previous?.name ?? "New Team",
    race,
    { primary: color, secondary: 0xffffff },
    getRosterByRosterName(race).rerollCost,
    teamDraftRules(previous ?? {}).budget
  );
  if (previous?.gameType !== undefined) team.gameType = previous.gameType;
  if (previous?.draftRuleset !== undefined)
    team.draftRuleset = previous.draftRuleset;
  return team;
}

function snapshotOf(team: Team): string {
  return JSON.stringify(dehydrateTeam(team));
}

function isStored(current: Team): boolean {
  const stored = TeamManager.loadTeams().find((t) => t.id === current.id);
  return !!stored && snapshotOf(stored) === snapshotOf(current);
}

function persistTeam(toSave: Team) {
  lockAdvancementMode(toSave);

  const teams = TeamManager.loadTeams();
  const existingIndex = teams.findIndex((t) => t.id === toSave.id);

  if (existingIndex === -1) {
    teams.push(toSave);
  } else {
    teams[existingIndex] = toSave;
  }

  return TeamManager.saveTeams(teams);
}

function restoreAdvancementLock(
  team: Team,
  wasLocked: Team["advancementModeLocked"]
): void {
  if (wasLocked) team.advancementModeLocked = wasLocked;
  else delete team.advancementModeLocked;
}

function developmentPending(team: Team): boolean {
  return (
    stepsBeforeExpensiveMistakes(team) > 0 || team.players.some((element) => mustAdvance(element))
  );
}

function hasPendingExpensiveMistakes(team: Team): boolean {
  return (
    !!team.pendingDevelopment?.some(
      (entry) => entry.kind === "expensive-mistakes"
    ) && rollsForExpensiveMistakes(team.treasury)
  );
}

function rollExpensiveMistakes(team: Team): string[] {
  const results: string[] = [];
  if (stepsBeforeExpensiveMistakes(team) > 0) return results;
  const rng = new RNGService(Date.now());
  const pendingSnapshot = [...(team.pendingDevelopment ?? [])];
  for (const entry of pendingSnapshot) {
    if (entry.kind !== "expensive-mistakes") continue;
    results.push(
      describeExpensiveMistakes(resolveExpensiveMistakes(team, entry, rng))
    );
  }
  return results;
}

function readSearch(search: string, teamId = "") {
  const searchParams = new URLSearchParams(search);
  const returnTo = searchParams.get("returnTo") ?? "";
  return {
    searchParams,
    postMatch: searchParams.get("postMatch") === "1",
    requested: /^\/(leagues|clubs)\/[^/?#]+$/.test(returnTo)
      ? returnTo
      : undefined,
    matchWinnings: searchParams.get(`winnings-${teamId}`),
  };
}

function returnLabelFor(destination: string): string | undefined {
  if (destination === "/clubs") return "Back to Clubs";
  if (destination.startsWith("/clubs/")) return "Back to the club";
  if (destination.startsWith("/leagues/")) return "Back to the league";
  return undefined;
}

type TeamPendingView = "loading" | "missing" | "failed";

function TeamPending({
  view,
  onBack,
  backLabel,
}: {
  view: TeamPendingView;
  onBack: () => void;
  backLabel: string;
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
              {backLabel}
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
            {backLabel}
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

  const [pendingView, setPendingView] = useState<TeamPendingView>("loading");
  const [selectedRace, setSelectedRace] = useState<RosterName>(
    RosterName.AMAZON
  );
  const [selectedColor, setSelectedColor] = useState<number>(0x8e1b1b);

  const [rosterChosen, setRosterChosen] = useState(true);
  const navigate = useNavigate();
  const { teamId } = useParams<{ teamId: string }>();
  const { search } = useLocation();
  const { searchParams, postMatch, requested, matchWinnings } = readSearch(
    search,
    teamId
  );
  const destination = requested ?? (team?.club ? "/clubs" : "/build-team");

  const returnLabel = returnLabelFor(destination);
  const [completion, setCompletion] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savingTeam, setSaving] = useState(false);
  const developmentSaving = useTeamSaving();
  const saving = savingTeam || developmentSaving;
  const saveInFlight = useRef(false);

  const savedSnapshot = useRef<string | null>(null);

  useEffect(() => {
    setCompletion("");
    setSaveError("");
    setPendingView("loading");
    if (teamId) {
      savedSnapshot.current = null;
      setTeam(null);
      const loadRequestedTeam = (): boolean => {
        const status = TeamManager.getTeamLibraryStatus();
        if (status !== "loaded") {
          setPendingView(status);
          return false;
        }
        if (isTeamSaving()) return false;
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
      const stops: (() => void)[] = [];
      const stopWaiting = () => {
        for (const stop of stops) {
          stop();
        }
      };
      const retry = () => {
        if (loadRequestedTeam()) stopWaiting();
      };
      stops.push(
        TeamManager.onTeamRepositoryChanged(retry),
        onTeamSaveSettled(retry)
      );
      return stopWaiting;
    }

    savedSnapshot.current = null;
    setRosterChosen(false);
    setTeam(freshTeam(selectedRace, selectedColor));
    return;
  }, [teamId]);

  const handleRaceChange = (race: RosterName) => {
    if (!team) return;

    const decision = canEdit(team, { type: "change-roster-type" });
    if (!decision.allowed) {
      alert(decision.reason);
      return;
    }

    if (team.players.length > 0 && !confirm("Changing race will clear your roster. Continue?")) return;

    setSelectedRace(race);
    setTeam(freshTeam(race, selectedColor, team));
  };

  const handleFirstRoster = (race: RosterName) => {
    if (!team) return;
    setSelectedRace(race);
    setTeam(freshTeam(race, selectedColor, team));
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

    const hired = hireWithIdentity(team, template);
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
    if (!team || isTeamSaving()) return;
    const refusal = shirtMoveRefusal(team, sourceSlot, targetSlot);
    if (refusal) {
      alert(refusal);
      return;
    }

    const newPlayers = team.players.map((p) => ({ ...p }));
    const sourcePlayer = newPlayers.find((p) => p.number === sourceSlot);

    if (!sourcePlayer) {
      return;
    }

    const targetPlayer = newPlayers.find((p) => p.number === targetSlot);
    sourcePlayer.number = targetSlot;

    if (targetPlayer) {
      targetPlayer.number = sourceSlot;
    }

    setTeam({
      ...team,
      players: newPlayers,
    });
  };

  const staffChange =
    (change: typeof purchase | typeof refund) => (item: StaffItem) => {
      if (!team) return;
      const result = change(team, item);
      if (result.amount == null) {
        alert(result.reason);
        return;
      }
      setTeam({ ...team });
    };
  const handleBuy = staffChange(purchase);
  const handleRefund = staffChange(refund);

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

  const leaveAfterSave = () => {
    const [nextTeam, ...remaining] = searchParams.getAll("nextTeam");
    if (postMatch && nextTeam) {
      searchParams.delete("nextTeam");
      for (const id of remaining) {
        searchParams.append("nextTeam", id);
      }
      navigate(`/build-team/${encodeURIComponent(nextTeam)}?${searchParams}`, {
        replace: true,
      });
    } else {
      navigate(destination, { replace: postMatch });
    }
  };

  const handleSave = async () => {
    if (!team || saveInFlight.current) return;
    clearUnneededExpensiveMistakes(team);
    if (postMatch && developmentPending(team)) return;
    const results = rollExpensiveMistakes(team);
    setTeam({ ...team });
    if (results.length > 0) setCompletion(results.join(" "));
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
      if (results.length === 0) leaveAfterSave();
    } catch (cause) {
      setSaveError(
        `Your team could not be saved. ${cause instanceof Error ? cause.message : String(cause)}. Retry saving to continue.`
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

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

  const handleOpenPlayer = async (playerId: string) => {
    if (!team || saveInFlight.current || isTeamSaving()) return;
    if (
      savedSnapshot.current !== snapshotOf(team) &&
      !(await saveBeforeOpeningPlayer(team))
    ) {
      return;
    }
    navigate(`/build-team/${team.id}/player/${playerId}${search}`);
  };

  const handleBack = () => {
    navigate(destination);
  };

  if (!team) {
    return (
      <TeamPending
        view={pendingView}
        onBack={handleBack}
        backLabel={returnLabel ?? "Back to Teams"}
      />
    );
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
          title="CHOOSE YOUR TEAM"
          subtitle="Pick the game type and the roster first. The game type sets the budget and the staff you may hire; the roster's players and special rules shape everything else on the team sheet."
        />
        <Section title="Game type">
          <GameTypeSelector
            {...(team.gameType === undefined ? {} : { value: team.gameType })}
            onChange={(gameType) => {
              setTeam(withDraftGameType(team, gameType));
            }}
          />
        </Section>
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

  const handleApothecaryToggle = () => {
    if (team.apothecary) handleRefund({ type: "apothecary" });
    else handleBuy({ type: "apothecary" });
  };

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
          returnLabel={returnLabel}
          onBack={handleBack}
          onSave={handleSave}
        />
      }
    >
      <PageHeader
        eyebrow={`${team.club ? "Club" : MODE_EYEBROWS[mode]} · ${team.rosterName}`}
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
      <ClubNotice team={team} />
      {captainVacancyCandidates(team).length > 0 && (
        <Notice tone="info" title="No Team Captain" className="mb-4">
          This team has no Team Captain. You may appoint one in the pre-game of
          your next league fixture, after both coaches confirm their
          inducements. Any player except a Big Guy may take the title.
        </Notice>
      )}
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
          onChange={(next) => {
            setTeam(next);
          }}
        />

        <div className="mb-6">
          <AvailableHires
            roster={roster}
            colors={team.colors}
            treasury={team.treasury}
            onHirePlayer={handleHirePlayer}
            hireRefusal={(template) => hireRefusal(team, template)}
            allowance={(template) => positionAllowance(team, template)}
          />
        </div>

        <div className="mb-6">
          <TeamRoster
            team={team}
            onFirePlayer={handleFirePlayer}
            onReorderPlayers={handleReorderPlayers}
            onOpenPlayer={handleOpenPlayer}
            {...clubSheetHandlers(team, setTeam)}
            onChooseVeteran={
              active || !teamDraftRules(team).veteran
                ? undefined
                : handleChooseVeteran
            }
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
          onRefund={handleRefund}
          onApothecaryToggle={handleApothecaryToggle}
        />

        <DraftInducementsSection
          team={team}
          onBuy={handleBuy}
          onRefund={handleRefund}
        />
      </fieldset>

      <PlayedGames games={team.playedGames ?? []} />
    </PageShell>
  );
}
