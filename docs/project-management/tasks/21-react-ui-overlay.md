# Task 21: React UI Overlay Migration

**Status**: 📋 NOT STARTED  
**Priority**: 🔴 High  
**Phase**: 4 - Infrastructure  
**Dependencies**: None (Can run in parallel with other tasks)

## 📝 Description

Migrate from Phaser-based UI to a React overlay system for all game UI elements. This will allow for:

- More familiar and powerful UI development using React and CSS
- Better component reusability and state management
- Easier styling with modern CSS/CSS-in-JS solutions
- Clear separation between game rendering (Phaser) and UI (React)

Communication between Phaser and React will be handled via an event bus, making it the single source of truth for game state.

## 🎯 Problem Statement

Current Phaser UI system has several limitations:

- **Complex to build**: Creating UI in Phaser requires manual positioning and styling
- **Limited flexibility**: Hard to create responsive, complex UIs
- **Poor developer experience**: No JSX, CSS, or modern UI patterns
- **Difficult maintenance**: Changes require deep Phaser knowledge
- **No component ecosystem**: Can't leverage React component libraries

## 💡 Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────┐
│      React UI Overlay (HTML/CSS)     │
│  - Team Builder                      │
│  - Game HUD                          │
│  - Menus & Dialogs                   │
│  - Player Cards                      │
└──────────────┬──────────────────────┘
               │ Event Bus
               │ (Bidirectional)
┌──────────────┴──────────────────────┐
│      Phaser Game Canvas              │
│  - Pitch Rendering                   │
│  - Player Sprites                    │
│  - Animations                        │
│  - Game Logic                        │
└─────────────────────────────────────┘
```

### Event Bus Pattern

**Phaser → React** (Game state updates):

- `team:updated` - Team roster changes
- `player:selected` - Player selection
- `game:stateChanged` - Game phase changes
- `action:available` - Available actions for player
- `dice:rolled` - Dice roll results

**React → Phaser** (User actions):

- `ui:playerHired` - User hired a player
- `ui:actionSelected` - User selected an action
- `ui:teamSaved` - User saved team
- `ui:confirmAction` - User confirmed action

### Technology Stack

- **React** (v18+) - UI framework
- **CSS Modules** or **Styled Components** - Styling
- **Zustand** or **Context API** - React state management
- **EventEmitter3** - Event bus (already in Phaser)
- **TypeScript** - Type safety across boundaries

## 🏗️ Implementation Plan

### Phase 1: Setup Infrastructure

- [ ] Configure React to run alongside Phaser
- [ ] Set up build system (Vite supports both)
- [ ] Create event bus service
- [ ] Define TypeScript interfaces for events
- [ ] Create React mounting point in HTML
- [ ] Set up CSS reset and global styles

### Phase 2: Create Core Components

- [ ] Build base UI components (Button, Input, Card, Modal)
- [ ] Create layout components (Panel, Grid, Flex)
- [ ] Implement theme system (colors, typography, spacing)
- [ ] Build shared hooks (useGameState, useEventBus)

### Phase 3: Migrate Team Builder

- [ ] Create React TeamBuilder component
- [ ] Implement roster display
- [ ] Build player hiring interface
- [ ] Add team customization (colors, name)
- [ ] Connect to event bus
- [ ] Remove Phaser TeamBuilderScene UI (keep game canvas)

### Phase 4: Migrate Game HUD

- [ ] Create HUD component overlay
- [ ] Implement player info panel
- [ ] Build action selection UI
- [ ] Add turn tracker
- [ ] Display game log
- [ ] Connect to game events

### Phase 5: Migrate Other Scenes

- [ ] Main menu
- [ ] Team management
- [ ] Settings
- [ ] Modals and dialogs

### Phase 6: Polish & Optimization

- [ ] Add animations and transitions
- [ ] Optimize re-renders
- [ ] Implement proper loading states
- [ ] Add error boundaries
- [ ] Test accessibility
- [ ] Mobile responsiveness

## 📋 Technical Requirements

### Project Structure

```
src/
├── game/                    # Phaser game code
│   ├── scenes/
│   ├── services/
│   └── EventBus.ts         # Central event bus
├── ui/                      # React UI
│   ├── components/
│   │   ├── common/         # Buttons, Inputs, etc.
│   │   ├── team-builder/   # Team builder specific
│   │   └── game-hud/       # Game HUD specific
│   ├── hooks/
│   │   ├── useEventBus.ts
│   │   └── useGameState.ts
│   ├── styles/
│   │   ├── theme.ts
│   │   └── global.css
│   └── App.tsx             # Root React component
├── types/
│   ├── events.ts           # Event type definitions
│   └── game.ts             # Shared game types
└── main.tsx                # Entry point
```

### Event Bus Interface

```typescript
// Event payload type definitions
interface GameEvents {
  "team:updated": { team: Team };
  "player:selected": { playerId: string };
  "game:stateChanged": { phase: GamePhase };
  "ui:playerHired": { position: string };
  "ui:actionSelected": { action: ActionType; playerId: string };
}

