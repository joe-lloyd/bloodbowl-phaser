import React, { useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";

interface ConfirmationModalProps {
  eventBus: IEventBus;
}

interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  actionId: string; // To verify which action we are confirming
  risky?: boolean; // If true, show warning colors
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  eventBus,
}) => {
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEventBus(eventBus, GameEventNames.UI_RequestConfirmation, (payload) => {
    setData(payload);
  });

  // Clear BEFORE emitting: the result handler can synchronously request the
  // next confirmation (dodge -> sprint), and a trailing setData(null) would
  // wipe that fresh dialog
  const handleConfirm = () => {
    if (!data) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: true,
      actionId,
    });
  };

  const handleCancel = () => {
    if (!data) return;
    const actionId = data.actionId;
    setData(null);
    eventBus.emit(GameEventNames.UI_ConfirmationResult, {
      confirmed: false,
      actionId,
    });
  };

  if (!data) return null;

  return (
    // z-[150]: a confirmation must always sit ABOVE the block/follow-up
    // dialogs (z-[100]) — the blitz "Rush Required!" prompt fires while the
    // block dialog is open and was unreachable behind it
    <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/50 pointer-events-auto">
      <div
        className={`
                w-96 p-6 rounded-lg shadow-xl border-2 
                ${
                  data.risky
                    ? "bg-slate-900 border-red-500"
                    : "bg-slate-800 border-yellow-400"
                }
                animate-in fade-in zoom-in duration-200
            `}
      >
        <h3
          className={`text-xl font-bold mb-4 ${
            data.risky ? "text-red-400" : "text-yellow-400"
          }`}
        >
          {data.title}
        </h3>

        <div className="text-gray-200 mb-6 whitespace-pre-line font-medium leading-relaxed">
          {data.message}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors border border-slate-500"
          >
            {data.cancelLabel || "Cancel"}
          </button>
          <button
            onClick={handleConfirm}
            className={`
                            px-4 py-2 rounded font-bold shadow-lg transition-transform hover:scale-105
                            ${
                              data.risky
                                ? "bg-red-600 hover:bg-red-500 text-white border border-red-400"
                                : "bg-green-600 hover:bg-green-500 text-white border border-green-400"
                            }
                        `}
          >
            {data.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};
