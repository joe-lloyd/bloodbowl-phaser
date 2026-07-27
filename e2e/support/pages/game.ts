/**
 * DOM page objects for the browser lane.
 *
 * Everything here drives the game the way a coach does: navigating routes,
 * choosing a sandbox scenario, picking an action from the HUD menu, and
 * answering decision dialogs. Assertions about what the game *concluded*
 * belong to `GameBridge`; these objects only act and expose locators.
 */

import { Locator, Page, expect } from "@playwright/test";
import { GameBridge } from "./bridge";
import { PitchPage } from "./pitch";

/** Main menu and route navigation. */
export class MenuPage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/");
    await expect(
      this.page.getByRole("heading", { name: "BLOOD BOWL SEVENS" })
    ).toBeVisible();
  }

  playLocal(): Promise<void> {
    return this.page.getByRole("button", { name: "Play Local" }).click();
  }

  buildTeam(): Promise<void> {
    return this.page.getByRole("button", { name: "Build Team" }).click();
  }

  /** The Sandbox entry is admin-gated; without Firebase everyone is admin. */
  openSandbox(): Promise<void> {
    return this.page.getByRole("button", { name: /Sandbox/ }).click();
  }

  resumeLocalMatch(): Locator {
    return this.page.getByTestId("resume-local-match");
  }
}

/** The sandbox scenario explorer overlay. */
export class SandboxPage {
  readonly pitch: PitchPage;
  readonly bridge: GameBridge;

  constructor(private readonly page: Page) {
    this.pitch = new PitchPage(page);
    this.bridge = new GameBridge(page);
  }

  /**
   * Open the sandbox directly. The scene reads `?scenario=&seed=&outcome=`,
   * so a CI failure's reproduction reference is a URL.
   */
  async open(params?: {
    scenario?: string;
    seed?: number;
    outcome?: string;
  }): Promise<void> {
    const query = new URLSearchParams();
    if (params?.scenario) query.set("scenario", params.scenario);
    if (params?.seed !== undefined) query.set("seed", String(params.seed));
    if (params?.outcome) query.set("outcome", params.outcome);
    const suffix = query.toString() ? `?${query}` : "";
    await this.page.goto(`/sand-box${suffix}`);
    await this.pitch.waitForCanvas();
    // The scene defers the URL-driven load, so the bridge exists before the
    // scenario is on the pitch. The overlay's seed panel only renders on
    // ScenarioLoaded, which makes it the honest "board is ready" signal.
    if (params?.scenario) await this.waitForScenarioLoaded();
  }

  /** The overlay panel that appears once a scenario has been loaded. */
  scenarioInfo(): Locator {
    return this.page.getByTestId("sandbox-scenario-info");
  }

  async waitForScenarioLoaded(timeout = 20_000): Promise<void> {
    await expect(this.scenarioInfo()).toBeVisible({ timeout });
  }

  /** The seed the scene actually ran with, as shown in the overlay. */
  async loadedSeed(): Promise<number> {
    const raw = await this.scenarioInfo().getAttribute("data-scenario-seed");
    return Number(raw);
  }

  topicSelect(): Locator {
    return this.page.getByLabel("Sandbox topic");
  }

  coreScenarioSelect(): Locator {
    return this.page.getByLabel("Core scenario");
  }

  ruleSelect(): Locator {
    return this.page.getByLabel("Sandbox rule");
  }

  configSelect(): Locator {
    return this.page.getByLabel("Sandbox configuration");
  }

  seedInput(): Locator {
    return this.page.getByLabel("Scenario seed");
  }

  outcomeSelect(): Locator {
    return this.page.getByLabel("Seeded outcome");
  }

  /** Pick a core-rules scenario from the flat list. */
  async loadCoreScenario(id: string): Promise<void> {
    await this.topicSelect().selectOption("core");
    await this.coreScenarioSelect().selectOption(id);
  }
}

/** The in-match HUD: action menu, decision dialogs, turn control. */
export class HudPage {
  readonly bridge: GameBridge;
  readonly pitch: PitchPage;

  constructor(private readonly page: Page) {
    this.bridge = new GameBridge(page);
    this.pitch = new PitchPage(page);
  }

  actionMenu(): Locator {
    return this.page.getByTestId("player-action-menu");
  }

