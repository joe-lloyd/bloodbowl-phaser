# Task 16: Replay System

**Status**: 📋 NOT STARTED  
**Priority**: 🔵 Low  
**Phase**: 4 - Polish & Meta  
**Dependencies**: [Task 09](./09-dice-system.md)

## 📝 Description

Implement a system to record and replay matches using deterministic RNG and event logging.

## 🎯 Objectives

1. Create match recorder service
2. Implement match file format (JSON)
3. Build match player/viewer
4. Add playback controls (pause, speed, skip)
5. Ensure full determinism across all mechanics

## ✅ Acceptance Criteria

- [ ] Matches can be completely recorded
- [ ] Replay produces identical results to original match
- [ ] Playback is smooth and controllable
- [ ] Match files can be saved and loaded

## 🔄 Updates

- **2025-12-05**: Task created
- **2026-01-03**: Foundation laid with deterministic Mulberry32 RNG implementation and centralized event emission for dice rolls.
