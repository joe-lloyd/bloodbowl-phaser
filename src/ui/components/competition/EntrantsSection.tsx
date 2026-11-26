import { removeEntrant } from "../../../competition/online";
import { withdrawFromCompetition } from "../../../competition/resultRecording";
import { overdueEntrantIds } from "../../../competition/schedule";
import type {
  CompetitionDoc,
  CompetitionEntrant,
} from "../../../competition/types";
import { ownLocalTeam } from "../../../competition/teamRefs";
import { errorText } from "../../errorText";
import { cx, Section } from "../componentWarehouse/HudKit";
import { coachLabel } from "./labels";

const LINK_BUTTON =
  "font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em] text-hud-bad underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-gold";

type EntrantAction = "withdraw" | "remove" | null;

function actionFor({
  entrant,
  overdue,
  organizer,
}: {
  entrant: CompetitionEntrant;
  overdue: ReadonlySet<string>;
  organizer: boolean;
}): EntrantAction {
  if (entrant.withdrawn || entrant.computerCoached) return null;
  if (ownLocalTeam(entrant)) return "withdraw";
  return organizer && overdue.has(entrant.id) ? "remove" : null;
}

const CONFIRM: Record<Exclude<EntrantAction, null>, string> = {
  withdraw: "Withdraw this team from the competition?",
  remove:
    "Remove this coach? Every game they have left becomes a walkover for their opponent.",
};

export function EntrantsSection({
  competition,
  organizer,
  now,
  onChange,
  onError,
}: {
  competition: CompetitionDoc;
  organizer: boolean;
  now: number;
  onChange: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
}) {
  const overdue = new Set(overdueEntrantIds(competition, now));
  const act = (entrant: CompetitionEntrant, action: Exclude<EntrantAction, null>) => {
    if (!confirm(CONFIRM[action])) return;
    const work =
      action === "withdraw"
        ? withdrawFromCompetition(
            { competitionType: competition.type, competitionId: competition.id },
            entrant.id
          )
        : removeEntrant({ competition, entrantId: entrant.id });
    work
      .then((updated) => {
        onChange(updated);
        onError(null);
      })
      .catch((reason: unknown) => {
        onError(errorText(reason));
      });
  };

  return (
    <Section title="Entrants">
      <div className="flex flex-wrap gap-2">
        {competition.entrants.map((entrant) => (
          <EntrantChip
            key={entrant.id}
            entrant={entrant}
            overdue={overdue.has(entrant.id)}
            action={actionFor({ entrant, overdue, organizer })}
            onAct={(action) => {
              act(entrant, action);
            }}
          />
        ))}
      </div>
    </Section>
  );
}

const TAG = "font-hud-label text-hud-xs font-bold uppercase tracking-[0.08em]";

function EntrantChip({
  entrant,
  overdue,
  action,
  onAct,
}: {
  entrant: CompetitionEntrant;
  overdue: boolean;
  action: EntrantAction;
  onAct: (action: Exclude<EntrantAction, null>) => void;
}) {
  return (
    <div
      data-testid="entrant"
      className={cx(
        "flex items-center gap-3 rounded-hud border px-3 py-2 font-hud-body text-hud-sm",
        entrant.withdrawn
          ? "border-white/5 text-hud-mute line-through"
          : "border-white/15 bg-black/30 text-hud-bone"
      )}
    >
      <span>{entrant.name}</span>
      <span className={cx(TAG, "text-hud-mute")}>{coachLabel(entrant)}</span>
      {overdue && <span className={cx(TAG, "text-hud-warn")}>Overdue</span>}
      {action && (
        <button
          type="button"
          onClick={() => {
            onAct(action);
          }}
          className={LINK_BUTTON}
        >
          {action === "withdraw" ? "Withdraw" : "Remove"}
        </button>
      )}
    </div>
  );
}
