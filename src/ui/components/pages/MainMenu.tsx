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
        <MinHeightContainer className="bg-blood-bowl-parchment">
            <Parchment $intensity="high" />

            <ContentContainer>
                <div className="flex flex-col items-center justify-center text-center py-10">
                    {/* Title with decorative stars */}
                    <div className="relative mb-5">
                        <Stars />
                        <Title>BLOOD BOWL SEVENS</Title>
                    </div>

                    <p className="text-blood-bowl-danger text-xl italic my-2 mb-10">Fantasy Football Mayhem</p>

                    <div className="flex flex-col gap-4 min-w-[250px] mb-10">
                        <Button onClick={handleBuildTeam}>
                            Build Team
                        </Button>

                        <Button onClick={handlePlayGame}>
                            Play Game
                        </Button>
                    </div>

                    <div className="text-gray-600 text-sm mt-10">
                        v0.1.0 - Phase 3.5 (React UI)
                    </div>
                </div>
            </ContentContainer>
        </MinHeightContainer>
    );
}
