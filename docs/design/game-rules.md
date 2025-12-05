# Blood Bowl Rules Reference

## Quick Reference

This document provides a quick reference to Blood Bowl Sevens rules for developers. For complete rules, see [CORE_CONCEPT.md](../../CORE_CONCEPT.md).

## Game Basics

- **Players**: 7 per team (vs 11 in standard)
- **Pitch**: 11x20 squares (vs 15x26 in standard)
- **Turns**: 6 per half (vs 8 in standard)
- **Budget**: 600,000 gold (vs 1,000,000 in standard)
- **Goal**: Score touchdowns by getting ball into opponent's end zone

## Turn Structure

1. **Active Team**: One team is active per turn
2. **Player Actions**: Each player can take 1 action
3. **Special Actions**: Team gets 1 blitz, 1 pass, 1 foul per turn
4. **Turnover**: Turn ends immediately on certain failures
5. **End Turn**: Active player can voluntarily end turn

## Player Actions

| Action | Description | Limit |
|--------|-------------|-------|
| **Move** | Walk up to MA squares | Once per player |
| **Block** | Hit adjacent opponent | Once per player |
| **Blitz** | Move + 1 block | Once per team |
| **Pass** | Throw ball | Once per team |
| **Hand-off** | Give ball to adjacent player | Once per team |
| **Foul** | Kick downed opponent | Once per team |

## Movement

- **MA (Movement Allowance)**: Maximum squares per turn
- **Tackle Zones**: 8 adjacent squares around standing players
- **Dodge**: Required when leaving tackle zones (AG roll)
- **Go-For-It (GFI)**: 2 extra squares beyond MA (2+ roll each)

## Blocking

- **Block Dice**: 1-3 dice based on ST comparison
- **Results**: Attacker Down, Both Down, Push, Stumbles, Defender Down
- **Assists**: Adjacent teammates add +1 ST
- **Armor Roll**: 2D6 vs AV when knocked down
- **Injury Roll**: 2D6 on injury table if armor broken

## Ball Mechanics

- **Pickup**: AG roll, -1 per tackle zone
- **Pass**: AG roll, modified by range (Quick +1, Short 0, Long -1, Bomb -2)
- **Catch**: AG roll, -1 per tackle zone
- **Scatter**: D8 direction, D6 distance on failed catch/pickup
- **Hand-off**: AG roll, counts as pass action

## Turnovers

Turn ends immediately if:
- Player falls (dodge, GFI, etc.)
- Failed pickup
- Failed pass
- Failed catch
- Touchdown scored

## Skills (Common)

- **Block**: Ignore Both Down results
- **Dodge**: Re-roll failed dodge
- **Sure Hands**: Re-roll failed pickup
- **Catch**: Re-roll failed catch
- **Pass**: +1 to passing rolls
- **Sprint**: Re-roll failed GFI

## Stats

- **MA**: Movement Allowance (squares per turn)
- **ST**: Strength (for blocking)
- **AG**: Agility (for ball handling, dodging)
- **PA**: Passing (for throwing)
- **AV**: Armor Value (resist injuries)

## Dice Rolls

Most actions use 2D6 vs target number:
- **AG 1+**: 6+
- **AG 2+**: 5+
- **AG 3+**: 4+
- **AG 4+**: 3+
- **AG 5+**: 2+

Modifiers apply (tackle zones, range, etc.)

## Re-rolls

- **Team Re-rolls**: Limited per half, can re-roll any team action
- **Skill Re-rolls**: Built into skills, specific to that action

## Game Flow

1. **Setup**: Place 7 players in own half
2. **Coin Flip**: Determine kicking team
3. **Kickoff**: Ball scattered onto pitch
4. **Play**: Turns alternate until touchdown or half ends
5. **Halftime**: After turn 6 of each team
6. **Second Half**: Repeat setup and kickoff
7. **Game End**: After turn 6 of second half

## Implementation Notes

### Critical Rules to Implement
1. ✅ Setup validation (7 players, own half)
2. ✅ Turn management (6 turns per half)
3. ⏳ Movement with tackle zones
4. ⏳ Blocking with dice
5. ⏳ Ball mechanics (pickup, pass, catch)
6. ⏳ Turnover conditions
7. ⏳ Skills system
8. ⏳ Dice rolling with modifiers

### Rule Simplifications (Optional)
- Skip kickoff events initially
- Simplified injury system
- Basic skills only
- No weather/special conditions

## Related Documentation

- [Complete Rules](../../CORE_CONCEPT.md)
- [Game State](../technical/game-state.md)
- [Architecture](../technical/architecture.md)

---

**Last Updated**: 2025-12-05
