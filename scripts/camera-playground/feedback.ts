import { element } from "./dom";

type Note = { context: string; text: string; zoom: string; trigger: string };
function readNotes(): Note[] {
  const parsed: Note[] = [];
  const saved: unknown = JSON.parse(
    localStorage.getItem("bb-camera-notes-v1") ?? "[]"
  );
  if (Array.isArray(saved))
    for (const note of saved) {
      if (
        typeof note === "object" &&
        note !== null &&
        "context" in note &&
        typeof note.context === "string" &&
        "text" in note &&
        typeof note.text === "string" &&
        "zoom" in note &&
        typeof note.zoom === "string" &&
        "trigger" in note &&
        typeof note.trigger === "string"
      )
        parsed.push({
          context: note.context,
          text: note.text,
          zoom: note.zoom,
          trigger: note.trigger,
        });
    }
  return parsed;
}

export function setupFeedback(
  currentContext: () => { context: string; zoom: string; trigger: string }
) {
  const notesElement = element("notes");
  if (!(notesElement instanceof HTMLTextAreaElement))
    throw new Error("Expected notes textarea");
  const notes: HTMLTextAreaElement = notesElement;

  const savedNotes: Note[] = [];
  try {
    savedNotes.push(...readNotes());
  } catch {
    element("note-status").textContent =
      "Local storage unavailable. Copy feedback still works.";
  }
  function noteCount() {
    element("note-count").textContent = savedNotes.length
      ? `${savedNotes.length} saved`
      : "";
  }
  function noteNow(): Note {
    return {
      ...currentContext(),
      text: notes.value.trim(),
    };
  }
  element("save-note").onclick = () => {
    if (!notes.value.trim()) {
      element("note-status").textContent = "Write a note first.";
      return;
    }
    savedNotes.push(noteNow());
    try {
      localStorage.setItem("bb-camera-notes-v1", JSON.stringify(savedNotes));
      notes.value = "";
      element("note-status").textContent = "Saved on this device.";
    } catch {
      element("note-status").textContent =
        "Kept for this visit. Copy feedback to keep it.";
    }
    noteCount();
  };
  element("copy-notes").onclick = async () => {
    const current = notes.value.trim() ? [noteNow()] : [];
    const text = [...savedNotes, ...current]
      .map(
        (n) =>
          `${n.context}\nZoom ${n.zoom} · Last trigger ${n.trigger}\n${n.text}`
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(
        text || element("note-context").textContent || "Camera playground"
      );
      element("note-status").textContent = "Feedback copied.";
    } catch {
      notes.value = text;
      notes.select();
      element("note-status").textContent =
        "Select and copy the feedback above.";
    }
  };
  noteCount();
}
