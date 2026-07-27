import type { ReactNode } from "react";
import type { OpponentConnectionState } from "../../../firebase/lobby";

/**
 * In-match options menu — context-derived descriptors.
 *
 * The menu never hides entries with ad hoc CSS: it always renders exactly
 * the entries this function returns for the given context, so both local
 * and online coverage can assert precisely what a coach can do at any
 * moment (see design.md, "Use one menu trigger with context-derived
 * entries").
 */

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

export interface MatchOptionsMenuConfirm {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface MatchOptionsMenuActionEntry {
  /** Defaults to "action" — a plain labelled/selectable row. */
  type?: "action";
  id: MatchOptionsMenuActionId;
  label: string;
  description?: string;
  /** Ends or discards something irreversible; rendered with a confirm step. */
  destructive?: boolean;
  /** Present only on destructive entries — the confirm step's copy. */
  confirm?: MatchOptionsMenuConfirm;
  /** Informational or currently unavailable — not selectable. */
  disabled?: boolean;
}

/**
 * An entry that hosts an inline interactive control (e.g. the mute
 * checkbox + volume slider) instead of a simple labelled action. Rendered
 * directly inside the open menu — no nested popup, no `onSelect` routing.
 */
export interface MatchOptionsMenuPanelEntry {
  type: "panel";
  /** Unique among this menu's entries; not one of MatchOptionsMenuActionId since it's never "selected". */
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
      connection: OpponentConnectionState;
      /** Who (if anyone) has proposed ending the match. */
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
  connection: OpponentConnectionState;
  endRequest: "none" | "mine" | "theirs";
}): MatchOptionsMenuEntry[] {
  const { role, opponentName, connection, endRequest } = context;
  const entries: MatchOptionsMenuEntry[] = [];

  // Saving is host-authoritative — the guest holds no engine of its own to
  // flush. Rather than silently no-op a "Save & Exit" click for the guest,
  // the host-only action stays visible but disabled with the reason (design
  // decision: "Actions that only the host may perform are disabled or
  // omitted for guests with an explanation"), and the guest gets its own,
  // always-available way to leave — the host's periodic autosave already
  // keeps the match resumable regardless of who clicks what.
  if (role === "host") {
    entries.push({
      id: "save-and-exit",
      label: "Save & Exit",
      description:
        "Persists the match and leaves — resume it any time from the main menu.",
    });
  } else {
    entries.push({
      id: "save-and-exit",
      label: "Save & Exit",
      description: "Only the host can force-save the match state.",
      disabled: true,
    });
    entries.push({
      id: "leave-match",
      label: "Leave Match",
      description: `${opponentName} (the host) keeps the match saved automatically. You can rejoin any time.`,
    });
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
  } else {
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
    label:
      connection === "online"
        ? `${opponentName} is connected`
        : connection === "reconnecting"
          ? `${opponentName} disconnected — waiting to reconnect…`
          : `${opponentName} has been disconnected`,
    disabled: true,
  });

  // Reconnection itself is automatic (heartbeat + realtime sync) — this
  // nudges it rather than opening a new protocol/authority path, staying
  // inside design.md's non-goal of not changing reconnect policy.
  if (connection !== "online") {
    entries.push({
      id: "reconnect",
      label: "Try to Reconnect",
      description: `Refresh the connection to see if ${opponentName} has come back.`,
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
