import { HudButton, Section } from "../componentWarehouse/HudKit";
import type { SimulatedResult } from "./useSimulation";

export function SimulateRoundTools({
  round,
  simulating,
  disabled,
  onSimulate,
}: {
  round: number | undefined;
  simulating: string | null;
  disabled: boolean;
  onSimulate: () => void;
}) {
  if (simulating)
    return (
      <div className="mb-4">
        <span role="status" className="font-hud-body text-hud-sm text-hud-dim">
          Simulating {simulating}…
        </span>
      </div>
    );
  if (round === undefined) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <HudButton variant="primary" size="sm" disabled={disabled} onClick={onSimulate}>
        Simulate round {round}
      </HudButton>
    </div>
  );
}

export function SimulatedResults({ results }: { results: SimulatedResult[] }) {
  if (results.length === 0) return null;
  return (
    <Section title="Simulated results">
      <ul className="space-y-3 font-hud-body text-hud-base text-hud-bone">
        {results.map((result) => (
          <li key={result.fixtureId}>
            <span className="hud-label mr-2 text-hud-gold">Round {result.round}</span>
            {result.home}{" "}
            <strong className="tabular-nums">
              {result.homeScore}–{result.awayScore}
            </strong>{" "}
            {result.away}
            {result.penalties && (
              <span className="tabular-nums text-hud-mute">
                {" "}
                (Penalties {result.penalties.home}–{result.penalties.away})
              </span>
            )}
            {result.casualties.length > 0 && (
              <ul className="mt-1 text-hud-sm text-hud-dim">
                {result.casualties.map((casualty) => (
                  <li key={casualty}>{casualty}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
