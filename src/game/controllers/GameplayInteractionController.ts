
import Phaser from "phaser";
import { GameScene } from "../../scenes/GameScene";
import { IGameService } from "../../services/interfaces/IGameService";
import { Pitch } from "../elements/Pitch";
import { MovementValidator } from "../validators/MovementValidator";
import { pixelToGrid } from "../elements/GridUtils";
import { GamePhase, SubPhase } from "../../types/GameState";
import { IEventBus } from "../../services/EventBus";
import { Player } from "@/types";

export class GameplayInteractionController {
    private scene: GameScene;
    private gameService: IGameService;
    private eventBus: IEventBus;
    private pitch: Pitch;
    private movementValidator: MovementValidator;

    // State
    private selectedPlayerId: string | null = null;
    private lastHoverGrid: { x: number, y: number } | null = null;
    private waypoints: { x: number, y: number }[] = [];
    private pendingMove: { playerId: string, path: { x: number, y: number }[] } | null = null;

    // Push direction selection state
    private pushSelectionActive: boolean = false;
    private pushValidDirections: { x: number; y: number }[] = [];
    private pushDefenderId: string = '';
    private pushAttackerId: string = ''; // Track attacker ID
    private pushResultType: string = '';
    private pushHighlights: Phaser.GameObjects.Rectangle[] = []; // Store highlight references

    constructor(
        scene: GameScene,
        gameService: IGameService,
        eventBus: IEventBus,
        pitch: Pitch,
        movementValidator: MovementValidator
    ) {
        this.scene = scene;
        this.gameService = gameService;
        this.eventBus = eventBus;
        this.pitch = pitch;
        this.movementValidator = movementValidator;

        // Listen for confirmation
        this.eventBus.on('ui:confirmationResult', this.onConfirmationResult);

        // Listen for push direction selection request
        this.eventBus.on('ui:selectPushDirection', (data: any) => {
            this.startPushDirectionSelection(data);
        });
    }

