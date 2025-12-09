# Blood Bowl Sevens - Visual Design Guide

## Color Palette

### Primary Colors

- **Primary Blue**: `#1d3860` - Headers, borders, primary buttons
- **Primary Dark Blue**: `#092540` - Hover states, accents
- **Danger Red**: `#922d26` - Delete/danger buttons, warnings
- **Danger Dark Red**: `#701d1a` - Danger hover states
- **Gold Accent**: `#eaaa02` - Highlights, selected indicators, special text

### Supporting Colors

- **Parchment**: `#fffef0` - Background for fantasy theme
- **Parchment Shadow**: `#8a4d0f` - Inset shadows for depth
- **Light Blue**: `#d4e8ff` - Hover backgrounds, highlights

## Typography

### Headings

- **Page Title (h1)**: `text-5xl` (48px) - Main page titles
- **Section Title (h2)**: `text-3xl` (30px) - Section headers
- **Subsection (h3)**: `text-2xl` (24px) - Cards, panels

### Body Text

- **Large**: `text-xl` (20px) - Important content
- **Base**: `text-base` (16px) - Standard text
- **Small**: `text-sm` (14px) - Secondary info

### Font Weights

- **Bold**: `font-bold` - Titles, emphasis
- **Normal**: `font-normal` - Body text

## Spacing

### Container Padding

- **Desktop**: `p-12` (48px)
- **Tablet**: `p-10` (40px)
- **Mobile**: `p-6` (24px)

### Section Spacing

- **Between sections**: `mb-12` (48px)
- **Between elements**: `mb-8` (32px)
- **Cards/panels**: `p-8` (32px)

### Grid Gaps

- **Large grids**: `gap-12` (48px)
- **Medium grids**: `gap-8` (32px)
- **Small grids**: `gap-6` (24px)

## Component Sizing

### Buttons

- **Large**: `px-8 py-4 text-xl` - Primary CTA buttons
- **Medium**: `px-6 py-3 text-lg` - Standard buttons
- **Small**: `px-4 py-2 text-base` - Secondary actions

### Cards

- **Minimum padding**: `p-8` (32px)
- **Hover lift**: `-translate-y-1`
- **Shadow on hover**: `shadow-2xl`

### Inputs

- **Height**: `py-4` (16px vertical padding)
- **Text size**: `text-xl`
- **Focus ring**: `ring-4 ring-blood-bowl-primary/20`

## Canvas & UI Overlay

### Canvas Configuration

- **Base dimensions**: 1920x1080 (16:9 aspect ratio)
- **Scale mode**: FIT (maintains aspect ratio)
- **Positioning**: Centered both horizontally and vertically

### React Overlay

- **Position**: Fixed, full viewport
- **Pointer events**: Only on interactive elements
- **Z-index**: 1000 (above canvas)

### Responsive Strategy

- Canvas scales proportionally using Phaser.Scale.FIT
- React UI uses viewport units and matches canvas bounds
- Both canvas and UI center together for perfect alignment

## Fantasy Theme Elements

### Parchment Effect

- Background: `bg-blood-bowl-parchment`
- Shadow: `shadow-parchment` or `shadow-parchment-light`
- Use fixed/absolute positioning for background layer

### Stars Decoration

- Use on main titles for extra flair
- Position absolute, centered above title

## Responsive Breakpoints

- **2xl**: >= 1536px (large desktops)
- **xl**: >= 1280px (desktops)
- **lg**: >= 1024px (small desktops, tablets landscape)
- **md**: >= 768px (tablets portrait)
- **sm**: >= 640px (large phones)
- **Default**: < 640px (phones)

## Best Practices

1. **Use generous spacing** - Don't crowd elements
2. **Make touch targets large** - Minimum 44x44px
3. **Use visual hierarchy** - Size indicates importance
4. **Consistent padding** - Same padding across similar elements
5. **Hover states** - Always provide visual feedback
6. **Transitions** - Smooth 200-300ms transitions
7. **Shadows for depth** - Layer UI elements visually
