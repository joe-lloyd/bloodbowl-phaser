import { useContext, useEffect, useState } from "react";
import { HudButton } from "../../src/ui/components/componentWarehouse/HudButton";
import {
  EmptyState,
  Notice,
  Section,
} from "../../src/ui/components/componentWarehouse/HudPage";
import { errorText } from "../../src/ui/errorText";
import { api } from "../boundary/client";
import type {
  Candidate,
  CandidateSummary,
  WeightsView,
} from "../boundary/schemas";
import { diffLayers } from "../catalogue/layers";
import { CandidateEditor, type Draft } from "./CandidateEditor";
import { Loaded } from "./Loaded";
import { ScreenVisit } from "./screenVisit";
import { useLoad } from "./useLoad";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "failed"; message: string };

const loadWeights = () => api.listWeights({});
const loadCandidates = () => api.listCandidates({});
const fresh = (view: WeightsView): Draft => ({
  name: "",
  note: "",
  layers: view.current,
});

function SavedList({
  candidates,
  onEdit,
  onDelete,
}: {
  candidates: CandidateSummary[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState("");
  if (candidates.length === 0)
    return (
      <EmptyState title="No candidates yet">
        Change some values below and save them.
      </EmptyState>
    );
  return (
    <ul className="divide-y divide-white/10">
      {candidates.map((c) => (
        <li
          key={c.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
          data-candidate={c.id}
        >
          <div className="min-w-0">
            <p className="font-hud-label text-hud-lg font-bold">{c.name}</p>
            <p className="text-hud-sm text-hud-dim">{c.note}</p>
            <p className="text-hud-xs text-hud-mute">
              {c.changes} {c.changes === 1 ? "change" : "changes"} · saved{" "}
              {c.savedAt.slice(0, 16).replace("T", " ")} · {c.id}.json
            </p>
          </div>
          <div className="flex gap-2">
            <HudButton
              size="sm"
              onClick={() => {
                onEdit(c.id);
              }}
            >
              Edit
            </HudButton>
            <HudButton
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirming === c.id) onDelete(c.id);
                else setConfirming(c.id);
              }}
            >
              {confirming === c.id ? "Confirm delete" : "Delete"}
            </HudButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle":
    case "busy":
      return null;
    case "done":
      return (
        <Notice tone="good" role="status">
          {status.message}
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="bad" role="alert">
          {status.message}
        </Notice>
      );
  }
}

function Actions({
  canSave,
  onSave,
  onReset,
}: {
  canSave: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <HudButton variant="primary" disabled={!canSave} onClick={onSave}>
        Save candidate
      </HudButton>
      <HudButton variant="ghost" onClick={onReset}>
        Start again from the current weights
      </HudButton>
    </div>
  );
}

function useDraft(view: WeightsView, saved: () => void) {
  const [draft, setDraft] = useState<Draft>(() => fresh(view));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const run = (work: () => Promise<string>) => {
    setStatus({ kind: "busy" });
    work().then(
      (message) => {
        setStatus({ kind: "done", message });
        saved();
      },
      (error: unknown) => {
        setStatus({ kind: "failed", message: errorText(error) });
      }
    );
  };
  const show = (c: Candidate) => {
    setDraft({ name: c.name, note: c.note, layers: c.layers });
  };
  return {
    draft,
    setDraft,
    status,
    save: () => {
      run(async () => {
        const c = await api.saveCandidate(draft);
        show(c);
        return `Saved ${c.name} as ${c.id}.json`;
      });
    },
    edit: (id: string) => {
      run(async () => {
        const c = await api.getCandidate({ id });
        show(c);
        return `Editing ${c.name}`;
      });
    },
    remove: (id: string) => {
      run(async () => {
        await api.deleteCandidate({ id });
        return `Deleted ${id}`;
      });
    },
    reset: () => {
      setDraft(fresh(view));
      setStatus({ kind: "idle" });
    },
  };
}

function Workbench({ view }: { view: WeightsView }) {
  const saved = useLoad(loadCandidates);
  const visit = useContext(ScreenVisit);
  const { reload } = saved;
  useEffect(() => {
    if (visit !== null) reload();
  }, [visit, reload]);
  const { draft, setDraft, status, save, edit, remove, reset } = useDraft(
    view,
    saved.reload
  );
  const changes = diffLayers(view.current, draft.layers).length;
  return (
    <>
      <Section title="Saved candidates">
        <Loaded state={saved.state}>
          {({ candidates }) => (
            <SavedList
              candidates={candidates}
              onEdit={edit}
              onDelete={remove}
            />
          )}
        </Loaded>
      </Section>
      <CandidateEditor
        view={view}
        draft={draft}
        onChange={setDraft}
        actions={
          <>
            <Actions
              canSave={
                status.kind !== "busy" &&
                draft.name.trim() !== "" &&
                changes > 0
              }
              onSave={save}
              onReset={reset}
            />
            <StatusLine status={status} />
          </>
        }
      />
    </>
  );
}

export function CandidatesScreen() {
  const { state } = useLoad(loadWeights);
  return <Loaded state={state}>{(view) => <Workbench view={view} />}</Loaded>;
}
