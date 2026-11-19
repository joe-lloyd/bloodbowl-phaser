import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";

export class FinishActivationOperation extends GameOperation {
  public readonly name: string;

  protected readonly playerId: string;
  constructor(name: string, playerId: string) {
    super();
    this.name = name;
    this.playerId = playerId;
  }

  execute(context: FlowContext): Promise<void> {
    context.gameService.finishActivation(this.playerId);
    return Promise.resolve();
  }
}
