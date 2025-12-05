import Phaser from "phaser";
import { UIText } from "../../ui/UIText";

export class DiceLog extends Phaser.GameObjects.Container {
    private logs: UIText[] = [];
    private background: Phaser.GameObjects.Rectangle;
    private title: UIText;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y);
        this.scene.add.existing(this);

        // Background
        this.background = scene.add.rectangle(0, 0, 200, 300, 0x000000, 0.7)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0x444444);
        this.add(this.background);

        // Title
        this.title = new UIText(scene, {
            x: 10,
            y: 10,
            text: "DICE LOG",
            variant: "h5",
            color: "#aaaaaa"
        });
        this.title.setOrigin(0, 0);
        this.add(this.title);
    }

    public addLog(text: string): void {
        const logEntry = new UIText(this.scene, {
            x: 10,
            y: 40,
            text: text,
            variant: "body",
            color: "#ffffff",
            fontSize: "14px"
        });
        logEntry.setOrigin(0, 0);

        // Push existing logs down
        this.logs.forEach(log => {
            log.y += 25;
            log.setAlpha(log.alpha * 0.8); // Fade old logs
        });

        // Add new log
        this.logs.unshift(logEntry);
        this.add(logEntry);

        // Cap at 10 logs
        if (this.logs.length > 10) {
            const removed = this.logs.pop();
            removed?.destroy();
        }
    }

    public clear(): void {
        this.logs.forEach(l => l.destroy());
        this.logs = [];
    }
}