    public handlePointerDown(pointer: Phaser.Input.Pointer, isSetupActive: boolean): void {
        if (isSetupActive) return;

        const { valid, gridX, gridY } = this.getGridFromPointer(pointer);
        if (valid) {
            this.onSquareClicked(gridX, gridY);
        } else {
            // Clicked outside pitch -> Deselect
            this.deselectPlayer();
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
            this.lastHoverGrid = null;
            this.pitch.clearHover();
            this.pitch.clearPath();
            this.eventBus.emit('ui:hidePlayerInfo');
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
        // Check if we're selecting a push direction first
        if (this.handlePushDirectionClick(x, y)) {
            return; // Push direction was selected, done
        }

        const phase = this.gameService.getPhase();
        const playerAtSquare = this.getPlayerAt(x, y);

        // KICKOFF PHASE
        if (phase === GamePhase.KICKOFF) {
            this.handleKickoffClick(x, y, playerAtSquare);
            return;
        }

        // PLAY PHASE
        if (playerAtSquare) {
            // Clicking ANOTHER player?
            if (playerAtSquare.id !== this.selectedPlayerId) {

                // BLOCK CHECK
                // If we have a selected player who is Active, Adjacent, and an Enemy -> BLOCK PREVIEW
                if (this.selectedPlayerId) {
                    const selectedPlayer = this.gameService.getPlayerById(this.selectedPlayerId);
                    const state = this.gameService.getState();

                    if (selectedPlayer &&
                        state.activeTeamId === selectedPlayer.teamId &&
                        this.gameService.canActivate(selectedPlayer.id) &&
                        selectedPlayer.teamId !== playerAtSquare.teamId
                    ) {
                        // Check Adjacency
                        const dx = Math.abs((selectedPlayer.gridPosition?.x || 0) - x);
                        const dy = Math.abs((selectedPlayer.gridPosition?.y || 0) - y);

                        if (dx <= 1 && dy <= 1) {
                            // IT'S A BLOCK!
                            // Deselect player to clear movement path/highlights
                            this.deselectPlayer();
                            // Trigger Block Preview
                            this.gameService.previewBlock(selectedPlayer.id, playerAtSquare.id);
                            return;
                        }
                    }
                }

                // If not a block, select them (inspection)
                this.selectPlayer(playerAtSquare.id);

            } else {
                // Clicking SELF?
                // Confirm logic (unchanged)
            }
        } else if (this.selectedPlayerId) {
            // Empty Square Click
            const player = this.gameService.getPlayerById(this.selectedPlayerId);
            const state = this.gameService.getState();

            // Only allow movement planning if active team and player can activate
            if (player && state.activeTeamId === player.teamId && this.gameService.canActivate(player.id)) {
                // Check if clicking the LAST added waypoint (or current pos if none) -> CONFIRM
                const lastPos = this.waypoints.length > 0
                    ? this.waypoints[this.waypoints.length - 1]
                    : player.gridPosition;

                if (lastPos && lastPos.x === x && lastPos.y === y) {
                    // CONFIRM MOVE
                    this.executeMove();
                } else {
                    // ADD WAYPOINT
                    this.addWaypoint(x, y);
                }
            } else {
                this.deselectPlayer();
            }
        } else {
            this.deselectPlayer(); // Clicking empty space with no selection
        }
    }

    private onSquareHovered(x: number, y: number): void {
        // 1. Highlight Square Cursor
        this.pitch.highlightHoverSquare(x, y);

        // 2. Player Info
        const player = this.getPlayerAt(x, y);
        if (player) {
            this.eventBus.emit('ui:showPlayerInfo', player);
        } else {
            this.eventBus.emit('ui:hidePlayerInfo');
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

        // Interaction Check: Only active team's turn?
        // User asked: "only the player in control can move their own pieces".
        // Allow selection for inspection at any time, but movement only if active.
        const canActivate = this.gameService.canActivate(playerId);

        // Check for previous incomplete activation
        // If another player was partially moved, we must finish them before selecting a new one.
        // Or, more strictly: selecting a NEW player implies ending the previous player's turn if they moved.
        if (this.selectedPlayerId && this.selectedPlayerId !== playerId) {
            const prevUsed = this.gameService.getMovementUsed(this.selectedPlayerId);
            const prevActed = this.gameService.hasPlayerActed(this.selectedPlayerId);

            // If they used movement but aren't marked as acted rigid, mark them now.
            if (prevUsed > 0 && !prevActed) {
                this.gameService.finishActivation(this.selectedPlayerId);
            }
        }

        this.deselectPlayer();
        this.selectedPlayerId = playerId;

        const isOwnTurn = state.activeTeamId === player.teamId;

        // Visual highlight
        this.scene.highlightPlayer(playerId);

        // UI Selection Event
        this.eventBus.emit('playerSelected', { player });

        // Show Movement Range & Tackle Zones if own turn AND can activate
        if (isOwnTurn && canActivate) {
            const reachable = this.gameService.getAvailableMovements(playerId);

            // Calculate remaining SAFE MA (for overlay coloring)
            const used = this.gameService.getMovementUsed(playerId);
            const remainingSafeMA = Math.max(0, player.stats.MA - used);

            // Separate into Safe (<= RemainingMA) and Sprint (> RemainingMA)
            const safeMoves: { x: number, y: number }[] = [];
            const sprintMoves: { x: number, y: number }[] = [];

            reachable.forEach(move => {
                if (move.cost !== undefined && move.cost > remainingSafeMA) {
                    sprintMoves.push(move);
                }
                // All are "reachable" for the overlay to NOT be dark
                safeMoves.push(move);
            });

            // Show Overlay (Inverse of ALL reachable)
            this.pitch.drawRangeOverlay(reachable);

            // Show Sprint Risks
            this.pitch.drawSprintRisks(sprintMoves);

            // Show Tackle Zones
            // Get all opposing players with tackle zones (standing, not stunned/prone)
            const opponents = this.getOpposingPlayers(player.teamId);
            const tackleZones: { x: number, y: number }[] = [];

            opponents.forEach(op => {
                if (op.status === 'Active' && op.gridPosition) { // Assuming 'Active' implies standing
                    // Add 8 squares around
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue;
                            const tx = op.gridPosition.x + dx;
                            const ty = op.gridPosition.y + dy;
                            // Check bounds (0-25, 0-14)
                            if (tx >= 0 && tx < 26 && ty >= 0 && ty < 15) {
                                tackleZones.push({ x: tx, y: ty });
                            }
                        }
                    }
                }
            });
            this.pitch.drawTackleZones(tackleZones);
        }
    }

