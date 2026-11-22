import { type Locator, type Page, expect } from "@playwright/test";
import { GameBridge } from "./bridge";
import { PitchPage } from "./pitch";

export class MenuPage {
  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  async open(): Promise<void> {
    await this.page.goto("/");
    await expect(
      this.page.getByRole("heading", { name: "BLOOD BOWL", exact: true })
    ).toBeVisible();
  }

  playLocal(): Promise<void> {
    return this.page.getByRole("button", { name: "Play Local" }).click();
  }

  openTeams(): Promise<void> {
    return this.page
      .getByRole("button", { name: "Teams", exact: true })
      .click();
  }

  openSandbox(): Promise<void> {
    return this.page.getByRole("button", { name: /Sandbox/ }).click();
  }

  resumeLocalMatch(): Locator {
    return this.page.getByTestId("resume-local-match");
  }
}

export class SandboxPage {
  readonly pitch: PitchPage;
  readonly bridge: GameBridge;

  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
    this.pitch = new PitchPage(page);
    this.bridge = new GameBridge(page);
  }

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

    if (params?.scenario) await this.waitForScenarioLoaded();
  }

  scenarioInfo(): Locator {
    return this.page.getByTestId("sandbox-scenario-info");
  }

  async waitForScenarioLoaded(timeout = 20_000): Promise<void> {
    await expect(this.scenarioInfo()).toBeAttached({ timeout });
  }

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

  async loadCoreScenario(id: string): Promise<void> {
    await this.topicSelect().selectOption("core");
    await this.coreScenarioSelect().selectOption(id);
  }
}

export class HudPage {
  readonly bridge: GameBridge;
  readonly pitch: PitchPage;

  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
    this.bridge = new GameBridge(page);
    this.pitch = new PitchPage(page);
  }

  actionMenu(): Locator {
    return this.page.getByTestId("player-action-menu");
  }

  actionButton(action: string): Locator {
    return this.page.getByTestId(`action-${action}`);
  }

  replacementButton(action: string, replacement: string): Locator {
    return this.page.getByTestId(`action-${action}-${replacement}`);
  }

  async declareAction(playerRef: string, action: string): Promise<void> {
    await this.pitch.clickPlayer(playerRef);
    await expect(this.actionMenu()).toBeVisible();
    await this.actionButton(action).click();
    await this.rollNegatraitIfAsked(playerRef);
  }

  negatraitConfirm(): Locator {
    return this.page
      .getByTestId("confirmation-modal")
      .filter({ hasText: "must roll first" });
  }

  plannedActivationRoll(): Locator {
    return this.page
      .getByTestId("action-plan")
      .filter({ hasText: "Before acting" });
  }

  async rollNegatraitIfAsked(playerRef: string): Promise<void> {
    const id = await this.bridge.resolveRef(playerRef);
    const confirm = this.negatraitConfirm();
    const planned = this.plannedActivationRoll();
    await expect
      .poll(
        async () =>
          (await confirm.isVisible()) ||
          (await planned.isVisible()) ||
          (await this.bridge.snapshot()).activePlayer?.id === id,
        { timeout: 3_000 }
      )
      .toBe(true)
      .catch(() => {});
    if (await confirm.isVisible()) {
      await confirm.getByRole("button", { name: "Roll", exact: true }).click();
    } else if (await planned.isVisible()) {
      await this.page.getByTestId("action-plan-go").click();
    }
  }

  endTurn(): Locator {
    return this.page.getByTestId("end-turn");
  }

  async selectActionStep(stepId: string): Promise<void> {
    const stepButton = this.page.getByTestId(`action-step-${stepId}`);
    await expect(stepButton).toBeVisible();
    await stepButton.click();
    await expect(stepButton).toHaveAttribute("data-active", "true");
  }

  rerollDialog(): Locator {
    return this.page.getByTestId("reroll-dialog");
  }

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
    await this.page
      .getByTestId(accept ? "reaction-yes" : "reaction-no")
      .click();
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

  async rollBlockDice(): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    const roll = this.page.getByTestId("block-roll-dice");
    if (await roll.isVisible().catch(() => false)) {
      await roll.click();
    }

    await expect(this.page.getByTestId("block-die-0")).toBeVisible();
  }

  async chooseBlockResult(resultType: string): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    const die = this.blockDiceDialog().locator(
      `[data-block-result="${resultType}"]`
    );
    await expect(
      die.first(),
      `no '${resultType}' die was rolled — the seed may have drifted`
    ).toBeVisible();

    await die.first().focus();
    await die.first().press("Enter");
  }

  async chooseBlockDie(index: number): Promise<void> {
    await expect(this.blockDiceDialog()).toBeVisible();
    const die = this.page.getByTestId(`block-die-${String(index)}`);
    await die.focus();
    await die.press("Enter");
  }
}

export class GameApp {
  readonly menu: MenuPage;
  readonly sandbox: SandboxPage;
  readonly hud: HudPage;
  readonly pitch: PitchPage;
  readonly bridge: GameBridge;

  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
    this.menu = new MenuPage(page);
    this.sandbox = new SandboxPage(page);
    this.hud = new HudPage(page);
    this.pitch = new PitchPage(page);
    this.bridge = new GameBridge(page);
  }

  async rollWeather(timeout = 60_000): Promise<void> {
    const roll = this.page.getByRole("button", { name: "ROLL WEATHER" });
    await roll.waitFor({ timeout });
    await roll.click();
    await this.page
      .getByRole("button", { name: "ON TO THE COIN TOSS" })
      .click({ timeout: 15_000 });
  }

  async rollKickoff(timeout = 30_000): Promise<void> {
    const roll = this.page.getByRole("button", { name: "ROLL KICK-OFF" });
    await roll.click({ timeout });
    await this.page
      .getByTestId("kickoff-table-dialog")
      .waitFor({ state: "detached", timeout: 20_000 });
  }
}
