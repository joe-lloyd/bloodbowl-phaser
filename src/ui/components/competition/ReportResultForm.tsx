import { useState } from "react";
import { fixtureContext } from "../../../competition/fixtureContext";
import { recordCompetitionFixture } from "../../../competition/resultRecording";
import type {
  CompetitionDoc,
  CompetitionEntrant,
  CompetitionFixture,
  PenaltyShootout,
} from "../../../competition/types";
import { errorText } from "../../errorText";
import { HudButton } from "../componentWarehouse/HudKit";

interface DraftScore {
  home: string;
  away: string;
  penaltiesHome: string;
  penaltiesAway: string;
}

const EMPTY: DraftScore = {
  home: "",
  away: "",
  penaltiesHome: "",
  penaltiesAway: "",
};

function wholeNumbers(home: string, away: string): [number, number] | null {
  const scores = [Number(home), Number(away)] as const;
  return home !== "" && away !== "" && scores.every(Number.isInteger)
    ? [scores[0], scores[1]]
    : null;
}

function ScoreInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      type="number"
      min="0"
      {...(max === undefined ? {} : { max: String(max) })}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className="hud-field w-16 text-center"
    />
  );
}

interface ReportRequest {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  draft: DraftScore;
  knockout: boolean;
  onRecorded: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
}

function submitReport({ competition, fixture, draft, knockout, onRecorded, onError }: ReportRequest) {
  const scores = wholeNumbers(draft.home, draft.away);
  if (!scores) {
    onError("Enter both scores as whole numbers.");
    return;
  }
  const penalties: PenaltyShootout | undefined =
    knockout && scores[0] === scores[1]
      ? { home: Number(draft.penaltiesHome), away: Number(draft.penaltiesAway) }
      : undefined;
  recordCompetitionFixture({
    context: fixtureContext({ competition, fixtureId: fixture.id, playedVia: "reported" }),
    homeScore: scores[0],
    awayScore: scores[1],
    ...(penalties ? { penalties } : {}),
  })
    .then((updated) => {
      onRecorded(updated);
      onError(null);
    })
    .catch((reason: unknown) => {
      onError(errorText(reason));
    });
}

export function ReportResultForm({
  competition,
  fixture,
  home,
  away,
  onRecorded,
  onError,
}: {
  competition: CompetitionDoc;
  fixture: CompetitionFixture;
  home: CompetitionEntrant | undefined;
  away: CompetitionEntrant | undefined;
  onRecorded: (competition: CompetitionDoc) => void;
  onError: (error: string | null) => void;
}) {
  const [draft, setDraft] = useState<DraftScore>(EMPTY);
  const knockout =
    competition.type === "tournament" &&
    competition.format === "single-elimination";
  const scores = wholeNumbers(draft.home, draft.away);
  const level = scores !== null && scores[0] === scores[1];
  const set = (field: keyof DraftScore) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const report = () => {
    submitReport({ competition, fixture, draft, knockout, onRecorded, onError });
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ScoreInput label={`${String(home?.name)} score`} value={draft.home} onChange={set("home")} />
        <span className="text-hud-mute">–</span>
        <ScoreInput label={`${String(away?.name)} score`} value={draft.away} onChange={set("away")} />
        <HudButton variant="ghost" size="sm" onClick={report}>
          Record result
        </HudButton>
      </div>
      {knockout && level && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="hud-label">Penalties</span>
          <ScoreInput label={`${String(home?.name)} penalties`} value={draft.penaltiesHome} max={5} onChange={set("penaltiesHome")} />
          <ScoreInput label={`${String(away?.name)} penalties`} value={draft.penaltiesAway} max={5} onChange={set("penaltiesAway")} />
        </div>
      )}
    </>
  );
}
