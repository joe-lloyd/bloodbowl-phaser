import { useEffect, useRef } from "react";
import { isHouseBotBrowser } from "../../../firebase/houseBot";
import {
  type LobbyDoc,
  lobbyGameType,
  selectTeam,
  setReady,
  teamFitsLobby,
} from "../../../firebase/lobby";
import { houseBotTeam } from "../../../social/houseBotTeam";
import { teamValueText } from "../../../social/teamValueRange";
import { calculateTeamValue } from "../../../types/Team";
import { errorText } from "../../errorText";

function say(line: string): void {
  console.log(`[HouseBot] ${line}`);
}

function needsTeam(lobby: LobbyDoc | null, uid: string | undefined): lobby is LobbyDoc {
  if (!isHouseBotBrowser() || !lobby || !uid || lobby.status !== "lobby") return false;
  if (lobby.competitionContext) return false;
  const mine = lobby.players[uid]?.team;
  return !mine || !teamFitsLobby(mine, lobby);
}

export function useHouseBotTeam(lobby: LobbyDoc | null, uid: string | undefined): void {
  const asked = useRef("");
  useEffect(() => {
    if (!uid || !needsTeam(lobby, uid)) return;
    const request = `${lobby.code}:${JSON.stringify(lobby.settings)}`;
    if (asked.current === request) return;
    asked.current = request;
    const gameType = lobbyGameType(lobby);
    const team = houseBotTeam({ gameType, teamValue: lobby.settings.teamValue, random: Math.random });
    if (!team) {
      say(`no computer team plays ${gameType} at ${teamValueText(lobby.settings.teamValue)}`);
      if (lobby.players[uid]?.ready) void setReady(lobby.code, uid, false);
      return;
    }
    say(`picking ${team.name} (${team.rosterName}, ${String(calculateTeamValue(team) / 1000)}k)`);
    selectTeam(lobby.code, uid, team).catch((error: unknown) => {
      asked.current = "";
      say(`could not pick a team: ${errorText(error)}`);
    });
  }, [lobby, uid]);
}