    public deselectPlayer(): void {
        if (this.selectedPlayerId) {
            this.scene.unhighlightPlayer(this.selectedPlayerId);
            this.selectedPlayerId = null;
        }
        this.waypoints = [];
        this.pitch.clearHighlights(); // Clears overlays too
        this.pitch.clearPath();

        // Notify UI
        this.eventBus.emit('playerSelected', { player: null }); // OR add explicit deselect event
    }

    private addWaypoint(x: number, y: number): void {
        if (!this.selectedPlayerId) return;
        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (!player) return;

        // Get Path for this segment
        const startPos = this.waypoints.length > 0 ? this.waypoints[this.waypoints.length - 1] : player.gridPosition!;

        // Use pathfinder for this segment (smart pathing between clicks)
        const team = (player.teamId === this.getSceneTeam1().id) ? this.getSceneTeam1() : this.getSceneTeam2();
        const opponentTeam = (player.teamId === this.getSceneTeam1().id) ? this.getSceneTeam2() : this.getSceneTeam1();

        const opponents = opponentTeam.players.filter((p: any) => p.gridPosition);
        const teammates = team.players.filter((p: any) => p.gridPosition && p.id !== player.id);
        const mockPlayer = { ...player, gridPosition: startPos };

        const result = this.movementValidator.findPath(mockPlayer as any, x, y, opponents, teammates);

        if (result.valid) {
            // Add path to waypoints (excluding start, including end)
            // Result.path includes the steps.

            // Check TOTAL path length limit (Remaining MA + 2)
            const used = this.gameService.getMovementUsed(player.id);
            const totalAllowance = player.stats.MA + 2;
            const remainingAllowance = Math.max(0, totalAllowance - used);

            const currentLen = this.waypoints.length;
            const newLen = currentLen + result.path.length;

            if (newLen <= remainingAllowance) {
                this.waypoints.push(...result.path);
                this.drawCurrentPath();
            } else {
                console.warn("Path too long!", { newLen, remainingAllowance, used });
                // Feedback?
            }
        }
    }

    private executeMove(): void {
        if (!this.selectedPlayerId || this.waypoints.length === 0) return;

        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (!player) return;

        const totalSteps = this.waypoints.length;
        const used = this.gameService.getMovementUsed(player.id);
        const ma = player.stats.MA;
        const remainingSafeMA = Math.max(0, ma - used); // MA remaining before GFI

        // Check if this move requires GFI (Sprint)
        // If we have 0 safe MA left, ALL steps are sprints.
        // steps > remainingSafeMA
        if (totalSteps > remainingSafeMA) {
            const extraSteps = totalSteps - remainingSafeMA;

            this.pendingMove = {
                playerId: this.selectedPlayerId,
                path: [...this.waypoints]
            };

            this.eventBus.emit('ui:requestConfirmation', {
                actionId: 'sprint-confirm',
                title: 'Sprint Required! (GFI)',
                message: `This move goes ${extraSteps} square(s) beyond MA.\n` +
                    `You must roll a 2+ for each extra square.\n` +
                    `Rolling a 1 causes a Fall & Turnover.\n\n` +
                    `Do you want to Sprint?`,
                confirmLabel: 'Sprint!',
                cancelLabel: 'Cancel',
                risky: true
            });
            return;
        }

        // Normal Move (No Sprint)
        this.finalizeMove(this.selectedPlayerId, this.waypoints);
    }

    private finalizeMove(playerId: string, path: { x: number, y: number }[]): void {
        this.gameService.movePlayer(playerId, path)
            .then(() => {
                // Do NOT auto-finish activation here.
                // Allow partial moves. GameService will auto-finish if MA+2 is used.
                // this.gameService.finishActivation(playerId);

                // Do NOT deselect if still active.
                // If activation NOT finished, keep selected?
                // How do we know from here?
                // Check canActivate? canActivate is TRUE until finished.



                // If we used all movement, it should be finished.
                // If GameService finished it, we should deselect.
                // Listener for 'playerActivated' handles visual update, but DESELECTION?

                // If player is still legally active/selected, we keep them selected for next move.
                // If we deselect, user has to re-select. That's annoying for partial moves.

                // If player IS activated, deselect.
                if (this.gameService.hasPlayerActed(playerId)) {
                    this.deselectPlayer();
                } else {
                    // Keep selected, clear waypoints so they can plot next "leg"
                    this.waypoints = [];
                    this.pitch.clearPath();

                    // REFRESH SELECTION logic to update the Range Overlay
                    // calling selectPlayer again will re-fetch available movements (which now include used)
                    this.selectPlayer(playerId);
                }

                this.pendingMove = null;
            })
            .catch(err => {
                console.error("Move failed", err);
                this.deselectPlayer();
                this.pendingMove = null;
            });
    }

