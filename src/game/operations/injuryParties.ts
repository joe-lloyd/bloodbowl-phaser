import { type IGameService } from "../../services/interfaces/IGameService";
import { type Player } from "../../types/Player";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";

export interface InjuryParties {
  player: Player;
  causedBy: Player | undefined;
}

function findInjuryParties(
  gameService: Pick<IGameService, "getPlayerById">,
  playerId: string,
  causedById: string | undefined
): InjuryParties | null {
  const player = gameService.getPlayerById(playerId);
  if (!player) return null;
  const causedBy = causedById
    ? gameService.getPlayerById(causedById)
    : undefined;
  return { player, causedBy };
}

export abstract class InjuryPartiesOperation extends GameOperation {
  protected readonly playerId: string;
  protected readonly causedById: string | undefined;
  constructor(playerId: string, causedById: string | undefined) {
    super();
    this.playerId = playerId;
    this.causedById = causedById;
  }

  async execute(context: FlowContext): Promise<void> {
    const parties = findInjuryParties(
      context.gameService,
      this.playerId,
      this.causedById
    );
    if (!parties) return;
    await this.resolve(context, parties);
  }

  protected abstract resolve(
    context: FlowContext,
    parties: InjuryParties
  ): Promise<void>;
}
