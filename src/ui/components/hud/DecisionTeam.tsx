import { ServiceContainer } from "../../../services/ServiceContainer";
import { kitOf } from "../../../game/presentation/kits";
import { pairSeating, pairTeams } from "../../../game/seating";

export function DecisionTeam({
  teamId,
  playerId,
  pick = false,
}: {
  teamId?: string;
  playerId?: string;
  pick?: boolean;
}) {
  if (!ServiceContainer.isInitialized()) return null;
  const service = ServiceContainer.getInstance().gameService;
  const id =
    teamId ??
    (playerId
      ? service.getPlayerById(playerId)?.teamId
      : service.getState().activeTeamId);
  const team = id ? service.getTeam(id) : undefined;
  if (!team) return null;
  const teams = pairTeams(pairSeating(service.getSeating()));
  const kit = kitOf(teams, team.id);

  return (
    <span
      data-testid="decision-team"
      className="inline-flex items-center gap-1.5 text-hud-bone"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-white/40"
        style={{
          backgroundColor: `#${kit.primary.toString(16).padStart(6, "0")}`,
        }}
      />
      {team.name}
      {pick ? " PICK" : ""}
    </span>
  );
}
