import {
  RosterCatalogueCard,
  type CatalogueRoster,
} from "./RosterCatalogueCard";

const slann: CatalogueRoster = {
  name: "Slann",
  tier: null,
  source:
    "https://www.thenaf.net/tournaments/nafdocs/naf-regulations-for-tournaments/#4.3.4",
  experimental: false,
  positions: [
    { name: "Slann Lineman", quantity: "0–16", cost: 60_000, skills: ["Pogo"] },
    {
      name: "Slann Catcher",
      quantity: "0–2",
      cost: 80_000,
      skills: ["Diving Catch", "On the Ball", "Pogo", "Very Long Legs"],
    },
    {
      name: "Slann Blitzer",
      quantity: "0–2",
      cost: 100_000,
      skills: ["Diving Tackle", "Hit and Run", "Jump Up", "Pogo"],
    },
    {
      name: "Kroxigor",
      quantity: "0–1",
      cost: 140_000,
      skills: [
        "Bone Head",
        "Loner (4+)",
        "Mighty Blow",
        "Prehensile Tail",
        "Thick Skull",
      ],
    },
  ],
};

export function AdditionalRosters() {
  return (
    <div className="max-w-lg space-y-3">
      <p className="text-hud-sm text-hud-dim">
        Browse the optional NAF Slann roster.
      </p>
      <RosterCatalogueCard roster={slann} />
    </div>
  );
}
