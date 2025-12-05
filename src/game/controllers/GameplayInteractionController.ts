
import Phaser from "phaser";
import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { Pitch } from "../Pitch";
import { PlayerInfoPanel } from "../PlayerInfoPanel";
import { MovementValidator } from "../../domain/validators/MovementValidator";
import { PlayerSprite } from "../PlayerSprite";
import { pixelToGrid } from "../../utils/GridUtils";
import { GamePhase } from "../../types/GameState";

export class GameplayInteractionController {
    private scene: GameScene;
    private gameService: IGameService;
    private pitch: Pitch;
    private movementValidator: MovementValidator;
    private playerInfoPanel: PlayerInfoPanel;

    // State
    private selectedPlayerId: string | null = null;
    private lastHoverGrid: { x: number, y: number } | null = null;

    constructor(
        scene: GameScene,
        gameService: IGameService,
        pitch: Pitch,
        movementValidator: MovementValidator,
        playerInfoPanel: PlayerInfoPanel
    ) {
        this.scene = scene;
        this.gameService = gameService;
        this.pitch = pitch;
        this.movementValidator = movementValidator;
        this.playerInfoPanel = playerInfoPanel;
    }

    public handlePointerDown(pointer: Phaser.Input.Pointer, isSetupActive: boolean): void {
        if (isSetupActive) return;

        const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
        if (valid) {
            this.onSquareClicked(gridX, gridY);
        }
    }

    public handlePointerMove(pointer: Phaser.Input.Pointer, isSetupActive: boolean): void {
        if (isSetupActive) return;

        const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
        if (valid) {
            // Optimize: Only update if grid changed
            if (!this.lastHoverGrid || this.lastHoverGrid.x !== gridX || this.lastHoverGrid.y !== gridY) {
                this.lastHoverGrid = { x: gridX, y: gridY };
                this.onSquareHovered(gridX, gridY);
            }
        } else {
            if (this.lastHoverGrid) {
                this.lastHoverGrid = null;
                this.pitch.clearHover();
                this.pitch.clearPath();
                this.playerInfoPanel.hide();
            }
        }
    }

    private getGridFromPointer(pointer: Phaser.Input.Pointer): { valid: boolean, gridX: number, gridY: number } {
        const pitchContainer = this.pitch.getContainer();
        const localX = pointer.x - pitchContainer.x;
        const localY = pointer.y - pitchContainer.y;

        const pitchW = 26 * 60;
        const pitchH = 15 * 60;

        if (localX >= 0 && localX <= pitchW && localY >= 0 && localY <= pitchH) {
            const gridPos = pixelToGrid(localX, localY, 60);
            return { valid: true, gridX: gridPos.x, gridY: gridPos.y };
        }
        return { valid: false, gridX: -1, gridY: -1 };
    }

    private onSquareClicked(x: number, y: number): void {
        const phase = this.gameService.getPhase();
        const playerAtSquare = this.getPlayerAt(x, y);

        // KICKOFF PHASE
        if (phase === GamePhase.KICKOFF) {
            this.handleKickoffClick(x, y, playerAtSquare);
            return;
        }

        // PLAY PHASE
        if (playerAtSquare) {
            // Select Player
            this.selectPlayer(playerAtSquare.id);
        } else if (this.selectedPlayerId) {
            // Move Player
            this.attemptMove(x, y);
        } else {
            this.deselectPlayer();
        }
    }

    private onSquareHovered(x: number, y: number): void {
        // 1. Highlight Square Cursor
        this.pitch.highlightHoverSquare(x, y);

        // 2. Player Info
        const player = this.getPlayerAt(x, y);
        if (player) {
            this.playerInfoPanel.showPlayer(player);
        } else {
            this.playerInfoPanel.hide();
        }

        // 3. Movement Path
        if (this.selectedPlayerId && !player) {
            this.drawPath(x, y);
        } else {
            this.pitch.clearPath();
        }
    }

