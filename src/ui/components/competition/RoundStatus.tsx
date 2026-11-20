import { openRound, overdueEntrantIds } from "../../../competition/schedule";
import type { CompetitionDoc } from "../../../competition/types";
import { Notice } from "../componentWarehouse/HudKit";
import { deadlineText } from "./labels";

export function RoundStatus({
  competition,
  now,
}: {
  competition: CompetitionDoc;
  now: number;
}) {
  const window = openRound(competition);
  if (!window || !competition.online) return null;
  const fixtures = competition.fixtures.filter(
    (fixture) => fixture.round === window.round
  );
  const played = fixtures.filter((fixture) => fixture.status === "complete");
  const overdue = overdueEntrantIds(competition, now).length > 0;
  return (
    <div data-testid="round-status" className="mb-6">
      <Notice tone={overdue ? "warn" : "info"} role="status">
      Round {window.round} is open until {deadlineText(window.deadline)}.{" "}
      {played.length} of {fixtures.length}{" "}
      {fixtures.length === 1 ? "game" : "games"} played. The next round opens as
      soon as every game in this one is finished.
      {overdue &&
        " The deadline has passed. The organizer can remove a coach who has not played."}
      </Notice>
    </div>
  );
}
