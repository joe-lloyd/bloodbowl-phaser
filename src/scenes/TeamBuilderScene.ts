import Phaser from "phaser";
import {
  Team,
  TeamRace,
  createTeam,
  addPlayerToTeam,
  calculateTeamValue,
} from "../types/Team";
import { PlayerPosition, PlayerTemplate, createPlayer } from "../types/Player";
import { getRosterByRace, getPlayerTemplate } from "../data/RosterTemplates";
import * as TeamManager from "../managers/TeamManager";

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

  private selectedRace: TeamRace = TeamRace.HUMAN;
  private treasuryText!: Phaser.GameObjects.Text;
  private teamValueText!: Phaser.GameObjects.Text;
  private rosterContainer!: Phaser.GameObjects.Container;
  private playerListContainer!: Phaser.GameObjects.Container;
  private saveButton!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "TeamBuilderScene" });
  }

  init(data: { team?: Team }): void {
    if (data.team) {
      this.team = data.team;
      this.selectedRace = this.team.race;
      this.selectedColor = this.team.colors.primary;
    } else {
      // Create a default new team
      this.selectedRace = TeamRace.HUMAN;
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
    this.add
      .text(width / 2, 30, "TEAM BUILDER", {
        fontSize: "32px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

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
    this.add.text(x, y, "SELECT RACE:", {
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    const races = Object.values(TeamRace);
    let xOffset = x;
    const yOffset = y + 40;

    races.forEach((race) => {
      const isSelected = this.selectedRace === race;
      const color = isSelected ? "#44ff44" : "#aaaaaa";

      const button = this.add.text(xOffset, yOffset, race, {
        fontSize: "18px",
        color: color,
        backgroundColor: isSelected ? "#333333" : undefined,
        padding: { x: 10, y: 5 },
      });

      button.setInteractive({ useHandCursor: true });
      button.on("pointerdown", () => this.changeRace(race));

      xOffset += button.width + 20;
    });
  }

  private createColorSelection(x: number, y: number): void {
    this.add.text(x, y, "TEAM COLOR:", {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
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

  // ... (rest of the file)

  private createTeamInfoPanel(x: number, y: number): void {
    // Team Name Input
    this.add.text(x, y, "TEAM NAME", {
      fontSize: "24px",
      color: "#ffffff",
      fontStyle: "bold",
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

    this.treasuryText = this.add.text(
      x,
      y + 90,
      `Treasury: ${this.formatGold(this.team.treasury)}`,
      {
        fontSize: "18px",
        color: "#44ff44",
      }
    );

    this.teamValueText = this.add.text(
      x,
      y + 120,
      `Team Value: ${this.formatGold(calculateTeamValue(this.team))}`,
      {
        fontSize: "18px",
        color: "#ffffff",
      }
    );

    // Rerolls
    const rerollCost = getRosterByRace(this.team.race).rerollCost;
    const rerollText = this.add.text(
      x,
      y + 150,
      `Rerolls: ${this.team.rerolls} (${this.formatGold(rerollCost)})`,
      {
        fontSize: "18px",
        color: "#ffffff",
      }
    );

    const buyRerollButton = this.add.text(x + 250, y + 150, "[+]", {
      fontSize: "18px",
      color: "#44ff44",
    });
    buyRerollButton.setInteractive({ useHandCursor: true });
    buyRerollButton.on("pointerdown", () => {
      if (this.team.treasury >= rerollCost) {
        this.team.treasury -= rerollCost;
        this.team.rerolls++;
        rerollText.setText(
          `Rerolls: ${this.team.rerolls} (${this.formatGold(rerollCost)})`
        );
        this.updateUI();
      }
    });
  }

  private createAvailablePlayersPanel(x: number, y: number): void {
    this.add.text(x, y, "AVAILABLE PLAYERS", {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
    });

    this.playerListContainer = this.add.container(x, y + 40);
  }

  private updateAvailablePlayers(): void {
    this.playerListContainer.removeAll(true);

    const roster = getRosterByRace(this.selectedRace);
    let yOffset = 0;

    roster.playerTemplates.forEach((template: PlayerTemplate) => {
      const bg = this.add.rectangle(0, yOffset, 400, 50, 0x2a2a3e).setOrigin(0);
      bg.setStrokeStyle(1, 0x4444ff);

      const text = this.add.text(
        10,
        yOffset + 15,
        `${template.position} - ${this.formatGold(template.cost)}`,
        {
          fontSize: "16px",
          color: "#ffffff",
        }
      );

      const stats = `MA${template.stats.MA} ST${template.stats.ST} AG${template.stats.AG}+ PA${template.stats.PA}+ AV${template.stats.AV}+`;
      const statsText = this.add.text(10, yOffset + 35, stats, {
        fontSize: "12px",
        color: "#aaaaaa",
      });

      const hireBtn = this.add.text(350, yOffset + 15, "HIRE", {
        fontSize: "16px",
        color: "#44ff44",
        fontStyle: "bold",
      });
      hireBtn.setInteractive({ useHandCursor: true });
      hireBtn.on("pointerdown", () => this.hirePlayer(template.position));

      this.playerListContainer.add([bg, text, statsText, hireBtn]);
      yOffset += 60;
    });
  }

  private createCurrentRosterPanel(x: number, y: number): void {
    this.add.text(x, y, "CURRENT ROSTER", {
      fontSize: "20px",
      color: "#ffffff",
      fontStyle: "bold",
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
        `#${player.number} ${player.position} (${player.name})`,
        {
          fontSize: "16px",
          color: "#ffffff",
        }
      );

      const fireBtn = this.add.text(350, yOffset + 10, "X", {
        fontSize: "16px",
        color: "#ff4444",
        fontStyle: "bold",
      });
      fireBtn.setInteractive({ useHandCursor: true });
      fireBtn.on("pointerdown", () => {
        this.team.players.splice(index, 1);
        this.team.treasury += Math.floor(player.cost); // Full refund for now
        this.updateUI();
      });

      this.rosterContainer.add([bg, text, fireBtn]);
      yOffset += 50;
    });
  }

  private createActionButtons(width: number, height: number): void {
    // Back Button
    const backButton = this.add.text(50, height - 60, "← Back to Menu", {
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#333333",
      padding: { x: 15, y: 10 },
    });
    backButton.setInteractive({ useHandCursor: true });
    backButton.on("pointerdown", () => {
      this.scene.start("TeamManagementScene");
    });

    // Save & Continue Button
    this.saveButton = this.add.text(width - 250, height - 60, "Save Team", {
      fontSize: "20px",
      color: "#aaaaaa",
      backgroundColor: "#333333",
      padding: { x: 15, y: 10 },
    });

    this.saveButton.on("pointerdown", () => {
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
    });

    this.updateSaveButtonState();
  }

  private updateSaveButtonState(): void {
    if (!this.saveButton) return;

    const canStart = this.team.players.length >= 7;
    if (canStart) {
      this.saveButton.setColor("#ffffff");
      this.saveButton.setBackgroundColor("#44ff44");
      this.saveButton.setInteractive({ useHandCursor: true });
    } else {
      this.saveButton.setColor("#aaaaaa");
      this.saveButton.setBackgroundColor("#333333");
      this.saveButton.disableInteractive();
    }
  }

  private hirePlayer(position: PlayerPosition): void {
    const roster = getRosterByRace(this.selectedRace);
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

  private changeRace(race: TeamRace): void {
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
