import { useNavigate } from "react-router-dom";
import { type Placing, placings } from "../../../game/deathbowl/placings";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { BloodBowlTable } from "../componentWarehouse/BloodBowlTable";
import { HudButton } from "../componentWarehouse/HudKit";
import { Title } from "../componentWarehouse/HudTitle";

const ORDINALS = ["1st", "2nd", "3rd", "4th"] as const;

function placeLabel(row: Placing, rows: readonly Placing[]): string {
  const ordinal = ORDINALS[row.place - 1] ?? String(row.place);
  const shared = rows.filter(({ place }) => place === row.place).length > 1;
  return shared ? `=${ordinal}` : ordinal;
}

function readPlacings(): { rows: Placing[]; name: (id: string) => string } {
  const gs = ServiceContainer.getInstance().gameService;
  const { points = {}, score } = gs.getState();
  const rows = placings(
    gs.getTeams().map(({ id }) => ({
      teamId: id,
      points: points[id] ?? 0,
      touchdowns: score[id] ?? 0,
    }))
  );
  return { rows, name: (id) => gs.getTeam(id)?.name ?? id };
}

export function PlacingsScreen({ visible }: { visible: boolean }) {
  const navigate = useNavigate();
  if (!visible || !ServiceContainer.isInitialized()) return null;
  const { rows, name } = readPlacings();
  return (
    <div className="hud-scroll absolute inset-0 z-[250] overflow-auto bg-hud-ink/95 p-6 font-hud-body text-hud-bone pointer-events-auto backdrop-blur-sm phone:p-3">
      <div
        data-testid="placings"
        className="mx-auto flex max-w-2xl flex-col items-center gap-4 animate-hud-pop"
      >
        <Title level="hero" as="h1">
          Full Time
        </Title>
        <BloodBowlTable
          title="Placings"
          accent="blood"
          headers={["Place", "Team", "Points", "TD"]}
        >
          {rows.map((row) => (
            <tr key={row.teamId} data-testid={`placing-${row.teamId}`}>
              <td>{placeLabel(row, rows)}</td>
              <td>{name(row.teamId)}</td>
              <td>{row.points}</td>
              <td>{row.touchdowns}</td>
            </tr>
          ))}
        </BloodBowlTable>
        <p className="text-hud-sm italic text-hud-dim">
          An exhibition: no SPP, injuries or results are kept.
        </p>
        <HudButton
          variant="primary"
          size="lg"
          data-testid="placings-leave"
          onClick={() => void navigate("/")}
        >
          Back to Menu
        </HudButton>
      </div>
    </div>
  );
}
