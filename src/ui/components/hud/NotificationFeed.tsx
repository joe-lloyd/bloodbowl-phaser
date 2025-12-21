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
          className={`
                px-8 py-2
                font-heading font-bold text-3xl text-white uppercase tracking-wider
                shadow-lg bg-bb-blood-red
                border-y-2 border-bb-gold
            `}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
};
