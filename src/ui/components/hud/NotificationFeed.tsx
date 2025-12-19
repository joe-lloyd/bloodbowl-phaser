import React from "react";

interface NotificationMessage {
  id: string;
  text: string;
  type?: "info" | "success" | "warning" | "error";
}

interface NotificationFeedProps {
  messages: NotificationMessage[];
}

export const NotificationFeed: React.FC<NotificationFeedProps> = ({
  messages,
}) => {
  return (
    <div className="flex flex-col items-center space-y-2 pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="
                        animate-bounce-in
                        px-6 py-2
                        bg-bb-parchment bg-opacity-75
                        border-2 border-bb-gold
                        text-bb-blood-red font-heading font-bold text-2xl uppercase tracking-widest
                        shadow-parchment
                        transform
                    "
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
};
