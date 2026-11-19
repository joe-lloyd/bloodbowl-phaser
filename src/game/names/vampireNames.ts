import type { NameBook } from "./playerNames";

const VAMPIRE_GIVEN = {
  male: [
    "Anton", "Bogdan", "Casimir", "Corvin", "Dragomir", "Emeric", "Florin", "Iosif",
    "Konrad", "Lazar", "Ludovic", "Mircea", "Radu", "Severin", "Tiberiu", "Vasile",
    "Wenzel", "Zoltan", "Aurel", "Mattias",
  ],
  female: [
    "Adela", "Dorina", "Elisabeta", "Ilona", "Irina", "Livia", "Marisha", "Mirela",
    "Morwenna", "Natalia", "Oana", "Rozalia", "Sabina", "Valeska", "Vesna", "Ysolde",
    "Zora", "Anka", "Teodora", "Lucretia",
  ],
} as const;

const VAMPIRE_HOUSE = {
  prefixes: [
    "Ash", "Black", "Crow", "Dusk", "Grave", "Hollow", "Mourn", "Night",
    "Raven", "Red", "Thorn", "Vesper", "Wolf", "Cinder", "Gloam",
  ],
  suffixes: ["moor", "hallow", "spire", "vane", "mere", "holt", "gard", "crypt", "wick", "fell"],
  particles: ["von", "de", "van"],
} as const;

const VAMPIRE_SURNAMES = [
  "Draganescu", "Morovan", "Szekarny", "Valcourt", "Ostrava", "Belmondi", "Krovic",
  "Lupescu", "Varga", "Strozzi", "Malbec", "Orlenko",
] as const;

const THRALL_GIVEN = {
  male: [
    "Anzel", "Bertok", "Dobri", "Gavril", "Hanno", "Jory", "Kasper", "Luka",
    "Matej", "Pavo", "Stanko", "Tomas", "Vlado", "Grub", "Otto", "Fenn",
  ],
  female: [
    "Agata", "Bora", "Dana", "Greta", "Hanka", "Jelka", "Katrin", "Lenka",
    "Marta", "Neda", "Ruza", "Tesa", "Mags", "Ottilie", "Brin", "Wenna",
  ],
} as const;

const THRALL_FAMILY = {
  prefixes: ["Mud", "Ditch", "Turnip", "Barrow", "Tallow", "Worm", "Crook", "Mill", "Pail", "Gristle"],
  suffixes: ["water", "wood", "back", "foot", "bottom", "well", "field", "shank", "kettle", "ford"],
  particles: [],
} as const;

const THRALL_SURNAMES = ["Grubb", "Pottage", "Hobb", "Thimble", "Dunk", "Wick", "Scrape", "Knuckle"] as const;

export const VAMPIRE_NAME_BOOKS: Readonly<Record<string, NameBook>> = {
  "Thrall Lineman": {
    given: THRALL_GIVEN,
    surnames: THRALL_SURNAMES,
    house: THRALL_FAMILY,
    epithets: ["the Meek", "Bitten Twice", "the Willing", "Spare Ribs", "Pale Lad", "the Stew"],
  },
  "Vampire Thrower": {
    given: VAMPIRE_GIVEN,
    surnames: VAMPIRE_SURNAMES,
    house: VAMPIRE_HOUSE,
    epithets: ["the Long Reach", "Silver-Arm", "the Arc", "Velvet Hand", "the Courtier"],
  },
  "Vampire Blitzer": {
    given: VAMPIRE_GIVEN,
    surnames: VAMPIRE_SURNAMES,
    house: VAMPIRE_HOUSE,
    epithets: ["the Red Hand", "Bonebreaker", "the Unkind", "Iron Count", "the Butcher of Vellt"],
  },
  "Vampire Runner": {
    given: VAMPIRE_GIVEN,
    surnames: VAMPIRE_SURNAMES,
    house: VAMPIRE_HOUSE,
    epithets: ["Quickblood", "the Mist", "Nightfoot", "the Gone", "Swiftfang"],
  },
};
