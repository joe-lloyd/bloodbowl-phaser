import { Notice, Section } from "../componentWarehouse/HudKit";

interface Props {
  postMatch: boolean;
  pendingMistakes: boolean;

  completion: string;

  matchWinnings: string | null;
  waitingForDevelopment: boolean;
}

export function PostMatchSection({
  postMatch,
  pendingMistakes,
  completion,
  matchWinnings,
  waitingForDevelopment,
}: Props) {
  if (!postMatch && !pendingMistakes && !completion) return null;
  return (
    <Section title="Post-match team management" accent="gold">
      {matchWinnings !== null && /^\d+$/.test(matchWinnings) && (
        <p className="mb-2 text-hud-lg text-hud-gold">
          Winnings: +{Number(matchWinnings).toLocaleString("en-GB")} gp added to
          the Treasury.
        </p>
      )}
      {completion ? (
        <Notice tone="info" role="status">
          Expensive Mistakes: {completion}
        </Notice>
      ) : (
        <p className="text-hud-bone">
          Advance your players and spend your winnings below. Finish post-match
          saves your team and rolls Expensive Mistakes if at least 100,000 gp
          remains.
        </p>
      )}
      {waitingForDevelopment && (
        <p className="mt-2 text-hud-warn">
          Complete the pending team development before finishing.
        </p>
      )}
    </Section>
  );
}