// Type-safe event bus
class GameEventBus {
  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void;

  on<K extends keyof GameEvents>(
    event: K,
    handler: (data: GameEvents[K]) => void
  ): void;

  off<K extends keyof GameEvents>(
    event: K,
    handler: (data: GameEvents[K]) => void
  ): void;
}
```

### React Hook Example

```typescript
// useEventBus.ts
export function useEventBus<K extends keyof GameEvents>(
  event: K,
  handler: (data: GameEvents[K]) => void
) {
  useEffect(() => {
    eventBus.on(event, handler);
    return () => eventBus.off(event, handler);
  }, [event, handler]);
}

// Usage in component
function TeamBuilder() {
  const [team, setTeam] = useState<Team | null>(null);

  useEventBus('team:updated', (data) => {
    setTeam(data.team);
  });

  const hirePlayer = (position: string) => {
    eventBus.emit('ui:playerHired', { position });
  };

  return <div>{/* UI */}</div>;
}
```

## ✅ Acceptance Criteria

### Functional

- [ ] All UI screens work in React overlay
- [ ] Event bus communication is reliable
- [ ] No loss of functionality from Phaser UI
- [ ] Game state properly synchronized
- [ ] User actions properly communicated to game

### Non-Functional

- [ ] UI is responsive and performs well
- [ ] Developer experience is improved
- [ ] Code is well-documented
- [ ] Type safety maintained across boundaries
- [ ] Build process works smoothly
- [ ] Hot reload works for UI development

## 🎨 Benefits

### Developer Experience

- ✅ Familiar React patterns and ecosystem
- ✅ Use CSS/SCSS/Styled Components
- ✅ Component libraries (Radix UI, shadcn/ui, etc.)
- ✅ Better debugging with React DevTools
- ✅ Hot module replacement for rapid iteration

### Code Quality

- ✅ Clear separation of concerns
- ✅ Reusable UI components
- ✅ Better testability
- ✅ Type-safe event communication
- ✅ Easier to maintain and extend

### User Experience

- ✅ More polished, modern UI
- ✅ Better animations and transitions
- ✅ Responsive design
- ✅ Accessibility improvements
- ✅ Consistent styling

## ⚠️ Considerations & Risks

### Potential Challenges

- **Bundle size**: React adds ~40-50KB (gzipped)
- **Build complexity**: Need to handle both Phaser and React
- **Learning curve**: Team needs to understand event bus pattern
- **State synchronization**: Must keep game state in sync
- **Performance**: Need to optimize React renders

### Mitigation Strategies

- Use code splitting to reduce initial bundle
- Document event bus patterns clearly
- Use React.memo and useMemo for optimization
- Create clear ownership boundaries for state
- Profile and optimize critical paths

## 📚 Resources

### Libraries to Consider

- **UI Components**: Radix UI, shadcn/ui, Mantine
- **State Management**: Zustand, Jotai, or Context API
- **Styling**: CSS Modules, Styled Components, or Tailwind CSS
- **Forms**: React Hook Form
- **Animations**: Framer Motion

### Reference Implementations

- Phaser + React examples on GitHub
- Game UI overlay patterns
- Event-driven architecture examples

## 🔄 Updates

- **2025-12-07**: Task created based on feedback about Phaser UI complexity
- **Status**: Awaiting approval to begin implementation

## 📝 Notes

This is a significant architectural change but will pay dividends in:

1. Development velocity for UI features
2. Code maintainability
3. Ability to leverage React ecosystem
4. Better separation between game logic and presentation

The event bus pattern is well-established and will keep the codebase clean and maintainable.