    public destroy(): void {
        // Cleanup listeners
        this.eventBus.off('ui:confirmationResult', this.onConfirmationResult);
    }

    private onConfirmationResult = (data: { confirmed: boolean, actionId: string }) => {
        if (data.actionId === 'sprint-confirm') {
            if (data.confirmed && this.pendingMove) {
                this.finalizeMove(this.pendingMove.playerId, this.pendingMove.path);
            } else {
                // Canceled
                this.pendingMove = null;
            }
        }
    };

    private drawCurrentPath(): void {
        if (!this.selectedPlayerId) return;

        // We need to calculate rolls for the FULL path to visualize correctly
        // Recalculate rolls based on full sequence
        // This is a bit heavy but ensures correct visualization (dodge/gfi)

        // TODO: Use a validator helper to "Analyze Path"
        // For now, simple draw
        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (player && player.gridPosition) {
            const fullPath = [
                { x: player.gridPosition.x, y: player.gridPosition.y },
                ...this.waypoints
            ];
            this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
        }
    }

    private drawPath(x: number, y: number): void {
        if (!this.selectedPlayerId) return;
        const player = this.gameService.getPlayerById(this.selectedPlayerId);
        if (!player) return;

        // Don't draw preview if not active team
        const state = this.gameService.getState();
        if (state.activeTeamId !== player.teamId) return;

        // Start from last waypoint
        const startPos = this.waypoints.length > 0 ? this.waypoints[this.waypoints.length - 1] : player.gridPosition!;

        // Find path for segment
        const team = (player.teamId === this.getSceneTeam1().id) ? this.getSceneTeam1() : this.getSceneTeam2();
        const opponentTeam = (player.teamId === this.getSceneTeam1().id) ? this.getSceneTeam2() : this.getSceneTeam1();

        const opponents = opponentTeam.players.filter((p: any) => p.gridPosition);
        const teammates = team.players.filter((p: any) => p.gridPosition && p.id !== player.id);

        const mockPlayer = { ...player, gridPosition: startPos };
        const result = this.movementValidator.findPath(mockPlayer as any, x, y, opponents, teammates);

        if (result.valid) {
            // Combine confirmed waypoints + preview path
            // ALSO include the player's current position as the start of the visual path
            const fullPath = [
                { x: player.gridPosition!.x, y: player.gridPosition!.y },
                ...this.waypoints,
                ...result.path
            ];
            // TODO: Get rolls for full path
            this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
        } else {
            // Just draw existing waypoints if preview is invalid
            if (this.waypoints.length > 0) {
                const fullPath = [
                    { x: player.gridPosition!.x, y: player.gridPosition!.y },
                    ...this.waypoints
                ];
                this.pitch.drawMovementPath(fullPath, [], player.stats.MA);
            } else {
                this.pitch.clearPath();
            }
        }
    }

