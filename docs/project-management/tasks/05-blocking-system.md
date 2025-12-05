# Task 05: Blocking System

**Status**: 📋 NOT STARTED  
**Priority**: 🟡 Medium  
**Phase**: 2 - Core Gameplay Mechanics  
**Dependencies**: [Task 02](./02-architecture-refactoring.md), [Task 03](./03-testing-infrastructure.md)  

## 📝 Description

Implement the Blood Bowl blocking system including block dice, strength comparison, block results, armor rolls, injury rolls, and casualty outcomes.

## 🎯 Objectives

1. Implement block dice rolling
2. Add strength comparison logic
3. Implement all block results
4. Add armor and injury system
5. Create block UI and animations
6. Implement assist mechanics
7. Add block skills (Block, Dodge, etc.)

## ✅ Acceptance Criteria

- [ ] Block dice rolled based on strength difference
- [ ] All block results implemented correctly
- [ ] Armor rolls work properly
- [ ] Injury rolls and casualties tracked
- [ ] Block UI shows dice and allows selection
- [ ] Assists properly calculated
- [ ] Block skills modify results
- [ ] All blocking rules tested

## 📋 Blood Bowl Blocking Rules

### Block Dice
- Compare attacker ST vs defender ST
- Roll 1-3 block dice based on difference:
  - ST equal: 1 die
  - ST +1: 2 dice (attacker chooses)
  - ST +2 or more: 3 dice (attacker chooses)
  - ST -1: 2 dice (defender chooses)
  - ST -2 or less: 3 dice (defender chooses)

### Block Results
- **Attacker Down**: Attacker knocked down
- **Both Down**: Both players knocked down
- **Push**: Defender pushed back 1 square
- **Defender Stumbles**: Push or knockdown (attacker chooses)
- **Defender Down**: Defender knocked down

### Armor Rolls
- When player knocked down, roll 2D6
- If roll + modifiers > AV, armor broken
- If armor broken, roll injury

### Injury Rolls
- Roll 2D6 on injury table:
  - 2-7: Stunned (miss next turn)
  - 8-9: KO'd (miss rest of half)
  - 10+: Casualty (out of game)

### Assists
- Adjacent teammates add +1 ST
- Must be marking defender
- Maximum +5 from assists

## 🔧 Implementation Details

### BlockService
```typescript
interface IBlockService {
  canBlock(attackerId: string, defenderId: string): boolean
  calculateBlockDice(attackerId: string, defenderId: string): number
  rollBlock(attackerId: string, defenderId: string): BlockResult
  applyBlockResult(result: BlockDiceResult): void
  rollArmor(playerId: string): ArmorResult
  rollInjury(playerId: string): InjuryResult
}
```

### Block Dice UI
```typescript
interface BlockDiceUI {
  showDice(dice: BlockDiceResult[]): void
  selectResult(index: number): void
  animateResult(result: BlockDiceResult): void
}
```

## 🧪 Testing Requirements

### Unit Tests
- [ ] Strength comparison
- [ ] Block dice calculation
- [ ] Assist calculation
- [ ] Armor roll mechanics
- [ ] Injury roll mechanics
- [ ] Block skills effects

### Integration Tests
- [ ] Full block sequence
- [ ] Block with assists
- [ ] Block causing casualty
- [ ] Block with skills

## 🔄 Updates

- **2025-12-05**: Task created
