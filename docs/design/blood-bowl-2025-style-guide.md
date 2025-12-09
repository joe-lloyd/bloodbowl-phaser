# Blood Bowl 2020 – Web Style Guide

> **Design pillars**
>
> * Bold, readable, print-inspired
> * Sports broadcast + grim fantasy
> * High contrast, strong hierarchy
> * Everything should feel *official* and a bit brutal

---

## 1. Core Visual Identity

### 🎨 Color Palette

The BB2020 rules use a **red / parchment / deep blue** triad with gold accents.

#### Primary Colors

```txt
Blood Red        #8E1B1B  (primary headers, UI emphasis)
Deep Crimson     #B32020  (hover, highlights)
Ink Blue         #1E3A5F  (header bands, nav bars)
```

#### Secondary Colors

```txt
Parchment       #F3E9D2  (page background)
Warm Paper      #E8DDC4  (cards, panels)
```

#### Accent Colors

```txt
Gold Accent     #D6B25E  (icons, borders, stars)
Dark Gold       #B59645  (hover/pressed)
Pitch Green     #556B2F  (field diagrams, tags)
```

#### Utility

```txt
Text Dark       #2A1F1A
Muted Text      #6B5E54
Divider Brown   #C7B89A
Error           #9C1C1C
Success         #3E6B2F
```

✅ **Rules**

* Never pure white → always parchment.
* Avoid gradients except for header bands.
* Red is reserved for *importance* (not decoration).

---

### ✍️ Typography

#### Primary Typeface (Headings)

* **Industry / Graduate / Oswald (web-safe alt)**
* All caps preferred
* Heavy weight, tight tracking

```txt
H1: 32–40px / 800 / ALL CAPS
H2: 24–28px / 700 / ALL CAPS
H3: 18–20px / 700
```

#### Body Typeface

* **Crimson Pro / Libre Baskerville / Georgia**
* Bookish, readable, tabletop vibe

```txt
Body: 16px / 400 / line-height 1.6
Small UI: 14px / 400
Helper text: 13px / italic optional
```

#### Tables & Stats

* **Inter / Roboto Mono**
* Numbers must align cleanly

```txt
Table headers: 14px / 600
Table cells:   14px / 400
```

---

### 🧱 Iconography & Visual Style

* **Style:** Flat + engraved (no outlines, no neon)
* Inspiration: carved stone, stamped metal
* Prefer **monochrome SVG icons**
* Use gold or dark red fills

✅ Good:

* Dice icons
* Shields
* Stars
* Whistles, skulls, boots

❌ Bad:

* Rounded material icons
* Line-only icons
* Emojis in UI (content is fine)

---

## 2. Layout Rules

### 📐 Grid System

**Desktop**

* Max width: non, its a game lets scale the ui and use the space
* 12-column grid
* 24px gutters

**Tablet**

* 8 columns

**Mobile**

* Single column
* Sticky top nav strongly recommended

---

### 📏 Spacing Scale

**8px base unit**

```txt
xs  = 8px
sm  = 16px
md  = 24px
lg  = 32px
xl  = 48px
xxl = 64px
```

✅ Headings always have **more top than bottom space**

---

### 🧩 Core Containers

#### Cards / Panels

* Background: `Warm Paper`
* Border: `1px solid Divider Brown`
* Optional top accent bar in `Ink Blue` or `Blood Red`

#### Section Blocks (rulebook-style)

* Title with underline
* Slight inset padding
* Can include tone box (greyed parchment)

---

## 3. UI Components

### 🔘 Buttons

#### Primary Button

```txt
BG: Blood Red
Text: Parchment
Border: Dark Gold
```

States:

* Hover → Deep Crimson
* Active → Dark Gold shadow inset
* Disabled → Muted Red + low contrast text

#### Secondary Button

```txt
BG: Ink Blue
Text: Parchment
```

✅ Buttons should feel **chunky**, not sleek.

---

### 🧾 Inputs

* BG: `Parchment`
* Border: `Divider Brown`
* Focus: `Gold Accent` outline

Checkboxes & toggles:

* Square or shield-shaped
* Clear checked vs unchecked contrast

---

### 🧭 Navigation

* **Top bar** in Ink Blue
* Section tabs styled like rulebook headers
* Breadcrumbs with `>` separators

✅ Navigation text = ALL CAPS

---

### 💬 Feedback States

#### Alerts

* Error: Blood Red panel + icon
* Info: Ink Blue panel
* Success: Pitch Green

#### Tooltips

* Dark parchment
* Small serif text
* Slight delay (300ms)

#### Loading

* Dice roll / spinning star motif
* Avoid generic spinners

---

## 4. Interaction Design

### 🧠 States & Feedback

* Everything clickable must:

  * Change color
  * Change cursor
  * Have hover + active

No silent interactions. Ever.

---

### 🎥 Animation

* Fast, snappy, minimal

```txt
Duration: 120–200ms
Easing: cubic-bezier(0.2, 0.8, 0.2, 1)
```

Use for:

* Dropdowns
* Tab switches
* Dice roll reveals 😏

---

### 🏈 Game-Specific UI

* Team rosters = tables first, cards second
* Stats always left-aligned vertically
* Icons reinforce rules, never replace text

HUD philosophy:

> “Looks dense, reads easy”

---

## 5. Content & Accessibility

### 🖋 Writing Style

* Clear, rules-focused
* Short sentences
* Active voice

✅ Good:

> “Place the ball in the center square.”

❌ Bad:

> “The ball should then be placed…”

---

## 6. Implementation

### 🧑‍💻 CSS Architecture

### 🧑‍💻 CSS Architecture

We use **Tailwind CSS** with a custom configuration that matches the Blood Bowl 2025 style guide.

#### Theme Configuration

**Colors**: prefixed with `bb-` (e.g., `bg-bb-blood-red`, `text-bb-ink-blue`)
**Fonts**:
* Headings: `font-heading` (Oswald)
* Body: `font-body` (Crimson Pro)

**Spacing**: 8px-based scale (`xs`, `sm`, `md`, `lg`, `xl`, `xxl`)

**Shadows**:
* `shadow-parchment`: Deep, ambient shadow for full-screen parchment
* `shadow-parchment-light`: lighter shadow for cards/panels
* `shadow-chunky`: Hard edge shadow for active states

**Transitions**: `transition-bb` uses the custom cubic-bezier easing.

---

### 📱 Responsive & Touch

* Touch targets ≥ 44px
* Tables:

  * Horizontal scroll on mobile
  * Sticky first column
