import { useState } from 'react';
import { useEventBus, useEventEmit } from '../hooks/useEventBus';
import { EventBus } from '../../services/EventBus';
import './TestOverlay.css';

interface TestOverlayProps {
    eventBus: EventBus;
}

/**
 * Test component to verify React + EventBus integration
 * This will be removed in later phases
 */
export function TestOverlay({ eventBus }: TestOverlayProps) {
    const [messages, setMessages] = useState<string[]>([]);
    const emit = useEventEmit(eventBus);

    // Subscribe to a game event
    useEventBus(eventBus, 'phaseChanged', (data) => {
        setMessages(prev => [...prev, `Phase changed to: ${data.phase}`]);
    });

    // Subscribe to player placed event
    useEventBus(eventBus, 'playerPlaced', (data) => {
        setMessages(prev => [...prev, `Player ${data.playerId} placed at (${data.x}, ${data.y})`]);
    });

    const handleTestEmit = () => {
        // Emit a UI event that Phaser can listen to
        emit('ui:confirmAction', { actionId: 'test-action' });
        setMessages(prev => [...prev, 'Emitted ui:confirmAction']);
    };

    const handleClear = () => {
        setMessages([]);
    };

    return (
        <div className="test-overlay">
            <div className="test-panel">
                <h3>React ↔ EventBus Test</h3>
                <p>This overlay proves React and Phaser are communicating!</p>

                <div className="button-group">
                    <button onClick={handleTestEmit}>
                        Emit Test Event
                    </button>
                    <button onClick={handleClear}>
                        Clear Messages
                    </button>
                </div>

                <div className="message-log">
                    <h4>Event Log:</h4>
                    {messages.length === 0 ? (
                        <p className="empty">No events yet. Try interacting with the game!</p>
                    ) : (
                        <ul>
                            {messages.map((msg, i) => (
                                <li key={i}>{msg}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
