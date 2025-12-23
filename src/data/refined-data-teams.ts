const teamNames = {
  1: "Imperial Nobility",
  2: "Black Orc",
  3: "Chaos Chosen",
  4: "Dark Elf",
  5: "Dwarf",
  6: "Elven Union",
  7: "Goblin",
  8: "Halfling",
  9: "Human",
  10: "Lizardmen",
  11: "Necromantic Horror",
  12: "Nurgle",
  13: "Ogre",
  14: "Old World Alliance",
  15: "Orc",
  16: "Shambling Undead",
  17: "Skaven",
  18: "Snotling",
  19: "Underworld Denizens",
  20: "Wood Elf",
  21: "Chaos Renegade",
  22: "Amazon",
  23: "Chaos Dwarf",
  24: "High Elf",
  25: "Norse",
  26: "Tomb Kings",
  27: "Vampire",
  28: "Bretonnian",
  29: "Slann",
  30: "Khorne",
  33: "Vampire",
  34: "Gnome",
};

const teams = {
  teams: [
    {
      name: "Imperial Nobility",
      id: "1",
      players: [
        {
          id: 1,
          max: 16,
        },
        {
          id: 2,
          max: 2,
        },
        {
          id: 3,
          max: 2,
        },
        {
          id: 4,
          max: 4,
        },
        {
          id: 5,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Old World Classic"],
      specialRules: [],
    },
    {
      name: "Black Orc",
      id: "2",
      players: [
        {
          id: 6,
          max: 16,
        },
        {
          id: 7,
          max: 6,
        },
        {
          id: 8,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 3,
      teamLeague: ["Badlands Brawl"],
      specialRules: ["Brawlin' Brutes", "Bribery and Corruption"],
    },
    {
      name: "Chaos Chosen",
      id: "3",
      players: [
        {
          id: 9,
          max: 16,
        },
        {
          id: 10,
          max: 4,
        },
        {
          id: 11,
          max: 1,
        },
        {
          id: 12,
          max: 1,
        },
        {
          id: 13,
          max: 1,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 3,
      teamLeague: ["Chaos Clash"],
      specialRules: [],
      pickSpecialRule: il,
      maxBigGuys: 1,
    },
    {
      name: "Dark Elf",
      id: "4",
      players: [
        {
          id: 14,
          max: 16,
        },
        {
          id: 15,
          max: 2,
        },
        {
          id: 16,
          max: 4,
        },
        {
          id: 17,
          max: 2,
        },
        {
          id: 18,
          max: 2,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Elven Kingdoms League"],
      specialRules: [],
    },
    {
      name: "Dwarf",
      id: "5",
      players: [
        {
          id: 19,
          max: 16,
        },
        {
          id: 20,
          max: 2,
        },
        {
          id: 21,
          max: 2,
        },
        {
          id: 22,
          max: 2,
        },
        {
          id: 23,
          max: 1,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Worlds Edge Superleague"],
      specialRules: ["Brawlin' Brutes", "Bribery and Corruption"],
    },
    {
      name: "Elven Union",
      id: "6",
      players: [
        {
          id: 24,
          max: 16,
        },
        {
          id: 25,
          max: 2,
        },
        {
          id: 26,
          max: 2,
        },
        {
          id: 27,
          max: 2,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Elven Kingdoms League"],
      specialRules: [],
    },
    {
      name: "Goblin",
      id: "7",
      players: [
        {
          id: 28,
          max: 16,
        },
        {
          id: 29,
          max: 1,
        },
        {
          id: 30,
          max: 1,
        },
        {
          id: 31,
          max: 1,
        },
        {
          id: 32,
          max: 1,
        },
        {
          id: 33,
          max: 1,
        },
        {
          id: 34,
          max: 1,
        },
        {
          id: 8,
          max: 2,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 4,
      maxBigGuys: 2,
      teamLeague: ["Badlands Brawl", "Underworld Challenge"],
      specialRules: ["Bribery and Corruption"],
    },
    {
      name: "Halfling",
      id: "8",
      players: [
        {
          id: 35,
          max: 16,
        },
        {
          id: 36,
          max: 2,
        },
        {
          id: 37,
          max: 2,
        },
        {
          id: 38,
          max: 2,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 4,
      maxBigGuys: 2,
      teamLeague: ["Halfling Thimble Cup", "Woodland League"],
      specialRules: [],
    },
    {
      name: "Human",
      id: "9",
      players: [
        {
          id: 39,
          max: 16,
        },
        {
          id: 40,
          max: 2,
        },
        {
          id: 41,
          max: 2,
        },
        {
          id: 42,
          max: 2,
        },
        {
          id: 35,
          max: 3,
        },
        {
          id: 5,
          max: 1,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Old World Classic"],
      specialRules: ["Team Captain"],
    },
    {
      name: "Lizardmen",
      id: "10",
      players: [
        {
          id: 43,
          max: 16,
        },
        {
          id: 44,
          max: 2,
        },
        {
          id: 45,
          max: 6,
        },
        {
          id: 46,
          max: 1,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Lustrian Superleague"],
      specialRules: [],
    },
    {
      name: "Necromantic Horror",
      id: "11",
      players: [
        {
          id: 47,
          max: 16,
        },
        {
          id: 48,
          max: 2,
        },
        {
          id: 49,
          max: 2,
        },
        {
          id: 50,
          max: 2,
        },
        {
          id: 51,
          max: 2,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !1,
      tier: 2,
      teamLeague: ["Sylvanian Spotlight"],
      specialRules: ["Masters of Undeath"],
    },
    {
      name: "Nurgle",
      id: "12",
      players: [
        {
          id: 52,
          max: 16,
        },
        {
          id: 53,
          max: 2,
        },
        {
          id: 54,
          max: 4,
        },
        {
          id: 55,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !1,
      tier: 2,
      teamLeague: ["Chaos Clash"],
      specialRules: ["Brawlin' Brutes", "Favoured of Nurgle"],
    },
    {
      name: "Ogre",
      id: "13",
      players: [
        {
          id: 56,
          max: 16,
        },
        {
          id: 57,
          max: 1,
        },
        {
          id: 58,
          max: 5,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 4,
      teamLeague: ["Badlands Brawl", "Worlds Edge Superleague"],
      specialRules: ["Brawlin' Brutes", "Low Cost Linemen"],
    },
    {
      name: "Old World Alliance",
      id: "14",
      players: [
        {
          id: 115,
          max: 16,
        },
        {
          id: 116,
          max: 1,
        },
        {
          id: 117,
          max: 1,
        },
        {
          id: 118,
          max: 1,
        },
        {
          id: 119,
          max: 3,
        },
        {
          id: 120,
          max: 1,
        },
        {
          id: 121,
          max: 1,
        },
        {
          id: 122,
          max: 1,
        },
        {
          id: 123,
          max: 3,
        },
        {
          id: 5,
          max: 1,
        },
        {
          id: 124,
          max: 1,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Old World Classic"],
      specialRules: [],
      maxBigGuys: 1,
    },
    {
      name: "Orc",
      id: "15",
      players: [
        {
          id: 59,
          max: 16,
        },
        {
          id: 63,
          max: 4,
        },
        {
          id: 60,
          max: 2,
        },
        {
          id: 61,
          max: 2,
        },
        {
          id: 62,
          max: 2,
        },
        {
          id: 64,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Badlands Brawl"],
      specialRules: ["Brawlin' Brutes", "Team Captain"],
    },
    {
      name: "Shambling Undead",
      id: "16",
      players: [
        {
          id: 65,
          max: 16,
        },
        {
          id: 47,
          max: 16,
        },
        {
          id: 48,
          max: 2,
        },
        {
          id: 66,
          max: 2,
        },
        {
          id: 67,
          max: 2,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !1,
      tier: 2,
      teamLeague: ["Sylvanian Spotlight"],
      specialRules: ["Masters of Undeath"],
    },
    {
      name: "Skaven",
      id: "17",
      players: [
        {
          id: 68,
          max: 16,
        },
        {
          id: 69,
          max: 2,
        },
        {
          id: 70,
          max: 4,
        },
        {
          id: 71,
          max: 2,
        },
        {
          id: 72,
          max: 1,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Underworld Challenge"],
      specialRules: [],
    },
    {
      name: "Snotling",
      id: "18",
      players: [
        {
          id: 73,
          max: 16,
        },
        {
          id: 74,
          max: 2,
        },
        {
          id: 75,
          max: 2,
        },
        {
          id: 76,
          max: 2,
        },
        {
          id: 77,
          max: 2,
        },
        {
          id: 8,
          max: 2,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 4,
      teamLeague: ["Underworld Challenge"],
      specialRules: ["Bribery and Corruption", "Low Cost Linemen", "Swarming"],
    },
    {
      name: "Underworld Denizens",
      id: "19",
      players: [
        {
          id: 125,
          max: 16,
        },
        {
          id: 126,
          max: 6,
        },
        {
          id: 127,
          max: 3,
        },
        {
          id: 128,
          max: 1,
        },
        {
          id: 129,
          max: 1,
        },
        {
          id: 130,
          max: 1,
        },
        {
          id: 131,
          max: 1,
        },
        {
          id: 132,
          max: 1,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Underworld Challenge"],
      specialRules: ["Bribery and Corruption"],
      maxBigGuys: 1,
    },
    {
      name: "Wood Elf",
      id: "20",
      players: [
        {
          id: 78,
          max: 16,
        },
        {
          id: 79,
          max: 2,
        },
        {
          id: 80,
          max: 4,
        },
        {
          id: 81,
          max: 2,
        },
        {
          id: 82,
          max: 1,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Elven Kingdoms League", "Woodland League"],
      specialRules: [],
    },
    {
      name: "Chaos Renegade",
      id: "21",
      players: [
        {
          id: 83,
          max: 16,
        },
        {
          id: 84,
          max: 1,
        },
        {
          id: 85,
          max: 1,
        },
        {
          id: 86,
          max: 1,
        },
        {
          id: 87,
          max: 1,
        },
        {
          id: 88,
          max: 1,
        },
        {
          id: 89,
          max: 1,
        },
        {
          id: 90,
          max: 1,
        },
        {
          id: 91,
          max: 1,
        },
        {
          id: 72,
          max: 1,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 3,
      teamLeague: ["Chaos Clash"],
      specialRules: [],
      pickSpecialRule: [
        "Favoured of Chaos Undivided",
        "Favoured of Khorne",
        "Favoured of Nurgle",
        "Favoured of Slaanesh",
        "Favoured of Tzeentch",
      ],
      maxBigGuys: 3,
    },
    {
      name: "Amazon",
      id: "22",
      players: [
        {
          id: 153,
          max: 16,
        },
        {
          id: 154,
          max: 2,
        },
        {
          id: 155,
          max: 2,
        },
        {
          id: 156,
          max: 2,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Lustrian Superleague"],
      specialRules: [],
    },
    {
      name: "Chaos Dwarf",
      id: "23",
      players: [
        {
          id: 96,
          max: 16,
        },
        {
          id: 169,
          max: 2,
        },
        {
          id: 170,
          max: 4,
        },
        {
          id: 171,
          max: 2,
        },
        {
          id: 172,
          max: 2,
        },
        {
          id: 91,
          max: 1,
        },
      ],
      reroll: {
        cost: 70,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Badlands Brawl", "Chaos Clash"],
      specialRules: ["Favoured of Hashut"],
    },
    {
      name: "High Elf",
      id: "24",
      players: [
        {
          id: 100,
          max: 16,
        },
        {
          id: 101,
          max: 2,
        },
        {
          id: 102,
          max: 4,
        },
        {
          id: 103,
          max: 2,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Elven Kingdoms League"],
      specialRules: [],
    },
    {
      name: "Norse",
      id: "25",
      players: [
        {
          id: 144,
          max: 16,
        },
        {
          id: 149,
          max: 2,
        },
        {
          id: 145,
          max: 2,
        },
        {
          id: 146,
          max: 2,
        },
        {
          id: 147,
          max: 2,
        },
        {
          id: 148,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 1,
      teamLeague: ["Chaos Clash", "Old World Classic"],
      pickedLeagueToSpecialRule: {
        "Chaos Clash": "Favoured of Khorne",
      },
      specialRules: [],
    },
    {
      name: "Tomb Kings",
      id: "26",
      players: [
        {
          id: 177,
          max: 16,
        },
        {
          id: 178,
          max: 2,
        },
        {
          id: 179,
          max: 2,
        },
        {
          id: 180,
          max: 4,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !1,
      tier: 2,
      teamLeague: ["Sylvanian Spotlight"],
      specialRules: ["Masters of Undeath"],
    },
    {
      name: "Vampire",
      id: "27",
      players: [
        {
          id: 163,
          max: 16,
        },
        {
          id: 160,
          max: 2,
        },
        {
          id: 161,
          max: 2,
        },
        {
          id: 162,
          max: 2,
        },
        {
          id: 164,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Sylvanian Spotlight"],
      specialRules: ["Masters of Undeath"],
    },
    {
      name: "Bretonnian",
      id: "28",
      players: [
        {
          id: 173,
          max: 16,
        },
        {
          id: 174,
          max: 2,
        },
        {
          id: 175,
          max: 2,
        },
        {
          id: 176,
          max: 2,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 2,
      teamLeague: ["Old World Classic"],
      specialRules: [],
    },
    {
      name: "Khorne",
      id: "30",
      players: [
        {
          id: 140,
          max: 16,
        },
        {
          id: 141,
          max: 2,
        },
        {
          id: 142,
          max: 4,
        },
        {
          id: 143,
          max: 1,
        },
      ],
      reroll: {
        cost: 60,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 3,
      teamLeague: ["Chaos Clash"],
      specialRules: ["Brawlin' Brutes", "Favoured of Khorne"],
    },
    {
      name: "Gnome",
      id: "34",
      players: [
        {
          id: 165,
          max: 16,
        },
        {
          id: 38,
          max: 2,
        },
        {
          id: 166,
          max: 2,
        },
        {
          id: 167,
          max: 2,
        },
        {
          id: 168,
          max: 2,
        },
      ],
      reroll: {
        cost: 50,
        max: 8,
      },
      allowedApothecary: !0,
      tier: 4,
      maxBigGuys: 2,
      teamLeague: ["Halfling Thimble Cup", "Woodland League"],
      specialRules: [],
    },
  ],
};
