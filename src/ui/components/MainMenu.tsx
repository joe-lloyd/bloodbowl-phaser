import { useEventEmit } from '../hooks/useEventBus';
import { EventBus } from '../../services/EventBus';
import './MainMenu.css';

interface MainMenuProps {
    eventBus: EventBus;
}

/**
 * Main Menu Component - Replaces MenuScene Phaser UI
 * Rendered as React overlay positioned absolutely over the canvas
 */
export function MainMenu({ eventBus }: MainMenuProps) {
    const emit = useEventEmit(eventBus);

    const handleBuildTeam = () => {
        emit('ui:sceneChange', { scene: 'TeamManagementScene' });
    };

    const handlePlayGame = () => {
        emit('ui:sceneChange', { scene: 'TeamSelectionScene' });
    };

    return (
        <div className="main-menu">
            <h1 className="main-menu__title">BLOOD BOWL SEVENS</h1>
            <p className="main-menu__subtitle">Fantasy Football Mayhem</p>

            <div className="main-menu__buttons">
                <button
                    className="main-menu__button"
                    onClick={handleBuildTeam}
                >
                    Build Team
                </button>

                <button
                    className="main-menu__button"
                    onClick={handlePlayGame}
                >
                    Play Game
                </button>
            </div>

            <div className="main-menu__version">
                v0.1.0 - Phase 3.5 (React UI)
            </div>
        </div>
    );
}
