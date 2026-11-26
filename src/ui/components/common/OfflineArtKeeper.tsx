import { useLocation } from "react-router-dom";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import { useKeepOfflineArt } from "../../hooks/useOfflineArt";

function LibraryArt() {
  const [library] = useTeamLibrary();
  useKeepOfflineArt(library);
  return null;
}

export function OfflineArtKeeper() {
  const { pathname } = useLocation();
  return <LibraryArt key={pathname} />;
}
