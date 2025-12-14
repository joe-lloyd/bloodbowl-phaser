import Phaser from "phaser";
import { Team } from "../../types/Team";
import { Player, PlayerStatus } from "../../types/Player";
import { PlayerSprite } from "./PlayerSprite";
import { UIText } from "../../ui";

export class Dugout {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container;
    private team: Team;
    private width: number;
    private height: number;
    private playerSprites: Map<string, Phaser.GameObjects.Container> = new Map();
    private onPlayerDragStart?: (playerId: string) => void;
    private onPlayerDragEnd?: (playerId: string, x: number, y: number) => void;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        team: Team,
        width: number = 1200,
        height: number = 150
    ) {
        this.scene = scene;
        this.team = team;
        this.width = width;
        this.height = height;

        this.container = scene.add.container(x, y);
        this.container.setDepth(0); // Ensure it's behind other UI/players
        this.createLayout();
    }

    private createLayout(): void {
        const sectionHeight = this.height;

        // Calculate section widths
        const reservesWidth = this.width * 0.6;
        const koWidth = this.width * 0.2;
        const deadWidth = this.width * 0.2;

        // 1. Reserves Section (Left)
        this.createSection(
            0,
            0,
            reservesWidth,
            sectionHeight,
            "RESERVES",
            this.team.colors.primary,
            this.getPlayersByStatus("Reserves")
        );

        // 2. KO Section (Middle)
        this.createSection(
            reservesWidth,
            0,
            koWidth,
            sectionHeight,
            "KO",
            0xffaa00,
            this.getPlayersByStatus("KO")
        );

        // 3. Dead/Injured Section (Right)
        this.createSection(
            reservesWidth + koWidth,
            0,
            deadWidth,
            sectionHeight,
            "CASUALTIES",
            0xff0000,
            this.getPlayersByStatus("Dead")
        );
    }

    private createSection(
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        color: number,
        players: Player[]
    ): void {
        // Background
        const bg = this.scene.add.rectangle(x, y, w, h, 0x1a1a2e, 0.8).setOrigin(0);
        const tint = this.scene.add.rectangle(x, y, w, h, color, 0.15).setOrigin(0);

        // Border
        const border = this.scene.add.rectangle(x, y, w, h, color, 0).setOrigin(0);
        border.setStrokeStyle(2, color, 0.5);

        this.container.add([bg, tint, border]);

        // Label
        const text = UIText.createLabel(this.scene, x + 10, y + 5, label);
        text.setScale(0.8);
        this.container.add(text);

        // Render Players in Grid
        this.renderPlayerGrid(players, x + 10, y + 35, w - 20);
    }

    private renderPlayerGrid(players: Player[], startX: number, startY: number, maxWidth: number): void {
        const size = 40; // 32px sprite + spacing
        const cols = Math.floor(maxWidth / size);

        // Hide any sprites that are NOT in this section but tracked by dugout
        // (This handles players moving out of this section or to pitch)
        // Ideally we check all sprites, but here we can only check localized context?
        // Better: In refresh(), hide ALL sprites first?

        players.forEach((player, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            const px = startX + col * size;
            const py = startY + row * size;

            // Check if sprite already exists to preserve state/input
            if (this.playerSprites.has(player.id)) {
                const sprite = this.playerSprites.get(player.id)!;
                sprite.setPosition(px, py);
                sprite.setVisible(true); // Ensure visible if in grid
                if (!this.container.exists(sprite)) {
                    this.container.add(sprite);
                } else {
                    this.container.bringToTop(sprite);
                }
            } else {
                const sprite = this.createPlayerSprite(player, px, py);
                this.playerSprites.set(player.id, sprite);
                this.container.add(sprite);
            }
        });
    }

    private createPlayerSprite(player: Player, x: number, y: number): Phaser.GameObjects.Container {
        const sprite = new PlayerSprite(this.scene, x, y, player, this.team.colors.primary);
        sprite.setSize(32, 32);

        // Setup interactions
        // Note: Interaction (hitArea) is set in PlayerSprite constructor
        sprite.input!.cursor = 'pointer'; // Ensure hand cursor
        this.scene.input.setDraggable(sprite);

        // Hover events for Info Panel
        sprite.on('pointerover', () => {
            (this.scene as any).eventBus?.emit('ui:showPlayerInfo', player);
        });
        sprite.on('pointerout', () => {
            (this.scene as any).eventBus?.emit('ui:hidePlayerInfo');
        });

        sprite.on("dragstart", () => {
            // Bring container to top
            this.container.setDepth(100);
            this.onPlayerDragStart?.(player.id);
        });

        sprite.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
            sprite.x = dragX;
            sprite.y = dragY;
        });

        sprite.on("dragend", () => {
            this.container.setDepth(1);
            // Helper to get world position
            const matrix = sprite.getWorldTransformMatrix();
            this.onPlayerDragEnd?.(player.id, matrix.tx, matrix.ty);
        });

        return sprite;
    }

    public setDragCallbacks(
        onStart: (id: string) => void,
        onEnd: (id: string, x: number, y: number) => void
    ): void {
        this.onPlayerDragStart = onStart;
        this.onPlayerDragEnd = onEnd;
    }

    public refresh(): void {
        this.container.list.forEach(child => {
            if (!(child instanceof PlayerSprite)) {
                child.destroy();
            }
        });

        // Hide all sprites first; createLayout will reveal valid ones
        this.playerSprites.forEach(sprite => sprite.setVisible(false));

        // Note: We are not destroying sprites, just re-layout
        this.createLayout();
    }

    public getContainer(): Phaser.GameObjects.Container {
        return this.container;
    }

    public getSprites(): Map<string, Phaser.GameObjects.Container> {
        return this.playerSprites;
    }

    private getPlayersByStatus(statusType: "Reserves" | "KO" | "Dead"): Player[] {
        return this.team.players.filter(p => {
            if (statusType === "KO") return p.status === PlayerStatus.KO;
            if (statusType === "Dead") return p.status === PlayerStatus.INJURED || p.status === PlayerStatus.DEAD;
            // Reserves = No grid position and Active/Reserve status
            // Note: Use string literal for status until we update player data to start with enum
            return !p.gridPosition && (p.status === PlayerStatus.ACTIVE || p.status === PlayerStatus.RESERVE || !p.status);
        });
    }
}
