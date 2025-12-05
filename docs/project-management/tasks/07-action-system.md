# Task 07: Action System

**Status**: 📋 NOT STARTED  
**Priority**: 🟡 Medium  
**Phase**: 2 - Core Gameplay Mechanics  
**Dependencies**: [Task 04](./04-movement-system.md), [Task 05](./05-blocking-system.md), [Task 06](./06-ball-mechanics.md)  

## 📝 Description

Implement the complete action system including blitz, foul, and special actions with proper validation and UI.

## 🎯 Objectives

1. Implement blitz action (move + block)
2. Add foul action mechanics
3. Create action validation system
4. Build action UI and selection
5. Add action animations
6. Implement action history tracking

## ✅ Acceptance Criteria

- [ ] Blitz action allows movement + one block
- [ ] Foul action implemented with ejection risk
- [ ] One blitz/pass/foul per team per turn enforced
- [ ] Action UI clear and intuitive
- [ ] Actions properly animated
- [ ] All action rules tested

## 📋 Blood Bowl Action Rules

### Blitz
- One per team per turn
- Player can move and make one block during movement
- Block can occur at any point in movement
- Movement continues after block if player still standing

### Foul
- One per team per turn
- Target must be prone (down)
- Roll armor + 1 for each assist
- If doubles rolled, fouling player ejected
- Causes turnover if caught (doubles)

## 🔄 Updates

- **2025-12-05**: Task created