  /** An action button by its protocol action name, e.g. "move", "blitz". */
  actionButton(action: string): Locator {
    return this.page.getByTestId(`action-${action}`);
  }

  /** A Block-replacement declaration, e.g. ("blitz", "chainsaw"). */
  replacementButton(action: string, replacement: string): Locator {
    return this.page.getByTestId(`action-${action}-${replacement}`);
  }

  /** Select a player on the pitch and declare an action from their menu. */
  async declareAction(playerRef: string, action: string): Promise<void> {
    await this.pitch.clickPlayer(playerRef);
    await expect(this.actionMenu()).toBeVisible();
    await this.actionButton(action).click();
  }

  endTurn(): Locator {
    return this.page.getByTestId("end-turn");
  }

  /**
   * Advance to a step of a multi-step action.
   *
   * A Pass is "Move, then Pass": until the coach selects the Pass step, a
   * canvas click is planning movement, not aiming a throw. Skipping this is
   * why a click on a perfectly legal receiver would otherwise do nothing.
   */
  async selectActionStep(stepId: string): Promise<void> {
    const stepButton = this.page.getByTestId(`action-step-${stepId}`);
    await expect(stepButton).toBeVisible();
    await stepButton.click();
    await expect(stepButton).toHaveAttribute("data-active", "true");
  }

  // ----- Decision dialogs -----

  rerollDialog(): Locator {
    return this.page.getByTestId("reroll-dialog");
  }

  /** Answer a reroll offer. `source` picks which bank to spend. */
  async answerReroll(
    accept: boolean,
    source: "skill" | "team" = "skill"
  ): Promise<void> {
    await expect(this.rerollDialog()).toBeVisible();
    const testId = accept ? `reroll-use-${source}` : "reroll-decline";
    await this.page.getByTestId(testId).click();
    await expect(this.rerollDialog()).toBeHidden();
  }

  reactionDialog(): Locator {
    return this.page.getByTestId("reaction-dialog");
  }

  async answerReaction(accept: boolean): Promise<void> {
    await expect(this.reactionDialog()).toBeVisible();
    await this.page.getByTestId(accept ? "reaction-yes" : "reaction-no").click();
    await expect(this.reactionDialog()).toBeHidden();
  }

  followUpDialog(): Locator {
    return this.page.getByTestId("follow-up-dialog");
  }

  async answerFollowUp(followUp: boolean): Promise<void> {
    await expect(this.followUpDialog()).toBeVisible();
    await this.page
      .getByTestId(followUp ? "follow-up-yes" : "follow-up-no")
      .click();
    await expect(this.followUpDialog()).toBeHidden();
  }

  blockDiceDialog(): Locator {
    return this.page.getByTestId("block-dice-dialog");
  }

  /**
   * Roll the block dice.
   *
   * The dialog opens showing the strength comparison and a ROLL DICE button —
   * the dice faces only exist afterwards. Skipping this is why a die
   * selector would otherwise wait forever on a dialog that is plainly there.
   */
  async rollBlockDice(): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    const roll = this.page.getByTestId("block-roll-dice");
    if (await roll.isVisible().catch(() => false)) {
      await roll.click();
    }
    // The faces are what the caller is about to click.
    await expect(this.page.getByTestId("block-die-0")).toBeVisible();
  }

  /** Choose a rolled block die by its result type, e.g. "pow". */
  async chooseBlockResult(resultType: string): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    const die = this.blockDiceDialog().locator(
      `[data-block-result="${resultType}"]`
    );
    await expect(
      die.first(),
      `no '${resultType}' die was rolled — the seed may have drifted`
    ).toBeVisible();
    await die.first().click();
  }

  /** Choose whichever die is at this index, regardless of its face. */
  async chooseBlockDie(index: number): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    await this.page.getByTestId(`block-die-${index}`).click();
  }
}

/** Everything a browser case needs, assembled once per test. */
export class GameApp {
  readonly menu: MenuPage;
  readonly sandbox: SandboxPage;
  readonly hud: HudPage;
  readonly pitch: PitchPage;
  readonly bridge: GameBridge;

  constructor(page: Page) {
    this.menu = new MenuPage(page);
    this.sandbox = new SandboxPage(page);
    this.hud = new HudPage(page);
    this.pitch = new PitchPage(page);
    this.bridge = new GameBridge(page);
  }
}
