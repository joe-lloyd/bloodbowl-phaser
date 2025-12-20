import { useState } from "react";
import { useEventBus, useEventEmit } from "../../hooks/useEventBus";
import { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button } from "../componentWarehouse/Button";
import { Title, Subtitle } from "../componentWarehouse/Titles";

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
  useEventBus(eventBus, GameEventNames.PhaseChanged, (data) => {
    setMessages((prev) => [...prev, `Phase changed to: ${data.phase}`]);
  });

  // Subscribe to player placed event
  useEventBus(eventBus, GameEventNames.PlayerPlaced, (data) => {
    setMessages((prev) => [
      ...prev,
      `Player ${data.playerId} placed at (${data.x}, ${data.y})`,
    ]);
  });

  const handleTestEmit = () => {
    // Emit a UI event that Phaser can listen to
    emit(GameEventNames.UI_ConfirmAction, { actionId: "test-action" });
    setMessages((prev) => [...prev, "Emitted ui:confirmAction"]);
  };

  const handleClear = () => {
    setMessages([]);
  };

  return (
    <MinHeightContainer className="bg-blood-bowl-parchment">
      <Parchment $intensity="low" />

      <ContentContainer>
        <Title>React ↔ EventBus Test</Title>

        <div className="bg-white/90 rounded-lg p-8 shadow-md my-5">
          <Subtitle>Event Communication Testing</Subtitle>
          <p>This overlay proves React and Phaser are communicating!</p>

          <div className="flex gap-2.5 my-5 flex-wrap">
            <Button onClick={handleTestEmit}>Emit Test Event</Button>
            <Button onClick={handleClear}>Clear Messages</Button>
          </div>

          <div className="mt-5 p-4 bg-gray-50 rounded border-l-4 border-blood-bowl-primary min-h-[200px] max-h-[400px] overflow-y-auto">
            <h4 className="text-blood-bowl-primary mt-0 mb-4">Event Log:</h4>
            {messages.length === 0 ? (
              <p className="text-gray-500 italic">
                No events yet. Try interacting with the game!
              </p>
            ) : (
              <ul className="list-none p-0 m-0">
                {messages.map((msg, i) => (
                  <li
                    key={i}
                    className="py-2 border-b border-gray-200 text-gray-800 last:border-none"
                  >
                    {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}
