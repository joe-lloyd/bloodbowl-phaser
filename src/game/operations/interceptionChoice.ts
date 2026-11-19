import { type IGameService } from "../../services/interfaces/IGameService";

interface InterceptionCandidate {
  playerId: string;
  playerName: string;
  modifier: number;
}

export async function chooseInterceptor<C extends InterceptionCandidate>(
  gameService: IGameService,
  passerId: string,
  candidates: readonly C[]
): Promise<C | undefined> {
  const [first] = candidates;
  if (!first) return undefined;
  const chooser = gameService.getPlayerById(first.playerId);
  if (!chooser) return undefined;

  const answer = await gameService.getDecisionService().request({
    type: "interception",
    chooserTeamId: chooser.teamId,
    passerId,
    candidates: candidates.map((c) => ({
      playerId: c.playerId,
      playerName: c.playerName,
      modifier: c.modifier,
    })),
  });

  return answer.playerId
    ? candidates.find((c) => c.playerId === answer.playerId)
    : undefined;
}
