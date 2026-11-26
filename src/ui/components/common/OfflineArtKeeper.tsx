import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { useKeepOfflineArt } from "../../hooks/useOfflineArt";

export function OfflineArtKeeper() {
  const [library] = useTeamLibrary();
  useKeepOfflineArt(library);
  return null;
}
