import {
  usePregameCommand,
  usePregameInducements,
} from "./pregameInducementHooks";
import { EventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { DialogShell, HudButton, Notice } from "../componentWarehouse/HudKit";
import { InducementSelectionPanel } from "./InducementSelectionPanel";

export function PregameInducements({ eventBus }: { eventBus: EventBus }) {
  const { pregame, pending, decision, refresh } =
    usePregameInducements(eventBus);
  const command = usePregameCommand(refresh);
  if (!pregame || !pending || decision || !ServiceContainer.isInitialized())
    return null;
  const service = ServiceContainer.getInstance().gameService;
  const teams = Object.keys(service.getState().score).map(
    (id) => service.getTeam(id)!
  );
  const match = getActiveOnlineMatch();
  const ownTeams = match
    ? teams.filter((team) => team.id === match.myTeamId)
    : teams;
  const bothReady = teams.every((team) => pregame.ready[team.id]);
  if (!bothReady)
    return (
      <DialogShell
        zClass="z-[100]"
        title="READY FOR THE MATCH"
        placement="center"
        backdrop="heavy"
        width="w-[520px]"
      >
        <p className="mb-4 text-hud-sm text-hud-dim">
          Both teams ready up, then choose inducements before the coin toss.
        </p>
        <div className="space-y-3">
          {teams.map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between gap-3 rounded-hud border border-white/10 p-3"
            >
              <span className="font-hud-label text-hud-lg">{team.name}</span>
              {pregame.ready[team.id] ? (
                <span className="hud-label text-hud-gold">Ready</span>
              ) : ownTeams.includes(team) ? (
                <HudButton
                  disabled={command.busy}
                  onClick={() =>
                    void command.run(() => service.readyInducements(team.id))
                  }
                >
                  Ready — {team.name}
                </HudButton>
              ) : (
                <span className="text-hud-sm text-hud-dim">
                  Waiting for coach…
                </span>
              )}
            </div>
          ))}
        </div>
        {command.error && (
          <Notice tone="bad" role="alert" className="mt-3">
            {command.error}
          </Notice>
        )}
      </DialogShell>
    );
  const team = ownTeams.find((team) => !pregame.offer?.confirmed[team.id]);
  if (team)
    return (
      <InducementSelectionPanel
        key={team.id}
        teamId={team.id}
        onChanged={refresh}
      />
    );
  return (
    <DialogShell
      zClass="z-[100]"
      title="INDUCEMENTS CONFIRMED"
      placement="center"
      backdrop="heavy"
      width="w-[520px]"
    >
      <p role="status" className="text-hud-dim">
        {pregame.complete
          ? "Preparing inducements…"
          : "Waiting for the other coach to confirm inducements…"}
      </p>
    </DialogShell>
  );
}
