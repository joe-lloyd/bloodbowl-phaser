import Phaser from "phaser";
import {
  Team,
  RosterName,
  createTeam,
  addPlayerToTeam,
  calculateTeamValue,
} from "../types/Team";
import { PlayerTemplate, createPlayer } from "../types/Player";
import { getRosterByRosterName, getPlayerTemplate, getAvailableRosterNames } from "../data/RosterTemplates";
import * as TeamManager from "../managers/TeamManager";
import { UIButton } from "../ui/UIButton";
import { UIText } from "../ui/UIText";

export class TeamBuilderScene extends Phaser.Scene {
  private team!: Team;
  private selectedColor: number = 0xff0000;
  private readonly TEAM_COLORS = [
    0xff0000, // Red
    0x0000ff, // Blue
    0x00ff00, // Green
    0xffff00, // Yellow
    0xff00ff, // Magenta
    0x00ffff, // Cyan
    0xff8800, // Orange
    0x8800ff, // Purple
    0xffffff, // White
    0x888888, // Grey
  ];

  private selectedRace: RosterName = RosterName.HUMAN;
  private treasuryText!: UIText;
  private teamValueText!: UIText;
  private rosterContainer!: Phaser.GameObjects.Container;
  private playerListContainer!: Phaser.GameObjects.Container;
  private saveButton!: UIButton;

  constructor() {
    super({ key: "TeamBuilderScene" });
  }

  init(data: { team?: Team }): void {
    if (data.team) {
      this.team = data.team;
      this.selectedRace = this.team.rosterName;
      this.selectedColor = this.team.colors.primary;
    } else {
      // Create a default new team
      this.selectedRace = RosterName.AMAZON;
      this.selectedColor = 0xff0000;
      // Use a temporary name, user can change it
      this.team = createTeam(
        "New Team",
        this.selectedRace,
        { primary: this.selectedColor, secondary: 0xffffff },
        50000
      );
    }
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0);

    // Header
    UIText.createHeading(this, width / 2, 30, "TEAM BUILDER");

    // Race Selection
    this.createRaceSelection(50, 80);

    // Color Selection
    this.createColorSelection(50, 150);

    // Team Info
    this.createTeamInfoPanel(width - 350, 80);

    // Available Players Panel (Left)
    this.createAvailablePlayersPanel(50, 250);

    // Current Roster Panel (Right)
    this.createCurrentRosterPanel(width - 450, 250);

    // Action Buttons
    this.createActionButtons(width, height);

