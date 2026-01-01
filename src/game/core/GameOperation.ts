/**
 * GameOperation - Abstract Base Class for Discrete Game Steps
 *
 * Responsibility:
 * - Define a SINGLE unit of work (e.g. "Attempt Catch").
 * - Execute pure logic via injected Services/Controllers.
 * - DO NOT manage global state or subscription.
 * - Return control to FlowManager upon completion (success/fail).
 */
export abstract class GameOperation {
  public abstract readonly name: string;

  /**
   * Execute the operation
   * @param context Dependency container (access to GameService, EventBus, etc.)
   * @returns Promise resolving when step is completely done (including animations)
   */
  public abstract execute(context: any): Promise<void>;
}
