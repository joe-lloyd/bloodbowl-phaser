import { useNavigate } from "react-router-dom";
import { type Team, hasBlockingPendingDevelopment } from "../../../types/Team";
import { HudButton, Notice } from "../componentWarehouse/HudKit";

export function PostGameSteps({ club }: { club: Team }) {
  const navigate = useNavigate();
  if (!hasBlockingPendingDevelopment(club)) return null;
  return (
    <Notice tone="warn" title="Post-game steps are waiting" className="mb-4">
      <p>
        Finish {club.name}&apos;s post-game steps on its team sheet, such as
        advancements, offers from pro teams and Expensive Mistakes, before it
        plays on.
      </p>
      <HudButton
        size="sm"
        className="mt-3"
        onClick={() => void navigate(`/clubs/${club.id}`)}
      >
        Open the team sheet
      </HudButton>
    </Notice>
  );
}
