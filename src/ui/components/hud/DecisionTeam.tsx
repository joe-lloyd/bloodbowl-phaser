import { ServiceContainer } from "../../../services/ServiceContainer";

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
  // Bone text beside a colour swatch: a dark team colour is unreadable as
  // text on the dark panel.
  return (
    <span
      data-testid="decision-team"
      className="inline-flex items-center gap-1.5 text-hud-bone"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-white/40"
        style={{
          backgroundColor: `#${team.colors.primary.toString(16).padStart(6, "0")}`,
        }}
      />
      {team.name}
      {pick ? " PICK" : ""}
    </span>
  );
}
