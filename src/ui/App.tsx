import { useState } from 'react';
import { MainMenu } from './components/pages/MainMenu';
import { TeamManagement } from './components/pages/TeamManagement';
import { TeamBuilder } from './components/pages/TeamBuilder';
import { TeamSelect } from './components/pages/TeamSelect';
import { GameHUD } from './components/hud/GameHUD';
import { SoundTest } from './components/pages/SoundTest';
import { SandboxOverlay } from './components/hud/SandboxOverlay';
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
    const [currentScene, setCurrentScene] = useState<string>(() => {
        if (window.location.hash === '#sound-test') {
            return 'SoundTestScene';
        }
        return 'MenuScene';
    });
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

    // Listen for game start
    useEventBus(eventBus, 'ui:startGame', () => {
        console.log('Game starting, hiding React UI');
        setCurrentScene('GameScene');
    });

    const isInGame = currentScene === 'GameScene';

    return (
        <div className={`w-full h-full ${isInGame ? 'pointer-events-none' : 'pointer-events-auto'}`}>
            {currentScene === 'MenuScene' && (
                <MainMenu eventBus={eventBus} />
            )}

            {currentScene === 'SoundTestScene' && (
                <SoundTest eventBus={eventBus} />
            )}

            {currentScene === 'TeamManagementScene' && (
                <TeamManagement eventBus={eventBus} />
            )}

            {currentScene === 'TeamBuilderScene' && (
                <TeamBuilder eventBus={eventBus} teamId={sceneData?.teamId} />
            )}

            {currentScene === 'TeamSelectionScene' && (
                <TeamSelect eventBus={eventBus} mode={sceneData?.mode} />
            )}

            {(isInGame || currentScene === 'SandboxScene') && (
                <>
                    <GameHUD eventBus={eventBus} />
                    {currentScene === 'SandboxScene' && <SandboxOverlay eventBus={eventBus} />}
                </>
            )}
        </div>
    );
}
