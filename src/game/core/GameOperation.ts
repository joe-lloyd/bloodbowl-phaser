import type { FlowContext } from "./GameFlowManager";

export abstract class GameOperation {
  public abstract readonly name: string;

  public abstract execute(context: FlowContext): Promise<void>;
}

export abstract class TeamOperation extends GameOperation {
  protected readonly teamId: string;

  constructor(teamId: string) {
    super();
    this.teamId = teamId;
  }
}
