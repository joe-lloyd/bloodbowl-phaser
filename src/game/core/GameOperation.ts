import type { FlowContext } from "./GameFlowManager";

export abstract class GameOperation {
  public abstract readonly name: string;

  public abstract execute(context: FlowContext): Promise<void>;
}
