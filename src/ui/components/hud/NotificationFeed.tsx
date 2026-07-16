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
    <div className="flex flex-col items-center gap-1.5 pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="px-5 py-1.5 rounded-md
                font-heading font-bold text-lg text-white uppercase tracking-wide
                shadow-lg bg-bb-blood-red/90 border border-bb-gold
                animate-fade-in"
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
};
