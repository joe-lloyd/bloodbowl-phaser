import { useState } from 'react';
import { TestOverlay } from './components/pages/TestOverlay';
import { MainMenu } from './components/pages/MainMenu';
import { TeamManagement } from './components/pages/TeamManagement';
import { TeamBuilder } from './components/pages/TeamBuilder';
import { TeamSelect } from './components/pages/TeamSelect';
import { EventBus } from '../services/EventBus';
import { useEventBus } from './hooks/useEventBus';
import './styles/global.css';

interface AppProps {
    eventBus: EventBus;
}

/**
 * Root React component
 * Manages which UI to show based on current scene
 */
export function App({ eventBus }: AppProps) {
    const [currentScene, setCurrentScene] = useState<string>('MenuScene');
    const [sceneData, setSceneData] = useState<any>(null);

    // Listen for scene changes FROM Phaser
    useEventBus(eventBus, 'phaseChanged', (data) => {
        // Could track game phase changes here if needed
        console.log('Phase changed:', data.phase);
    });

    // Listen for scene change requests FROM React UI
    useEventBus(eventBus, 'ui:sceneChange', (data) => {
        console.log('Scene change requested:', data);
        setCurrentScene(data.scene);
        setSceneData(data.data || null);
        // The scene listens to this event and handles the actual Phaser scene change
    });

    // Listen for game start - hide React UI
    useEventBus(eventBus, 'ui:startGame', () => {
        console.log('Game starting, hiding React UI');
        setCurrentScene('GameScene'); // This will hide all React UI
    });

    return (
        <>
            {/* Show appropriate UI based on current scene */}
            {currentScene === 'MenuScene' && (
                <MainMenu eventBus={eventBus} />
            )}

            {currentScene === 'TeamManagementScene' && (
                <TeamManagement eventBus={eventBus} />
            )}

            {currentScene === 'TeamBuilderScene' && (
                <TeamBuilder eventBus={eventBus} teamId={sceneData?.teamId} />
            )}

            {currentScene === 'TeamSelectionScene' && (
                <TeamSelect eventBus={eventBus} />
            )}

            {/* GameScene - no React UI, just Phaser */}
            {/* React UI is hidden when game is playing */}

            {/* Test overlay - can be shown on all scenes for debugging */}
            {/* Remove this in production */}
            {/* <TestOverlay eventBus={eventBus} /> */}
        </>
    );
}