    public selectPlayer(playerId: string): void {
        const state = this.gameService.getState();
        const player = this.gameService.getPlayerById(playerId);

        if (!player) return;

        // Only select own team in Play phase (unless inspecting?)
        // Let's allow selecting anyone to inspect, but only highlight movement for active team

        this.deselectPlayer();
        this.selectedPlayerId = playerId;

        // Visual highlight (via Scene or direct sprite access? Scene is better owner of sprites map)
        this.scene.highlightPlayer(playerId);

        // Show Movement Range if own turn
        if (state.activeTeamId === player.teamId) {
            const reachable = this.gameService.getAvailableMovements(playerId);
            reachable.forEach(pos => {
                this.pitch.highlightSquare(pos.x, pos.y, 0x00ff00);
            });
        }
    }

    public deselectPlayer(): void {
        if (this.selectedPlayerId) {
            this.scene.unhighlightPlayer(this.selectedPlayerId);
            this.selectedPlayerId = null;
        }
        this.pitch.clearHighlights();
        this.pitch.clearPath();
    }

    private attemptMove(x: number, y: number): void {
        if (!this.selectedPlayerId) return;

        // Delegate to scene or service? Service handles move, but Scene handles finding path first
        // Let's use the same logic as before, essentially moving it here.

        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (!player || !player.gridPosition) return;

        // Own square check
        if (player.gridPosition.x === x && player.gridPosition.y === y) {
            this.deselectPlayer();
            return;
        }

        const team1 = this.getSceneTeam1();
        const team2 = this.getSceneTeam2();
        const team = (player.teamId === team1.id) ? team1 : team2;
        const opponentTeam = (player.teamId === team1.id) ? team2 : team1;

        const opponents = opponentTeam.players.filter(p => p.gridPosition);
        const teammates = team.players.filter(p => p.gridPosition && p.id !== player.id);

        const result = this.movementValidator.findPath(player, x, y, opponents, teammates);

        if (result.valid) {
            this.gameService.movePlayer(player.id, result.path)
                .then(() => {
                    this.deselectPlayer();
                    // Scene listens to 'playerMoved' to animate/refresh
                })
                .catch(err => {
                    console.error("Move failed", err);
                });
        }
    }

    private drawPath(x: number, y: number): void {
        if (!this.selectedPlayerId) return;
        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (!player || !player.gridPosition) return;

        // Reuse same logic for teams... should probably cache or helper this
        const team1 = this.getSceneTeam1();
        const team2 = this.getSceneTeam2();
        const team = (player.teamId === team1.id) ? team1 : team2;
        const opponentTeam = (player.teamId === team1.id) ? team2 : team1;

        const opponents = opponentTeam.players.filter(p => p.gridPosition);
        const teammates = team.players.filter(p => p.gridPosition && p.id !== player.id);

        const result = this.movementValidator.findPath(player, x, y, opponents, teammates);
        if (result.valid) {
            this.pitch.drawMovementPath(result.path, result.rolls);
        } else {
            this.pitch.clearPath();
        }
    }

    private handleKickoffClick(x: number, y: number, playerAtSquare: any): void {
        // Need to know kickoff step. Scene currently holds it.
        // Option: Move kickoff step state here OR expose it from Scene.
        // Let's expose/manage via Scene for now or pass it in. 
        // For cleaner refactor, let's suggest Scene delegates the specific Kickoff Step too?
        // Let's call a method on Scene for now to keep migration simple
        this.scene.handleKickoffInteraction(x, y, playerAtSquare);
    }

    private getPlayerAt(x: number, y: number): any { // Return Player
        // Helper to find player at grid X,Y
        // Using GameScene's teams...
        const t1 = this.getSceneTeam1();
        const t2 = this.getSceneTeam2();

        return t1.players.find(p => p.gridPosition?.x === x && p.gridPosition?.y === y) ||
            t2.players.find(p => p.gridPosition?.x === x && p.gridPosition?.y === y);
    }

    // Helpers to access Scene data (temporary until full decouple)
    private getSceneTeam1() { return (this.scene as any).team1; }
    private getSceneTeam2() { return (this.scene as any).team2; }
}
