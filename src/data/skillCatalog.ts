import type {
  SkillType,
  SkillCategory,
  SkillKind,
  SkillUsage,
} from "../types/Skills";

export const SKILL_CATALOG = {
  Accurate: {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 to the passing roll on a Quick Pass or Short Pass.",
  },
  "Always Hungry": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: true,
    parameterForm: null,
    description:
      "When throwing or kicking a team-mate, a 1 means trying to eat them: another 1 kills them, anything else fumbles the throw.",
  },
  "Animal Savagery": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Needs 4+ to activate, or 2+ to Block or Blitz. On a failure, knocks down an adjacent standing team-mate and carries on, or with none nearby does nothing.",
  },
  Animosity: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: true,
    parameterForm: "X",
    description:
      "Needs 2+ to pass or hand off to the named kind of team-mate. On a failure the player keeps the ball and their activation ends.",
  },
  "Arm Bar": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When an opponent fails a dodge away from this player, add 1 to the armour or injury roll.",
  },
  "Ball & Chain": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: true,
    parameterForm: null,
    description:
      "Moves square by square in a rolled direction, blocking anyone standing in the way. If it falls it skips armour, and Stunned becomes Knocked-out.",
  },
  "Big Hand": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Ignores penalties for opponents marking the ball and for the weather when picking it up.",
  },
  Block: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Stays on their feet when a Both Down is chosen, whether blocking or being blocked.",
  },
  Bloodlust: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: "X+",
    description:
      "Rolls to activate, with +1 to Block or Blitz. After a failure, must bite an adjacent Thrall Lineman, or be Distracted and cause a Turnover.",
  },
  Bombardier: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Throws a bomb like a pass. It knocks down whoever fails to catch it, and each neighbour on a 4+. A fumble hits the thrower.",
  },
  "Bone Head": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Needs 2+ to activate. On a failure the player is Distracted and does nothing this turn.",
  },
  Brawler: {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Once a turn, re-rolls one Both Down die in a Block, but not in a Blitz.",
  },
  "Break Tackle": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Once a turn, adds 1 to a dodge with Strength 4, or 3 with Strength 5 or more.",
  },
  "Breathe Fire": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Instead of a Block: 4+, or 5+ against Strength 5 or more, places an opponent Prone. A 6 knocks them down, and a 1 the user.",
  },
  Bullseye: {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "An accurate Throw Team-mate lands exactly on the target square, with no scatter.",
  },
  Cannoneer: {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 to the passing roll on a Long Pass or Long Bomb.",
  },
  Catch: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Once a turn, re-rolls a failed catch.",
  },
  Chainsaw: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Instead of a Block: rolls armour at +3, but a 1 first knocks the user down. The user's own armour rolls when knocked down get +3.",
  },
  Claws: {
    kind: "skill",
    category: "Mutation",
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "A natural 8+ on the armour dice breaks armour when this player blocks, wins a Both Down or lashes out. Iron Hard Skin stops it.",
  },
  "Cloud Burster": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Opponents cannot intercept this player's passes, unless they have Very Long Legs.",
  },
  Dauntless: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Against a stronger opponent, roll a D6 and add Strength. Beating their Strength matches it, before assists and other modifiers.",
  },
  Decay: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "+1 to every casualty roll made against this player, so injuries are worse.",
  },
  Defensive: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "During the opposing turn, players this one marks cannot use Guard or Put the Boot In against its team-mates.",
  },
  "Dirty Player": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "+1 to either the armour roll or the injury roll when fouling. Iron Hard Skin blocks it on armour.",
  },
  "Disturbing Presence": {
    kind: "skill",
    category: "Mutation",
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description: "Opponents within 3 squares get -1 to pass and catch.",
  },
  "Diving Catch": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can catch a ball landing in an adjacent empty square, and gets +1 to catch a pass that lands on its target square.",
  },
  "Diving Tackle": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When an adjacent opponent's dodge or jump away would succeed, can dive Prone to take 2 off it. Cannot stop a natural 6.",
  },
  Dodge: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Once a turn, re-rolls a failed dodge, unless it left a square next to Tackle. A Stumble only pushes this player back, unless the blocker has Tackle.",
  },
  Drunkard: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description: "-1 to every rush roll.",
  },
  "Dump-Off": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When an opponent blocks this ball carrier or uses a Special Action on them, can first throw a Quick Pass to the nearest team-mate.",
  },
  "Extra Arms": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "+1 to catch, intercept or pick up the ball, except with Secure the Ball.",
  },
  "Eye Gouge": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "An opponent this player pushes back cannot assist until that opponent next activates.",
  },
  Fend: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "A blocker who pushes this player back cannot follow up, except with Juggernaut in a Blitz or Ball & Chain.",
  },
  "Foul Appearance": {
    kind: "skill",
    category: "Mutation",
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "An opponent who blocks this player rolls a D6 first. On a 1 the block does not happen. Ball & Chain ignores it.",
  },
  Frenzy: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: true,
    parameterForm: null,
    description:
      "Follows up every push unless Fend stops it, then blocks once more if the opponent is still standing next to them. Not in a Multiple Block.",
  },
  Fumblerooski: {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "While moving, can leave the ball in an adjacent empty square without causing a Turnover.",
  },
  "Give and Go": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Can keep moving after a Quick Pass or a Hand-off.",
  },
  Grab: {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "In a Block, but not a Blitz, pushes the opponent into any free adjacent square and stops them using Sidestep.",
  },
  Guard: {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can assist a block even while marked. In their own turn, a Defensive marker other than the block's target stops it.",
  },
  "Hail Mary Pass": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can throw the ball to any square. It is never accurate and cannot be intercepted, but it can still be fumbled.",
  },
  Hatred: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: "X",
    description:
      "Can re-roll one Player Down die when blocking the named kind of opponent.",
  },
  "Hit and Run": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "After a Block or Stab, can move one free square to a spot no opponent marks. The game picks the square.",
  },
  Horns: {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 Strength for each block in a Blitz.",
  },
  "Hypnotic Gaze": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Needs 3+ to Distract an adjacent opponent, who loses their tackle zone.",
  },
  Insignificant: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "A roster cannot have more Insignificant players than players without this trait.",
  },
  "Iron Hard Skin": {
    kind: "skill",
    category: "Mutation",
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "Cancels armour-roll bonuses from fouls, Chainsaw, Mighty Blow, Lethal Flight and Claws against this player.",
  },
  Juggernaut: {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "In a Blitz, treats Both Down as a push, and opponents cannot use Fend, Stand Firm or Wrestle.",
  },
  "Jump Up": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Stands up for free. Can also Block from Prone by passing an Agility roll at +1; on a failure the activation ends.",
  },
  Kick: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "The kick-off scatters a D3 squares instead of a D6. Can re-roll a Punt's direction and distance.",
  },
  "Kick Team-Mate": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can kick an adjacent Right Stuff team-mate up to a Short Pass away. A fumbled kick injures them and is a Turnover.",
  },
  Leader: {
    kind: "skill",
    category: "Passing",
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "While on the pitch, gives the team one extra re-roll each half.",
  },
  Leap: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can jump over any adjacent square, and the jump's penalty is 1 smaller, to a minimum of -1.",
  },
  "Lethal Flight": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "With Right Stuff, when thrown into an opponent, adds 1 to their armour or injury roll and earns SPP for a casualty.",
  },
  "Lone Fouler": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Re-rolls a failed foul armour roll when neither side has an assist.",
  },
  Loner: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: "X+",
    description:
      "Must roll the number shown or higher for a team re-roll to work. The re-roll is spent either way.",
  },
  "Mighty Blow": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Adds the number shown to the armour or injury roll when this player blocks, wins a Both Down or lashes out.",
  },
  "Monstrous Mouth": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Strip Ball has no effect. Instead of a Block, a 3+ bites an adjacent opponent, who cannot leave while this player marks them.",
  },
  "Multiple Block": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can block two adjacent opponents in one Action, at -2 Strength for both blocks, to a minimum of 1.",
  },
  "My Ball": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Cannot choose to pass or hand off the ball, or throw a team-mate while holding it.",
  },
  "Nerves of Steel": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Ignores penalties for being marked when passing or catching.",
  },
  "No Ball": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description: "Can never pick up or catch the ball.",
  },
  "On the Ball": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can move up to 3 squares before an opponent's pass. At a kick-off, one unmarked receiving player can too.",
  },
  Pass: {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Once a turn, re-rolls a failed passing roll.",
  },
  "Pick-Me-Up": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "At the end of the opponent's turn, each Prone team-mate within 3 squares stands up on a 5+.",
  },
  "Pile Driver": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "After knocking down an opponent with a block, can foul them for free if still adjacent, then is placed Prone.",
  },
  "Plague Ridden": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "Once a game, killing an opponent with a block adds a free Lineman. Not from a Big Guy, Stunty, Decay or Regeneration.",
  },
  Pogo: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can jump over any adjacent square and ignores all penalties to the jump.",
  },
  "Prehensile Tail": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Opponents dodging or jumping away from this player get -1. More than one tail does not add up.",
  },
  Pro: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Once a turn in their own activation, on a 3+, re-rolls one die. On a 1 or 2 no other re-roll can be used.",
  },
  "Projectile Vomit": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Instead of a Block: on a 2+, rolls armour against an adjacent opponent with no modifiers. On a 1 the user is hit instead.",
  },
  Punt: {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Kicks the ball D6 squares in a rolled direction, centred on the way the coach chooses.",
  },
  "Put the Boot In": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can assist a foul even while marked, unless by a Defensive opponent other than the foul's target.",
  },
  "Quick Foul": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Can keep moving after a foul, unless sent off.",
  },
  "Really Stupid": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Needs 4+ to activate, or 2+ beside a standing team-mate who is neither Really Stupid nor Distracted. On a failure, Distracted and does nothing.",
  },
  Regeneration: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description: "On a 4+, shrugs off a casualty and goes to Reserves.",
  },
  "Right Stuff": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "Can be thrown or kicked by a team-mate, as long as their Strength is 3 or less.",
  },
  Saboteur: {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When a block would knock them down, on a 4+ the player is Knocked-out and the blocker goes down too.",
  },
  "Safe Pair of Hands": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Knocked down by Attacker Down, or down on Both Down, with the ball: places it in an adjacent empty square instead of letting it bounce.",
  },
  "Safe Pass": {
    kind: "skill",
    category: "Passing",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Keeps the ball when a pass fumbles on a natural 1, with no Turnover.",
  },
  "Secret Weapon": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "Sent off when a drive they finish ends. In Street and Gutter Bowl the crowd rolls to drag them away instead.",
  },
  Shadowing: {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When an adjacent opponent dodges away, follows into the empty square on a 4+. Limited to MA tries a turn.",
  },
  Sidestep: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Chooses any free adjacent square when pushed back, unless the blocker uses Grab.",
  },
  "Sneaky Git": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Not sent off for rolling a double on a foul's armour roll that fails to break armour.",
  },
  Sprint: {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Can rush three times in an activation instead of twice.",
  },
  Stab: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Instead of a Block, rolls armour against an adjacent opponent with no modifiers.",
  },
  "Stand Firm": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can refuse to be pushed back, except by Juggernaut in a Blitz.",
  },
  "Steady Footing": {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When a failed rush, dodge or jump, or a block, would put them down, stays standing on a 6.",
  },
  "Strip Ball": {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Pushing back a ball carrier makes them drop the ball, even if they stay standing. Monstrous Mouth stops it.",
  },
  "Strong Arm": {
    kind: "skill",
    category: "Strength",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 to the Throw Team-mate roll.",
  },
  Stunty: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Ignores marking penalties when dodging, but rolls on a worse injury table.",
  },
  "Sure Feet": {
    kind: "skill",
    category: "Agility",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Once a turn, re-rolls a failed rush.",
  },
  "Sure Hands": {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "Once a turn, re-rolls a failed pick-up.",
  },
  Swoop: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Thrown without Bullseye, glides D6 squares from the target in a rolled direction instead of scattering, and re-rolls a failed landing.",
  },
  Tackle: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Opponents leaving a square beside this player cannot use Dodge's re-roll, and Dodge does not help when this player blocks them.",
  },
  "Take Root": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Rolls when activated standing. On a 1 the player can act but not leave their square until knocked down or the drive ends.",
  },
  Taunt: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When a block pushes them back, can force the blocker to follow up.",
  },
  Tentacles: {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can hold an opponent dodging or jumping away: D6 plus the Strength difference of 6+, or a natural 6, ends their activation. A 1 fails.",
  },
  "Thick Skull": {
    kind: "skill",
    category: "Strength",
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "A Knocked-out result at the bottom of its range becomes Stunned.",
  },
  "Throw Team-mate": {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Can throw an adjacent Right Stuff team-mate up to a Short Pass away.",
  },
  "Timmm-ber!": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: false,
    parameterForm: null,
    description:
      "With MA 2 or less, gets +1 to stand up for each adjacent standing team-mate that no opponent marks.",
  },
  Titchy: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "+1 to dodge. This player's tackle zone gives no penalty to opponents dodging into it.",
  },
  Trickster: {
    kind: "trait",
    category: null,
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "When blocked, can first slip to a free square beside the blocker. The game picks the square.",
  },
  "Two Heads": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 to every dodge.",
  },
  "Unchannelled Fury": {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description:
      "Needs 4+ to activate, or 2+ to Block or Blitz. On a failure the activation ends.",
  },
  Unsteady: {
    kind: "trait",
    category: null,
    usage: "passive",
    compulsory: true,
    parameterForm: null,
    description: "Cannot take the Secure the Ball Action.",
  },
  "Very Long Legs": {
    kind: "skill",
    category: "Mutation",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description: "+1 to jump and +2 to intercept, and ignores Cloud Burster.",
  },
  "Violent Innovator": {
    kind: "skill",
    category: "Devious",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "Earns SPP for a Casualty this player causes with a Special Action.",
  },
  Wrestle: {
    kind: "skill",
    category: "General",
    usage: "active",
    compulsory: false,
    parameterForm: null,
    description:
      "On a Both Down, can place both players Prone with no armour rolls. A defender cannot use it against Juggernaut in a Blitz.",
  },
} satisfies Record<
  SkillType,
  {
    kind: SkillKind;
    category: SkillCategory | null;
    usage: SkillUsage;
    compulsory: boolean;
    parameterForm: string | null;
    description: string;
  }
>;
