import type { FormationEntry } from "../../../game/managers/FormationManager";

export function formationGroups(
  formations: readonly FormationEntry[],
  kicking: boolean
) {
  const fits = (entry: FormationEntry) =>
    entry.use === "any" || entry.use === (kicking ? "kick" : "receive");
  const builtIn = formations.filter((entry) => entry.builtIn);
  return [
    {
      label: kicking ? "For kicking" : "For receiving",
      entries: builtIn.filter(fits),
    },
    {
      label: kicking ? "For receiving" : "For kicking",
      entries: builtIn.filter((entry) => !fits(entry)),
    },
    { label: "Saved", entries: formations.filter((entry) => !entry.builtIn) },
  ].filter((group) => group.entries.length > 0);
}