    private handleKickoffClick(x: number, y: number, playerAtSquare: any): void {
        const subPhase = this.gameService.getSubPhase();

        if (subPhase === SubPhase.SETUP_KICKOFF) {
            // If clicking on a player
            if (playerAtSquare) {
                // If own player -> Select/Switch Kicker
                const kickingTeam = this.scene.kickingTeam;
                if (playerAtSquare.teamId === kickingTeam.id) {
                    // Unhighlight previous if exists
                    if (this.selectedPlayerId && this.selectedPlayerId !== playerAtSquare.id) {
                        this.scene.unhighlightPlayer(this.selectedPlayerId);
                    }

                    this.selectedPlayerId = playerAtSquare.id;
                    this.scene.highlightPlayer(playerAtSquare.id);
                    this.gameService.selectKicker(playerAtSquare.id);
                    this.eventBus.emit('ui:notification', "Kicker Selected! Now choose target.");
                    return;
                }
            }

            // If clicking on a square (Target)
            // Validate Target (Must be opponent half)
            const isTeam1Kicking = this.scene.kickingTeam.id === this.scene.team1.id;
            // Pitch width 20, minus the end zones its 18, divided by 3
            // team one setup is 1-7, no mans land is 8-13, team two setup is 14-20
            const isOpponentHalf = isTeam1Kicking ? (x >= 7) : (x <= 13);

            if (!isOpponentHalf) {
                // If they clicked an empty square in their own half
                if (this.selectedPlayerId) {
                    this.eventBus.emit('ui:notification', "Kick to opponent's half!");
                }
                return;
            }

            // If we have a selected kicker and clicked opponent half -> KICK!
            if (this.selectedPlayerId) {
                this.gameService.kickBall(this.selectedPlayerId, x, y);
                this.selectedPlayerId = null; // Clear selection after kick
            } else {
                this.eventBus.emit('ui:notification', "Select a Kicker first!");
            }
        }
    }

    private getPlayerAt(x: number, y: number): Player | null {
        const t1 = this.getSceneTeam1();
        const t2 = this.getSceneTeam2();
        const players = [...t1.players, ...t2.players];

        return players.find(p => p.gridPosition?.x === x && p.gridPosition?.y === y) || null;
    }

    // Helpers to access Scene data (temporary until full decouple)
    private getSceneTeam1() { return this.scene.team1; }
    private getSceneTeam2() { return this.scene.team2; }

    private getOpposingPlayers(myTeamId: string): any[] {
        const t1 = this.getSceneTeam1();
        const t2 = this.getSceneTeam2();
        return (myTeamId === t1.id) ? t2.players : t1.players;
    }

    /**
     * Start push direction selection mode
     */
    private startPushDirectionSelection(data: any): void {
        console.log('[Push Selection] Starting with data:', data);

        this.pushSelectionActive = true;
        this.pushValidDirections = data.validDirections || [];
        this.pushDefenderId = data.defenderId;
        this.pushAttackerId = data.attackerId || ''; // Store attacker ID
        this.pushResultType = data.resultType || '';

        // Clear any existing highlights first
        this.clearPushHighlights();
        this.pitch.clearHighlights();
        this.pitch.clearPath();

        // Highlight the valid push squares and store references
        this.pushHighlights = [];
        this.pushValidDirections.forEach(dir => {
            console.log('[Push Selection] Highlighting square:', dir);
            const highlight = this.pitch.highlightSquare(dir.x, dir.y, 0xFFFF00); // Yellow highlight
            this.pushHighlights.push(highlight);
        });
    }

    /**
     * Handle click on a push direction square
     */
    private handlePushDirectionClick(x: number, y: number): boolean {
        if (!this.pushSelectionActive) return false;

        console.log('[Push Selection] Click at:', x, y);

        // Check if clicked square is a valid push direction
        const isValid = this.pushValidDirections.some(dir => dir.x === x && dir.y === y);

        if (isValid) {
            console.log('[Push Selection] Valid square clicked, executing push');

            // Execute the push with attacker ID
            this.gameService.executePush(this.pushAttackerId, this.pushDefenderId, { x, y }, this.pushResultType, false);

            // Clear push selection state
            this.pushSelectionActive = false;
            this.pushValidDirections = [];
            this.pushDefenderId = '';
            this.pushAttackerId = ''; // Clear attacker ID
            this.pushResultType = '';

            // Explicitly destroy the highlight rectangles
            this.clearPushHighlights();

            // Also clear general highlights and paths
            this.pitch.clearHighlights();
            this.pitch.clearPath();

            console.log('[Push Selection] Cleared highlights and paths');

            return true;
        }

        console.log('[Push Selection] Invalid square clicked');
        return false;
    }

    /**
     * Clear push direction highlights
     */
    private clearPushHighlights(): void {
        this.pushHighlights.forEach(highlight => {
            // Only destroy if it still exists and hasn't been destroyed
            if (highlight && highlight.scene) {
                highlight.destroy();
            }
        });
        this.pushHighlights = [];
    }
}
