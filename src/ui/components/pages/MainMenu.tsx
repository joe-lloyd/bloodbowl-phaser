import Parchment from '../componentWarehouse/Parchment';
import ContentContainer from '../componentWarehouse/ContentContainer';
import MinHeightContainer from '../componentWarehouse/MinHeightContainer';
import { Button } from '../componentWarehouse/Button';
import { Title } from '../componentWarehouse/Titles';
import Stars from '../componentWarehouse/stars';
import { useEventEmit } from '../../hooks/useEventBus';
import { EventBus } from '../../../services/EventBus';

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
        <MinHeightContainer className="bg-bb-parchment">
            <Parchment $intensity="high" />

            <ContentContainer>
                <div className="flex flex-col items-center justify-center text-center py-20">
                    {/* Title with decorative stars */}
                    <div className="relative mb-12">
                        <Stars />
                        <Title className="text-7xl lg:text-6xl md:text-5xl">BLOOD BOWL SEVENS</Title>
                    </div>

                    <p className="text-bb-deep-crimson text-3xl font-body italic font-bold mb-16">Fantasy Football Mayhem</p>

                    <div className="flex flex-col gap-6 min-w-[300px] mb-16">
                        <Button onClick={handleBuildTeam} className="text-2xl py-5">
                            Build Team
                        </Button>

                        <Button onClick={handlePlayGame} className="text-2xl py-5">
                            Play Game
                        </Button>

                        <Button onClick={() => emit('ui:sceneChange', { scene: 'SoundTestScene' })}
                            className="text-xl py-3 opacity-80 hover:opacity-100 border-dashed border-gray-500">
                            🔊 Sound Test
                        </Button>

                        <Button onClick={() => emit('ui:sceneChange', { scene: 'SandboxScene' })}
                            className="text-xl py-3 opacity-90 hover:opacity-100 border-dashed border-amber-600 text-amber-800">
                            🛠️ Sandbox Mode
                        </Button>
                    </div>

                    <div className="text-bb-muted-text text-lg mt-auto font-heading">
                        v0.1.0 - Phase 3.5 (React UI)
                    </div>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
