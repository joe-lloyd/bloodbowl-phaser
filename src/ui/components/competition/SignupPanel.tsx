import { useState } from "react";
import {
  enterCompetition,
  leaveCompetition,
  removeEntrant,
  startOnlineCompetition,
} from "../../../competition/online";
import { checkTeamCompatibility } from "../../../competition/rosterRules";
import type { CompetitionDoc } from "../../../competition/types";
import { readSevensRuleset } from "../../../game/rules/sevensRuleset";
import type { Team } from "../../../types/Team";
import { errorText } from "../../errorText";
import { dismissCompetitionInvites } from "../../../firebase/invites";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { HudButton, Section } from "../componentWarehouse/HudKit";
import { CompetitionFriendInvites } from "./CompetitionFriendInvites";
import { coachLabel } from "./labels";

interface SignupProps {
  competition: CompetitionDoc;
  uid: string | null;
  onChange: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
}

function useAction(onError: SignupProps["onError"], onChange: SignupProps["onChange"]) {
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<CompetitionDoc>) => {
    setBusy(true);
    onError(null);
    work()
      .then(onChange)
      .catch((reason: unknown) => {
        onError(errorText(reason));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, run };
}

function eligibleTeams(competition: CompetitionDoc, library: Team[]): Team[] {
  const ruleset = readSevensRuleset(competition.ruleset);
  return library.filter(
    (team) =>
      !team.computerCoached &&
      !team.activeCompetitionId &&
      checkTeamCompatibility(team, competition.rosterProfile, ruleset).compatible
  );
}

function EnterTeam({ competition, uid, onChange, onError }: SignupProps & { uid: string }) {
  const [library] = useTeamLibrary();
  const teams = eligibleTeams(competition, library);
  const [teamId, setTeamId] = useState("");
  const { busy, run } = useAction(onError, onChange);
  const team = teams.find((candidate) => candidate.id === teamId);
  if (teams.length === 0)
    return (
      <p className="font-hud-body text-hud-base text-hud-dim">
        None of your teams can enter. A team must be legal for these rules, fit
        the roster profile, and not be playing in another competition.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select aria-label="Team to enter" value={teamId} onChange={(event) => { setTeamId(event.target.value); }} className="hud-field !w-72">
        <option value="" disabled>
          Pick one of your teams…
        </option>
        {teams.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name} ({candidate.rosterName})
          </option>
        ))}
      </select>
      <HudButton
        variant="primary"
        disabled={busy || !team}
        onClick={() => {
          if (team)
            run(async () => {
              const updated = await enterCompetition({ competition, team, uid });
              dismissCompetitionInvites({ uid, competitionId: competition.id }).catch((reason: unknown) => {
                console.warn("[competition] could not clear the invites to it", reason);
              });
              return updated;
            });
        }}
      >
        Enter team
      </HudButton>
    </div>
  );
}

function OrganizerStart({ competition, onChange, onError }: SignupProps) {
  const { busy, run } = useAction(onError, onChange);
  const places = competition.online?.places ?? 0;
  const empty = Math.max(0, places - competition.entrants.length);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <HudButton
        variant="primary"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Start now? Sign-ups close and the fixtures are drawn."))
            run(() => startOnlineCompetition({ competition }));
        }}
      >
        Start {competition.type}
      </HudButton>
      <span className="font-hud-body text-hud-sm text-hud-dim">
        {empty > 0
          ? `${String(empty)} computer ${empty === 1 ? "team fills the empty place" : "teams fill the empty places"}.`
          : "Every place is taken."}
      </span>
    </div>
  );
}

function SignupList({ competition, uid, organizer, onChange, onError }: SignupProps & { organizer: boolean }) {
  const { busy, run } = useAction(onError, onChange);
  return (
    <ul className="mb-4 flex flex-col gap-2">
      {competition.entrants.map((entrant) => (
        <li key={entrant.id} data-testid="signup" className="flex flex-wrap items-center justify-between gap-3 rounded-hud border border-white/15 bg-black/30 px-3 py-2">
          <span className="font-hud-body text-hud-base text-hud-bone">
            {entrant.name} <span className="text-hud-dim">({entrant.rosterName}) · {coachLabel(entrant)}</span>
          </span>
          {uid && entrant.ownerUid === uid ? (
            <HudButton size="sm" variant="ghost" disabled={busy} onClick={() => { run(() => leaveCompetition({ competition, uid })); }}>
              Leave
            </HudButton>
          ) : (
            organizer && (
              <HudButton size="sm" variant="danger" disabled={busy} onClick={() => { run(() => removeEntrant({ competition, entrantId: entrant.id })); }}>
                Remove
              </HudButton>
            )
          )}
        </li>
      ))}
    </ul>
  );
}

function EntryControls(props: SignupProps & { organizer: boolean }) {
  const { competition, uid, organizer } = props;
  if (!uid)
    return (
      <p className="font-hud-body text-hud-base text-hud-dim">
        Sign in from the main menu to enter a team.
      </p>
    );
  const entered = competition.participantUids.includes(uid);
  const full = competition.entrants.length >= (competition.online?.places ?? 0);
  return (
    <>
      {!entered && !full && <EnterTeam {...props} uid={uid} />}
      {organizer && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <OrganizerStart {...props} />
        </div>
      )}
    </>
  );
}

export function SignupPanel(props: SignupProps) {
  const { competition, uid } = props;
  const places = competition.online?.places ?? 0;
  const organizer = !!uid && competition.organizerUid === uid;
  const inside = organizer || (!!uid && competition.participantUids.includes(uid));
  return (
    <>
      <Section title={`Sign-ups · ${String(competition.entrants.length)} of ${String(places)} places taken`}>
        <SignupList {...props} organizer={organizer} />
        <EntryControls {...props} organizer={organizer} />
      </Section>
      {uid && inside && <CompetitionFriendInvites competition={competition} uid={uid} />}
    </>
  );
}