    this.updateUI();
  }

  private createRaceSelection(x: number, y: number): void {
    new UIText(this, {
      x,
      y,
      text: "SELECT RACE:",
      variant: "h4",
      fontStyle: "bold",
      origin: { x: 0, y: 0 },
    });

    const races = getAvailableRosterNames();
    let xOffset = x;
    const yOffset = y + 40;

    races.forEach((race) => {
      const isSelected = this.selectedRace === race;

      const button = new UIButton(this, {
        x: xOffset,
        y: yOffset,
        text: race,
        variant: isSelected ? "success" : "secondary",
        fontSize: "18px",
        origin: { x: 0, y: 0 },
        onClick: () => this.changeRace(race),
      });

      xOffset += button.width + 20;
    });
  }

  private createColorSelection(x: number, y: number): void {
    new UIText(this, {
      x,
      y,
      text: "TEAM COLOR:",
      variant: "h5",
      fontStyle: "bold",
      origin: { x: 0, y: 0 },
    });

    let xOffset = x + 130;
    const yOffset = y + 10;

    this.TEAM_COLORS.forEach((color) => {
      const isSelected = this.selectedColor === color;

      const circle = this.add.circle(xOffset, yOffset, 12, color);
      circle.setStrokeStyle(
        isSelected ? 3 : 1,
        isSelected ? 0xffffff : 0x888888
      );

      circle.setInteractive({ useHandCursor: true });
      circle.on("pointerdown", () => this.changeColor(color));

      xOffset += 30;
    });
  }

  private changeColor(color: number): void {
    this.selectedColor = color;
    this.team.colors.primary = color;

    // Save immediately
    TeamManager.saveTeams(
      TeamManager.loadTeams().map((t: Team) =>
        t.id === this.team.id ? this.team : t
      )
    );

    // Refresh UI (re-render scene to update color selection highlight)
    this.scene.restart({ team: this.team });
  }

  private createTeamInfoPanel(x: number, y: number): void {
    // Team Name Input
    new UIText(this, {
      x,
      y,
      text: "TEAM NAME",
      variant: "h4",
      fontStyle: "bold",
      origin: { x: 0, y: 0 },
    });

    // Team Name Input using DOM Element
    const inputElement = this.add.dom(x + 150, y + 60, "input", {
      type: "text",
      name: "teamName",
      value: this.team.name,
      style:
        "font-size: 20px; padding: 5px; width: 280px; color: black; background-color: white; border: none;",
    });

    inputElement.addListener("input");
    inputElement.on("input", (event: any) => {
      const newName = event.target.value;
      if (newName && newName.trim().length > 0) {
        this.team.name = newName.trim();
        // Auto-save on input change
        TeamManager.saveTeams(
          TeamManager.loadTeams().map((t: Team) =>
            t.id === this.team.id ? this.team : t
          )
        );
      }
    });

    this.treasuryText = new UIText(this, {
      x,
      y: y + 90,
      text: `Treasury: ${this.formatGold(this.team.treasury)}`,
      variant: "body",
      color: "#44ff44",
      origin: { x: 0, y: 0 },
    });

    this.teamValueText = new UIText(this, {
      x,
      y: y + 120,
      text: `Team Value: ${this.formatGold(calculateTeamValue(this.team))}`,
      variant: "body",
      origin: { x: 0, y: 0 },
    });

    // Rerolls
    const rerollCost = getRosterByRosterName(this.team.rosterName).rerollCost;
    const rerollText = new UIText(this, {
      x,
      y: y + 150,
      text: `Rerolls: ${this.team.rerolls} (${this.formatGold(rerollCost)})`,
      variant: "body",
      origin: { x: 0, y: 0 },
    });

    new UIButton(this, {
      x: x + 250,
      y: y + 150,
      text: "[+]",
      variant: "success",
      fontSize: "18px",
      origin: { x: 0, y: 0 },
      onClick: () => {
        if (this.team.treasury >= rerollCost) {
          this.team.treasury -= rerollCost;
          this.team.rerolls++;
          rerollText.setText(
            `Rerolls: ${this.team.rerolls} (${this.formatGold(rerollCost)})`
          );
          this.updateUI();
        }
      },
    });
  }

  private createAvailablePlayersPanel(x: number, y: number): void {
    new UIText(this, {
      x,
      y,
      text: "AVAILABLE PLAYERS",
      variant: "h5",
      fontStyle: "bold",
      origin: { x: 0, y: 0 },
    });

    this.playerListContainer = this.add.container(x, y + 40);
  }

  private updateAvailablePlayers(): void {
    this.playerListContainer.removeAll(true);

    const roster = getRosterByRosterName(this.selectedRace);
    let yOffset = 0;

    roster.playerTemplates.forEach((template: PlayerTemplate) => {
      const bg = this.add.rectangle(0, yOffset, 400, 140, 0x2a2a3e).setOrigin(0);
      bg.setStrokeStyle(1, 0x4444ff);

      const text = this.add.text(
        10,
        yOffset + 15,
        `${template.positionName} - ${this.formatGold(template.cost)}`,
        {
          fontSize: "16px",
          color: "#ffffff",
          fontStyle: "bold",
        }
      );

      const keywordsText = this.add.text(
        10,
        yOffset + 35,
        `Keywords: ${template.keywords.join(", ")}`,
        {
          fontSize: "12px",
          color: "#cccccc",
        }
      );

      const skillNames = template.skills.map((s) => s.type).join(", ");
      const skillsText = this.add.text(
        10,
        yOffset + 55,
        `Skills: ${skillNames.length > 0 ? skillNames : "None"}`,
        {
          fontSize: "12px",
          color: "#44ff44",
          wordWrap: { width: 380 },
        }
      );

      const primary = template.primary.join(", ");
      const secondary = template.secondary.join(", ");
      const categoriesText = this.add.text(
        10,
        yOffset + (skillsText.height + 60), // Dynamic positioning based on wrapped skills
        `Primary: ${primary} | Secondary: ${secondary}`,
        {
          fontSize: "12px",
          color: "#ffff44",
        }
      );

      const stats = `MA${template.stats.MA} ST${template.stats.ST} AG${template.stats.AG}+ PA${template.stats.PA}+ AV${template.stats.AV}+`;
      const statsText = this.add.text(
        10,
        yOffset + (skillsText.height + 80),
        stats,
        {
          fontSize: "14px",
          color: "#ffffff",
          fontStyle: "bold"
        }
      );

      const hireBtn = new UIButton(this, {
        x: 350,
        y: yOffset + 15,
        text: "HIRE",
        variant: "success",
        fontSize: "16px",
        origin: { x: 0, y: 0 },
        onClick: () => this.hirePlayer(template.positionName),
      });

      this.playerListContainer.add([
        bg,
        text,
        keywordsText,
        skillsText,
        categoriesText,
        statsText,
        hireBtn,
      ]);
      yOffset += 150;
    });
  }

  private createCurrentRosterPanel(x: number, y: number): void {
    new UIText(this, {
      x,
      y,
      text: "CURRENT ROSTER",
      variant: "h5",
      fontStyle: "bold",
      origin: { x: 0, y: 0 },
    });

    this.rosterContainer = this.add.container(x, y + 40);
  }

  private updatePlayerList(): void {
    this.rosterContainer.removeAll(true);
    let yOffset = 0;

    this.team.players.forEach((player, index) => {
      const bg = this.add.rectangle(0, yOffset, 400, 40, 0x2a2a3e).setOrigin(0);
      bg.setStrokeStyle(1, 0x4444ff);

      const text = this.add.text(
        10,
        yOffset + 10,
        `#${player.number} ${player.positionName} (${player.name})`,
        {
          fontSize: "16px",
          color: "#ffffff",
        }
      );

      const fireBtn = new UIButton(this, {
        x: 350,
        y: yOffset + 10,
        text: "X",
        variant: "danger",
        fontSize: "16px",
        origin: { x: 0, y: 0 },
        onClick: () => {
          this.team.players.splice(index, 1);
          this.team.treasury += Math.floor(player.cost); // Full refund for now
          this.updateUI();
        },
      });

      this.rosterContainer.add([bg, text, fireBtn]);
      yOffset += 50;
    });
  }

  private createActionButtons(width: number, height: number): void {
    // Back Button
    new UIButton(this, {
      x: 50,
      y: height - 60,
      text: "← Back to Menu",
      variant: "secondary",
      origin: { x: 0, y: 0 },
      onClick: () => {
        this.scene.start("TeamManagementScene");
      },
    });

    // Save & Continue Button
    this.saveButton = new UIButton(this, {
      x: width - 250,
      y: height - 60,
      text: "Save Team",
      variant: "primary",
      origin: { x: 0, y: 0 },
      disabled: true,
      onClick: () => {
        if (this.team.players.length >= 7) {
          // Save team
          const teams = TeamManager.loadTeams();
          const existingIndex = teams.findIndex(
            (t: Team) => t.id === this.team.id
          );
          if (existingIndex >= 0) {
            teams[existingIndex] = this.team;
          } else {
            teams.push(this.team);
          }
          TeamManager.saveTeams(teams);

          this.scene.start("TeamManagementScene");
        }
      },
    });

    this.updateSaveButtonState();
  }

  private updateSaveButtonState(): void {
    if (!this.saveButton) return;

    const canStart = this.team.players.length >= 7;
    this.saveButton.setDisabled(!canStart);
  }

  private hirePlayer(position: string): void {
    const roster = getRosterByRosterName(this.selectedRace);
    const template = getPlayerTemplate(roster, position);

    if (!template) return;

    if (this.team.treasury >= template.cost) {
      const playerNumber = this.team.players.length + 1;
      const player = createPlayer(template, this.team.id, playerNumber);

      if (addPlayerToTeam(this.team, player)) {
        // Treasury is already updated in addPlayerToTeam
        this.updateUI();
      }
    }
  }

  private changeRace(race: RosterName): void {
    if (this.team.players.length > 0) {
      if (!confirm("Changing race will clear your current roster. Continue?")) {
        return;
      }
    }

    this.selectedRace = race;
    // Create new team with default settings
    this.team = createTeam(
      this.team.name,
      race,
      { primary: this.selectedColor, secondary: 0xffffff },
      50000
    );
    this.updateUI();

    // Refresh race selection UI
    this.scene.restart({ team: this.team });
  }

  private updateUI(): void {
    this.treasuryText.setText(
      `Treasury: ${this.formatGold(this.team.treasury)}`
    );
    this.teamValueText.setText(
      `Team Value: ${this.formatGold(calculateTeamValue(this.team))}`
    );
    this.updateAvailablePlayers();
    this.updatePlayerList();
    this.updateSaveButtonState();
  }

  private formatGold(amount: number): string {
    return amount.toLocaleString() + " GP";
  }
}
