import { useEffect, useState } from "react";
import { HudTabs } from "../../src/ui/components/componentWarehouse/HudPanel";
import {
  PageHeader,
  PageShell,
} from "../../src/ui/components/componentWarehouse/HudPage";
import { CandidatesScreen } from "./CandidatesScreen";
import { TeamsScreen } from "./TeamsScreen";
import { WeightsScreen } from "./WeightsScreen";
import { registerWebMcp } from "./webMcp";

const SCREENS = [
  { id: "weights", label: "Weights", show: WeightsScreen },
  { id: "teams", label: "Teams", show: TeamsScreen },
  { id: "candidates", label: "Candidates", show: CandidatesScreen },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

const screenAt = (hash: string) =>
  SCREENS.find((s) => `#${s.id}` === hash) ?? SCREENS[0];

export function TrainingApp() {
  const [id, setId] = useState<ScreenId>(() => screenAt(location.hash).id);
  useEffect(() => registerWebMcp(), []);
  const { show: Screen } = screenAt(`#${id}`);
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Computer coach"
        title="Training ground"
        subtitle="What each weight makes the coach do, what every team can do, and candidate weight sets to try."
        actions={
          <HudTabs
            label="Screens"
            idBase="screen"
            tabs={SCREENS}
            value={id}
            onChange={(next) => {
              history.replaceState(null, "", `#${next}`);
              setId(next);
            }}
          />
        }
      />
      <div id="screen-panel" role="tabpanel">
        <Screen />
      </div>
    </PageShell>
  );
}
