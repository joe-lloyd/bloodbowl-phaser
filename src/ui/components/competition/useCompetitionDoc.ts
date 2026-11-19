import { useEffect, useState } from "react";
import { manageComputerTeams } from "../../../competition/computerTeams";
import { walkOverNext } from "../../../competition/logic";
import {
  getCompetition,
  subscribeCompetition,
} from "../../../competition/repository";
import { closeWalkovers } from "../../../competition/resultRecording";
import { refreshEntrantDisplays } from "../../../competition/teamRefs";
import type {
  CompetitionDoc,
  CompetitionType,
} from "../../../competition/types";
import { isFirebaseConfigured } from "../../../firebase/config";
import { RNGService } from "../../../services/rng/RNGService";
import { errorText } from "../../errorText";

export interface CompetitionState {
  competition: CompetitionDoc | null;
  setCompetition: (competition: CompetitionDoc) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

function settled(competition: CompetitionDoc): Promise<CompetitionDoc> {
  return walkOverNext(competition)
    ? closeWalkovers(competition)
    : Promise.resolve(competition);
}

function managed(
  competition: CompetitionDoc,
  onError: (error: string) => void
): CompetitionDoc {
  try {
    manageComputerTeams(competition, new RNGService(Date.now() % 2 ** 31));
  } catch (reason) {
    onError(`The computer could not manage its teams: ${errorText(reason)}`);
  }
  return refreshEntrantDisplays(competition);
}

export function useCompetitionDoc(
  type: CompetitionType,
  id: string | undefined
): CompetitionState {
  const [competition, setCompetition] = useState<CompetitionDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hosted, setHosted] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getCompetition(type, id)
      .then((loaded) => (loaded ? settled(loaded) : null))
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setCompetition(managed(loaded, setError));
        setHosted(!!loaded.organizerUid && isFirebaseConfigured());
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [id, type]);

  useEffect(() => {
    if (!id || !hosted) return;
    return subscribeCompetition({
      type,
      id,
      onChange: (live) => {
        if (!live) return;
        setCompetition(refreshEntrantDisplays(live));
        if (walkOverNext(live)) void closeWalkovers(live);
      },
    });
  }, [id, type, hosted]);

  return { competition, setCompetition, error, setError };
}
