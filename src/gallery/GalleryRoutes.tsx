import type { ReactNode } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ClubFounding } from "../ui/components/club/ClubFounding";
import { ClubHub } from "../ui/components/club/ClubHub";
import { ClubPage } from "../ui/components/club/ClubPage";
import {
  EmptyState,
  HudButton,
  PageShell,
} from "../ui/components/componentWarehouse/HudKit";
import { CompetitionBuilder } from "../ui/components/pages/CompetitionBuilder";
import { CompetitionHub } from "../ui/components/pages/CompetitionHub";
import { CompetitionView } from "../ui/components/pages/CompetitionView";
import { FriendsPage } from "../ui/components/pages/FriendsPage";
import { MainMenu } from "../ui/components/pages/MainMenu";
import { OnlineLobby } from "../ui/components/pages/OnlineLobby";
import { PlayerPage } from "../ui/components/pages/PlayerPage";
import { SharedTeamBrowser } from "../ui/components/pages/SharedTeamBrowser";
import { TeamBuilder } from "../ui/components/pages/TeamBuilder";
import { TeamManagement } from "../ui/components/pages/TeamManagement";
import { TeamSelect } from "../ui/components/pages/TeamSelect";

function NotInGallery() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <PageShell width="narrow" className="flex flex-col justify-center">
      <EmptyState
        title="Not in the gallery"
        action={
          <div className="flex gap-3">
            <HudButton variant="ghost" onClick={() => void navigate(-1)}>
              Back
            </HudButton>
            <HudButton variant="primary" onClick={() => void navigate("/")}>
              Main menu
            </HudButton>
          </div>
        }
      >
        The game opens {pathname} here, and it needs the live pitch.
      </EmptyState>
    </PageShell>
  );
}

const PAGES: readonly [string, ReactNode][] = [
  ["/", <MainMenu key="menu" />],
  ["/build-team", <TeamManagement key="teams" />],
  ["/build-team/new-team", <TeamBuilder key="new-team" />],
  ["/build-team/:teamId", <TeamBuilder key="team" />],
  ["/build-team/:teamId/player/:playerId", <PlayerPage key="player" />],
  ["/clubs", <ClubHub key="clubs" />],
  ["/clubs/new", <ClubFounding key="new-club" />],
  ["/clubs/:teamId", <ClubPage key="club" />],
  ["/shared-teams", <SharedTeamBrowser key="shared" />],
  ["/friends", <FriendsPage key="friends" />],
  ["/leagues", <CompetitionHub key="leagues" type="league" />],
  ["/leagues/new", <CompetitionBuilder key="new-league" type="league" />],
  ["/leagues/:id", <CompetitionView key="league" type="league" />],
  ["/tournaments", <CompetitionHub key="cups" type="tournament" />],
  ["/tournaments/new", <CompetitionBuilder key="new-cup" type="tournament" />],
  ["/tournaments/:id", <CompetitionView key="cup" type="tournament" />],
  ["/select-team", <TeamSelect key="select" mode="play" />],
  ["/online/host", <OnlineLobby key="host" mode="host" />],
  ["/online/join", <OnlineLobby key="join" mode="join" />],
  ["/online/lobby/:code", <OnlineLobby key="lobby" mode="host" />],
];

interface Place {
  path: string;
  own?: ReactNode;
}

export function GalleryRoutes({ path, own }: Place) {
  const [pathname = path] = path.split("?");
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {own && <Route path={pathname} element={own} />}
        {PAGES.filter(([known]) => !own || known !== pathname).map(
          ([known, page]) => (
            <Route key={known} path={known} element={page} />
          )
        )}
        <Route path="*" element={<NotInGallery />} />
      </Routes>
    </MemoryRouter>
  );
}
