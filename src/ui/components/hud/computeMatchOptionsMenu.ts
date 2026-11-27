import type { ReactNode } from "react";
import type { ConnectionState } from "../../../firebase/lobby";

export type MatchOptionsMenuActionId =
  | "exit-sandbox"
  | "return-to-menu"
  | "abandon-match"
  | "save-and-exit"
  | "leave-match"
  | "request-end-match"
  | "cancel-end-match"
  | "respond-end-match"
  | "connection-status"
  | "reconnect"
  | "force-abandon";

interface MatchOptionsMenuConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface MatchOptionsMenuActionEntry {
  type?: "action";
  id: MatchOptionsMenuActionId;
  label: string;
  description?: string;

  destructive?: boolean;

  confirm?: MatchOptionsMenuConfirm;

  disabled?: boolean;
}

interface MatchOptionsMenuPanelEntry {
  type: "panel";

  id: string;
  render: () => ReactNode;
}

export type MatchOptionsMenuEntry =
  | MatchOptionsMenuActionEntry
  | MatchOptionsMenuPanelEntry;

export type MatchOptionsMenuContext =
  | { kind: "sandbox" }
  | { kind: "local"; matchOver: boolean }
  | {
      kind: "online";
      role: "host" | "guest";
      opponentName: string;
      connection: ConnectionState;

      endRequest: "none" | "mine" | "theirs";
    };

export function computeMatchOptionsMenu(
  context: MatchOptionsMenuContext
): MatchOptionsMenuEntry[] {
  switch (context.kind) {
    case "sandbox":
      return [
        {
          id: "exit-sandbox",
          label: "Exit Sandbox",
          description: "Return to the main menu.",
        },
      ];
    case "local":
      return localEntries(context.matchOver);
    case "online":
      return onlineEntries(context);
  }
}

function localEntries(matchOver: boolean): MatchOptionsMenuEntry[] {
  const entries: MatchOptionsMenuEntry[] = [
    {
      id: "return-to-menu",
      label: matchOver ? "Leave Results" : "Return to Main Menu",
      description: matchOver
        ? "Head back to the main menu."
        : "Leave now — your progress is saved and this match stays resumable.",
    },
  ];

  if (!matchOver) {
    entries.push({
      id: "abandon-match",
      label: "Abandon Match",
      description: "End this match now and discard its saved progress.",
      destructive: true,
      confirm: {
        title: "Abandon this match?",
        message:
          "This ends the match immediately and discards its saved progress. It cannot be resumed afterward.",
        confirmLabel: "Abandon Match",
        cancelLabel: "Keep Playing",
      },
    });
  }

  return entries;
}

function onlineEntries(context: {
  role: "host" | "guest";
  opponentName: string;
  connection: ConnectionState;
  endRequest: "none" | "mine" | "theirs";
}): MatchOptionsMenuEntry[] {
  const { role, opponentName, connection, endRequest } = context;
  const entries: MatchOptionsMenuEntry[] = [];

  if (role === "host") {
    entries.push({
      id: "save-and-exit",
      label: "Save & Exit",
      description:
        "Persists the match and leaves — resume it any time from the main menu.",
    });
  } else {
    entries.push(
      {
        id: "save-and-exit",
        label: "Save & Exit",
        description: "Only the host can force-save the match state.",
        disabled: true,
      },
      {
        id: "leave-match",
        label: "Leave Match",
        description: `${opponentName} (the host) keeps the match saved automatically. You can rejoin any time.`,
      }
    );
  }

  if (endRequest === "mine") {
    entries.push({
      id: "cancel-end-match",
      label: "Cancel End Request",
      description: `Waiting for ${opponentName} to agree…`,
    });
  } else if (endRequest === "theirs") {
    entries.push({
      id: "respond-end-match",
      label: "Respond to End Request",
      description: `${opponentName} wants to end the match — respond in the prompt.`,
      disabled: true,
    });
  } else if (connection !== "offline") {
    entries.push({
      id: "request-end-match",
      label: "End Match",
      description: `Propose ending the match now. ${opponentName} must agree.`,
      destructive: true,
      confirm: {
        title: "End the match?",
        message: `This asks ${opponentName} to agree to end the match now. Nothing already recorded is undone.`,
        confirmLabel: "Propose Ending",
        cancelLabel: "Keep Playing",
      },
    });
  }

  entries.push({
    id: "connection-status",
    label: connectionLabel(connection, opponentName),
    disabled: true,
  });

  if (connection !== "online") {
    entries.push({
      id: "reconnect",
      label: "Try to Reconnect",
      description:
        connection === "offline"
          ? "Refresh your connection to the match."
          : `Refresh the connection to see if ${opponentName} has come back.`,
    });
  }

  if (connection === "abandonable") {
    entries.push({
      id: "force-abandon",
      label: "End Match (Opponent Left)",
      description: `${opponentName} has been gone a while. Ending now records the match as abandoned.`,
      destructive: true,
      confirm: {
        title: "End the match?",
        message: `${opponentName} appears to have left and hasn't reconnected. Ending now finishes the match as abandoned.`,
        confirmLabel: "End Match",
        cancelLabel: "Keep Waiting",
      },
    });
  }

  return entries;
}

function connectionLabel(
  connection: ConnectionState,
  opponentName: string
): string {
  switch (connection) {
    case "online":
      return `${opponentName} is connected`;
    case "offline":
      return "You are offline, reconnecting…";
    case "slow":
      return "Connection slow: moves may arrive late";
    case "reconnecting":
      return `${opponentName} disconnected — waiting to reconnect…`;
    case "abandonable":
      return `${opponentName} has been disconnected`;
    default: {
      const exhaustive: never = connection;
      return exhaustive;
    }
  }
}
