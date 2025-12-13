import React from 'react';
import { EventBus } from '../../../services/EventBus';
import { ServiceContainer } from '../../../services/ServiceContainer';

interface SoundTestProps {
    eventBus: EventBus;
}

export const SoundTest: React.FC<SoundTestProps> = ({ eventBus }) => {

    // Helper to get manager (auto-initializing with dummy data if needed)
    const getSoundManager = () => {
        if (!ServiceContainer.isInitialized()) {
            console.log("SoundTest: Container not initialized, creating dummy context...");
            // Create minimal explicit dummy teams to satisfy GameService requirements
            const dummyTeam1 = {
                id: 'sound-test-1', name: 'Audio One', roster: [], colors: { primary: 0xff0000, secondary: 0xffffff },
                players: []
            } as any;
            const dummyTeam2 = {
                id: 'sound-test-2', name: 'Audio Two', roster: [], colors: { primary: 0x0000ff, secondary: 0xffffff },
                players: []
            } as any;

            ServiceContainer.initialize(eventBus, dummyTeam1, dummyTeam2);
        }

        try {
            return ServiceContainer.getInstance().soundManager;
        } catch (e) {
            console.error("Failed to get ServiceContainer", e);
            return null;
        }
    };

    const handleInit = () => {
        const mgr = getSoundManager();
        if (mgr) {
            mgr.init().then(() => console.log("SoundManager initialized manually"));
        }
    };

    const handlePlayMusic = () => {
        getSoundManager()?.playOpeningTheme();
    };

    const handleStop = () => {
        getSoundManager()?.stop();
    };

    const handleSFX = (type: 'dice' | 'kick' | 'whistle') => {
        getSoundManager()?.playSFX(type);
    };

    const handleBack = () => {
        eventBus.emit('ui:sceneChange', { scene: 'MenuScene' });
    };

    return (
        <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center text-white z-50">
            <h1 className="text-4xl font-bold mb-8 text-yellow-400">Audio Debug Dashboard</h1>

            <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="flex flex-col gap-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
                    <h2 className="text-2xl font-bold mb-4">Music Controls</h2>
                    <button
                        onClick={handleInit}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
                    >
                        1. Initialize Audio Engine
                    </button>
                    <button
                        onClick={handlePlayMusic}
                        className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded font-bold transition-colors"
                    >
                        2. Play Opening Theme (Sine)
                    </button>
                    <button
                        onClick={handleStop}
                        className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors"
                    >
                        Stop All
                    </button>
                </div>

                <div className="flex flex-col gap-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
                    <h2 className="text-2xl font-bold mb-4">SFX Tests</h2>
                    <button
                        onClick={() => handleSFX('dice')}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded font-bold transition-colors"
                    >
                        Test: Dice Roll
                    </button>
                    <button
                        onClick={() => handleSFX('kick')}
                        className="px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded font-bold transition-colors"
                    >
                        Test: Kick
                    </button>
                    <button
                        onClick={() => handleSFX('whistle')}
                        className="px-6 py-3 bg-teal-600 hover:bg-teal-500 rounded font-bold transition-colors"
                    >
                        Test: Whistle
                    </button>
                </div>
            </div>

            <button
                onClick={handleBack}
                className="mt-8 text-gray-400 hover:text-white underline text-lg"
            >
                ← Back to Main Menu
            </button>
        </div>
    );
};
