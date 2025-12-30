# Data Models

## Overview

This document describes the core data structures used throughout the Blood Bowl Phaser.js game.

## Team Model

```typescript
interface Team {
  id: string; // Unique identifier
  name: string; // Team name
  roster: RosterTemplate; // Roster type (Orcs, Humans, etc.)
  players: Player[]; // Team roster
  reRolls: number; // Number of team re-rolls
  treasury: number; // Gold remaining
  color: number; // Team color (hex)

  // Optional league play fields
  teamValue?: number; // Total TV
  dedicatedFans?: number; // Fan factor
  cheerleaders?: number; // Number of cheerleaders
  assistantCoaches?: number; // Number of coaches
  apothecary?: boolean; // Has apothecary
}
```

## Player Model

```typescript
interface Player {
  id: string; // Unique identifier
  name: string; // Player name
  position: string; // Position type (Lineman, Blitzer, etc.)
  number: number; // Jersey number
  stats: PlayerStats; // Current stats
  skills: Skill[]; // Acquired skills
  status: PlayerStatus; // Current status

  // Position on pitch
  gridPosition?: {
    x: number; // Grid X coordinate
    y: number; // Grid Y coordinate
  };

  // League play fields
  spp?: number; // Star Player Points
  level?: number; // Player level
  injuries?: Injury[]; // Permanent injuries
  matchesPlayed?: number; // Career matches
  touchdowns?: number; // Career TDs
  casualties?: number; // Career casualties
  completions?: number; // Career completions
}
```

### PlayerStats

```typescript
interface PlayerStats {
  MA: number; // Movement Allowance (1-9)
  ST: number; // Strength (1-6)
  AG: number; // Agility (1-6)
  PA: number; // Passing (1-6)
  AV: number; // Armor Value (3-11)
}
```

### PlayerStatus

```typescript
enum PlayerStatus {
  READY = "READY", // Available to play
  ACTIVATED = "ACTIVATED", // Has acted this turn
  PRONE = "PRONE", // Knocked down
  STUNNED = "STUNNED", // Stunned (miss next turn)
  KO = "KO", // Knocked out (miss rest of half)
  CASUALTY = "CASUALTY", // Out of game
  RESERVES = "RESERVES", // In dugout
}
```

## Skill Model

```typescript
interface Skill {
  id: string; // Skill identifier
  name: string; // Display name
  description: string; // What it does
  category: SkillCategory; // Skill type

  // Effects (simplified)
  modifiesRoll?: boolean; // Modifies dice rolls
  allowsReroll?: boolean; // Grants re-roll
  modifiesStat?: string; // Modifies a stat
}

enum SkillCategory {
  GENERAL = "GENERAL",
  AGILITY = "AGILITY",
  STRENGTH = "STRENGTH",
  PASSING = "PASSING",
  MUTATION = "MUTATION",
}
```

## Game State Model

```typescript
interface GameState {
  phase: GamePhase; // Current game phase
  activeTeamId: string | null; // Which team is active
  turn: TurnData; // Current turn data
  score: {
    // Score by team
    [teamId: string]: number;
  };

  // Ball state
  ballPosition?: {
    x: number;
    y: number;
  };
  ballCarrierId?: string; // Player holding ball

  // Setup state
  setupConfirmed?: {
    [teamId: string]: boolean;
  };
  placedPlayers?: Map<string, PlayerPlacement>;
}

enum GamePhase {
  SETUP = "SETUP",
  KICKOFF = "KICKOFF",
  PLAY = "PLAY",
  TOUCHDOWN = "TOUCHDOWN",
  HALFTIME = "HALFTIME",
  GAME_OVER = "GAME_OVER",
}

interface TurnData {
  teamId: string; // Active team
  turnNumber: number; // 1-6 (Sevens)
  isHalf2: boolean; // First or second half
  activatedPlayerIds: Set<string>; // Players who acted
  hasBlitzed: boolean; // Blitz used
  hasPassed: boolean; // Pass used
  hasHandedOff: boolean; // Hand-off used
  hasFouled: boolean; // Foul used
}
```

## Roster Template Model

```typescript
interface RosterTemplate {
  id: string; // Roster identifier
  name: string; // Race name
  reRollCost: number; // Cost of re-rolls
  positions: PositionalPlayer[]; // Available positions

  // Special rules
  specialRules?: string[];
}

interface PositionalPlayer {
  position: string; // Position name
  cost: number; // Gold cost
  max: number; // Max on roster
  stats: PlayerStats; // Base stats
  primarySkills: SkillCategory[]; // Primary skill access
  secondarySkills: SkillCategory[]; // Secondary skill access
  startingSkills?: string[]; // Skills at creation
}
```

## Action Models

```typescript
interface Action {
  type: ActionType;
  playerId: string;
  timestamp: number;

  // Action-specific data
  data?;
}

enum ActionType {
  MOVE = "MOVE",
  BLOCK = "BLOCK",
  BLITZ = "BLITZ",
  PASS = "PASS",
  HAND_OFF = "HAND_OFF",
  FOUL = "FOUL",
  PICKUP = "PICKUP",
  CATCH = "CATCH",
}

interface MoveAction extends Action {
  type: ActionType.MOVE;
  data: {
    from: GridPosition;
    to: GridPosition;
    path: GridPosition[];
  };
}

interface BlockAction extends Action {
  type: ActionType.BLOCK;
  data: {
    defenderId: string;
    diceRolled: number;
    result: BlockResult;
  };
}
```

## Grid Position

```typescript
interface GridPosition {
  x: number; // Grid X (0-16 for Sevens)
  y: number; // Grid Y (0-10 for Sevens)
}
```

## Dice Results

```typescript
enum BlockDiceResult {
  ATTACKER_DOWN = "ATTACKER_DOWN",
  BOTH_DOWN = "BOTH_DOWN",
  PUSH = "PUSH",
  DEFENDER_STUMBLES = "DEFENDER_STUMBLES",
  DEFENDER_DOWN = "DEFENDER_DOWN",
}

interface DiceRoll {
  type: DiceType;
  result: number | BlockDiceResult;
  modifiers: number;
  finalResult: number;
  wasRerolled: boolean;
}

enum DiceType {
  D6 = "D6",
  D8 = "D8",
  TWO_D6 = "2D6",
  BLOCK = "BLOCK",
}
```

## Injury Models

```typescript
interface Injury {
  type: InjuryType;
  description: string;
  permanent: boolean;
  statModifier?: {
    stat: keyof PlayerStats;
    change: number;
  };
}

enum InjuryType {
  NONE = "NONE",
  STUNNED = "STUNNED",
  KO = "KO",
  BADLY_HURT = "BADLY_HURT",
  SERIOUS_INJURY = "SERIOUS_INJURY",
  DEAD = "DEAD",
}
```

## Validation Results

```typescript
interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

interface ActionResult {
  success: boolean;
  turnover: boolean;
  message?: string;
  effects?: ActionEffect[];
}

interface ActionEffect {
  type: string;
  target: string;
  data;
}
```

## Related Documentation

- [Architecture](../technical/architecture.md)
- [Game State](../technical/game-state.md)
- [Game Rules](./game-rules.md)

---

**Last Updated**: 2025-12-05
