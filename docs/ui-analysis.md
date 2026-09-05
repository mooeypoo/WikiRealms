# WikiRealms UI Analysis & Redesign Strategy

> **Superseded by [`ux-vision.md`](./ux-vision.md) (2026-09-04).** Kept for history only; its
> layout proposals, token values, and roadmap no longer reflect the plan of record.

**Document Date**: 2026-09-01  
**Scope**: Current state audit, game UI best practices research, library vs. custom approach evaluation, and design system proposal

---

## Executive Summary

WikiRealms has a strong **conceptual foundation** (dark cosmic theme, immersive full-viewport 3D world, glass HUD panels) but suffers from:

1. **Unclear hierarchy** - Multiple UI elements compete for attention with no clear priority
2. **Poor mobile/responsive strategy** - Desktop-optimized; mobile experience undefined
3. **Missing patterns** - No consistent menu, modal, button, or navigation language
4. **Visual polish gap** - Panels lack depth, contrast, readable typography, affordances
5. **Confusing information architecture** - Where do I search? Where is my history? Where are settings?

**Recommendation**: **Custom UI design approach** (not a library) because:
- Game UIs require highly specialized layouts (full-bleed immersive worlds are rare in traditional component libraries)
- Three.js integration + world canvas + HUD overlay is non-standard architecture
- Vuetify/Material would add bulk (>100KB) with limited applicability for this design
- We need **intentional design first**, then implement with custom Vue components

---

## Part 1: Current State Audit

### 1.1 Component Inventory

| Component | Purpose | Issues |
|-----------|---------|--------|
| **SearchBar** | Article lookup | No icon clarity; results dropdown unclear; focus states missing |
| **WorldView** | 2D canvas terrain | Good; but 2D-only mode not visually distinct from 3D |
| **WorldView3D** | 3D Three.js terrain | Good rendering; but too much visual "noise" (portals, flags, overlays compete) |
| **Portal Confirmation Modal** | Confirm navigation | Small, centered modal; easy to miss; unclear visual hierarchy |
| **InfoHub Modal** | Help/documentation | Tabs unclear; text hard to scan; modal too large |
| **SettingsModal** | Preferences | Not visible in session memory; unclear what it contains |
| **Taskbar** | Nav buttons | Unclear why it exists vs App.vue nav controls; separate components? |
| **Article Info Panel** | Context display | Vertical layout, truncated text, no visual scan affordances |
| **Spinner** | Loading state | Generic; doesn't communicate "loading world" vs "loading article" |

### 1.2 Layout Structure Issues

**Current layout** (from App.vue CSS + repo notes):
- `.cosmos` (full-viewport fixed container)
- `.cosmos__stage` (world view fills 100%)
- `.hud` panels (search top-center, nav top-right, article info bottom-left, status top-center)

**Problems**:
1. HUD panels overlap 3D terrain at certain viewport sizes → content obscured
2. No responsive breakpoints defined → mobile layout is broken
3. Panel positions are absolute; no grid/layout system → fragile
4. Multiple "top" panels compete for vertical space
5. "Bottom-left" article panel has no mobile equivalent
6. No visual hierarchy of importance (all panels same glass style)

### 1.3 Visual / Aesthetic Issues

| Issue | Evidence | Impact |
|-------|----------|--------|
| **Low contrast text** | `--text-muted: #9aa3c7` on `--bg-deep: #0b0e1e` is ~2.5:1 (WCAG F) | Readability failure; accessibility issue |
| **Glass panel overuse** | All panels have identical translucent glass treatment | No visual hierarchy; everything feels equal weight |
| **Icon ambiguity** | Some UI elements use emoji (✨ 🌀), others don't; no icon set | Inconsistent affordances |
| **Button affordances** | Buttons not visually distinct from text | Users unclear what's clickable |
| **Portal glyphs** | Whirlpool emoji sprites are beautiful but don't scale well | Looks toy-like vs immersive |
| **Font sizing** | Mixed h1/h2/body without clear scale | Hierarchy unclear |

### 1.4 Missing Patterns

**Standard game UI elements not yet designed**:
- Top menu bar (global navigation)
- Settings/options panel (accessible from anywhere)
- Player inventory / saved states list
- Tutorial overlay / tooltips
- Victory/failure states
- Context menus (right-click on portals, peaks, etc.)
- Keyboard shortcut legend
- Mobile menu/hamburger nav
- Breadcrumb trail (where am I in traversal history?)
- Map/minimap view
- Notification/toast messages

---

## Part 2: Game UI Best Practices

### 2.1 Desktop Game UI Patterns

**Standard architecture for 3D exploration games** (e.g., Skyrim, Stardew, Minecraft mods):

1. **Full-bleed immersive world** ✓ (WikiRealms has this)
2. **Top menu bar** (File, Edit, View, Help; or Logo + Menu)
3. **HUD elements** positioned at edges (top-left: inventory; top-right: mini-map; bottom: hotbar/toolbelt)
4. **Contextual overlays** for interaction (click on object → show context menu)
5. **Pause menu** (pause world, show game menu, settings, quit)
6. **Keyboard shortcuts** displayed in tooltips or help menu
7. **Status indicators** (mini-map, health/state, active mode)
8. **Persistent bottom bar** for mode/tool selection

**Key principle**: "Edges are sacred; center is for the world"
- Edges used for persistent HUD
- Center kept clear for immersion
- Overlays only appear on user action

### 2.2 Mobile Game UI Patterns

**Constraints**:
- **Touch targets** 44-48px minimum
- **Thumb zone** - bottom center and sides accessible
- **Portrait mode** - tall, narrow screen
- **Landscape mode** - wide, short screen
- **No hover states** - everything needs explicit tap

**Common solutions**:
1. **Bottom tab bar** (iOS style) or **hamburger menu** (Android)
2. **Large touch buttons** arranged in corners (diagonal four-corners pattern)
3. **Minimized HUD** - only essential info visible
4. **Fullscreen immersion** - hide non-essential UI on swipe
5. **Swipe gestures** for navigation (left/right for back/forward)
6. **Bottom sheet overlays** instead of centered modals
7. **Haptic feedback** to confirm selections

**WikiRealms specific**:
- Search should be bottom-sheet (swipe up), not top-center
- Portal confirmation modal should be bottom-sheet (easier thumb reach)
- Article info panel should be accordion-fold (slide up from bottom)
- Navigation buttons should be large corner buttons or bottom tab bar

### 2.3 Immersive Game Aesthetics

**Why "glass HUD" feels off**:
- Glass HUD works when it's sparse (Halo, Portal) but WikiRealms has many panels
- Multiple glass layers create visual confusion ("which glass layer am I interacting with?")
- No clear affordance (is this UI element or part of the world?)

**Better approaches** seen in modern games:
- **Minimal glass** + **solid accent regions** (Portal 2: blue/orange glass with solid tabs)
- **Diegetic UI** - UI elements appear to exist in the world (HUD as hologram within the scene)
- **Separation of concerns** - clearly separate "world view" from "menu space"
- **Glow/neon** for interactive elements (Cyberpunk, Outer Wilds)

**WikiRealms potential**:
- Keep glass HUD but **add solid section headers** (e.g., "Search" label in solid accent color above search input)
- **Glow borders on interactive elements** to indicate clickability
- **Color-coded regions** (search=accent-blue, nav=accent-warm, info=neutral)
- **Depth layering** - panels in foreground should be more opaque than background

---

## Part 3: Library vs. Custom Approach Evaluation

### 3.1 Vuetify / Material-UI Approach

**Pros**:
- Components are pre-built (buttons, menus, modals, etc.)
- Responsive design included
- Accessibility checked
- Theming system built-in
- Saves development time

**Cons**:
- **Bundle size** ~100KB (compresses to ~30KB), plus Material Design Icons
- **Design system conflict** - Material is designed for business apps, not games
- **Customization overhead** - game UI needs highly specialized layouts
  - Example: Material modals are center-aligned (document-centric), but games need contextual positioning
  - Example: Material buttons are flat/card-based, games need glowing/neon buttons
- **Three.js integration gap** - Vuetify expects DOM, not canvas overlays
- **Overkill for current needs** - we only have ~6 components; library is designed for large enterprise apps
- **Theming mismatch** - Color tokens don't align with our cosmic/game aesthetic

**Verdict**: Vuetify adds more complexity than value for a specialized game UI.

### 3.2 Custom Design System Approach

**Pros**:
- **Total control** over layout, theme, responsive behavior
- **Minimal bundle size** - only what we need
- **Aligned with game aesthetics** - neon glow, diegetic UI, immersive layouts
- **Faster iteration** - no fighting framework conventions
- **Specialized patterns** - can build portal-confirmation-as-whirlpool, history-as-breadcrumb, etc.

**Cons**:
- **More design work upfront** - must define system comprehensively
- **More code** - buttons, modals, menus are not pre-built
- **Accessibility overhead** - must manually ensure ARIA, focus states, keyboard nav
- **Responsive design is manual** - no breakpoint system built-in

**Verdict**: Custom approach is **optimal for this project**. We're not a business app; we're a game. The effort to design a cohesive system is less than fighting Vuetify's defaults.

---

## Part 4: Proposed Design System

### 4.1 Information Hierarchy & Layout Grid

**Redesigned layout architecture** (mobile-first):

```
MOBILE (portrait, <768px):
┌─────────────────┐
│     TOP BAR     │  (Logo, Menu toggle, Help)
├─────────────────┤
│   WORLD VIEW    │  (Full bleed 3D/2D canvas)
│  (immersive)    │
│                 │
│                 │
│                 │
├─────────────────┤
│  SEARCH/ACTION  │  (Bottom sheet, swipeable)
│  OR MODAL       │
└─────────────────┘

TABLET (landscape, 768px-1200px):
┌──────────────────────────────────────────┐
│ LOGO │ SEARCH INPUT │ [Nav Buttons] │    │
├────────────────────────────────────────────┤
│                                            │
│           WORLD VIEW (centered)            │
│          (immersive 3D/2D canvas)          │
│                                            │
├─────────────────┬──────────────────────────┤
│ INFO PANEL      │ PORTAL CONFIRM / STATUS  │
│ (Left sidebar)  │ (Right sidebar)          │
└─────────────────┴──────────────────────────┘

DESKTOP (wide, >1200px):
┌──────────────────────────────────────────────┐
│ LOGO │ SEARCH INPUT │ [Nav Buttons] │ HELP │
├──────────────────────────────────────────────┤
│          │                          │        │
│  INFO    │   WORLD VIEW (hero)     │ PORTAL │
│  PANEL   │   (immersive 3D/2D)     │ CONFIRM│
│  (left)  │                          │ (right)│
│          │                          │        │
└──────────────────────────────────────────────┘
```

### 4.2 Visual Hierarchy / Panel Types

**New panel classification**:

| Type | Usage | Treatment | Priority |
|------|-------|-----------|----------|
| **Accent Panels** | Critical actions (search, portal confirm) | Solid accent bg + glass overlay + glow | HIGH |
| **Information Panels** | Article context, history | Translucent glass, lower opacity | MEDIUM |
| **Control Panels** | Settings, view toggle, navigation | Minimal, icon-focused | MEDIUM |
| **Modal Overlays** | Confirmations, help, fullscreen modals | Centered, high-contrast backdrop | LOW (modal) |

### 4.3 Color & Visual Tokens

```css
:root {
  /* Existing cosmic theme - KEEP */
  --bg-void: #05060f;
  --bg-deep: #0b0e1e;
  --accent: #7fdfff;
  --accent-warm: #ffd27f;

  /* NEW: Panel & Component Tokens */
  --panel-primary: rgba(18, 22, 40, 0.85); /* Higher opacity for primary actions */
  --panel-secondary: rgba(18, 22, 40, 0.65); /* Existing info panels */
  --panel-border: rgba(127, 223, 255, 0.3); /* Increased from 0.28 for visibility */
  
  /* NEW: Text Tokens */
  --text-primary: #eef0ff; /* Keep existing */
  --text-secondary: #b8c1e1; /* Better contrast, ~4.5:1 on deep bg */
  --text-muted: #7a85b1; /* Better than #9aa3c7 (~3.5:1) */
  
  /* NEW: Interactive Feedback */
  --glow-accent: drop-shadow(0 0 8px rgba(127, 223, 255, 0.6));
  --glow-warm: drop-shadow(0 0 8px rgba(255, 210, 127, 0.5));
  --glow-danger: drop-shadow(0 0 6px rgba(255, 120, 120, 0.6));
  
  /* NEW: Spacing & Sizing Scale */
  --size-touch: 3rem; /* 48px minimum touch target */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
}
```

### 4.4 Component Patterns

#### 4.4a Button States

```
PRIMARY (call-to-action)
- Default: solid accent bg, no border
- Hover: brighter accent, glow
- Active: darker accent, no glow
- Disabled: muted gray, no glow

SECONDARY (less critical)
- Default: transparent, 1px accent border, no glow
- Hover: faint accent bg, glow
- Active: solid accent bg, no glow
- Disabled: muted border, no glow

ICON-ONLY (toolbar buttons)
- Default: 44px square, icon centered
- Hover: faint bg highlight, glow
- Active: accent bg, glow
- Disabled: muted icon
```

#### 4.4b Modal Patterns

**Desktop**:
- Centered on screen, ~60vw wide, max 600px
- Backdrop: 60% opaque black with backdrop-filter blur
- Modal: solid panel bg + thin accent border + subtle glow

**Mobile**:
- Bottom sheet (slide up from bottom)
- Full width, ~80% viewport height max
- Can dismiss via swipe-down or close button
- Rounded top corners

#### 4.4c Panel Positioning

**Top Bar**:
```
[Logo/Menu] [Search Input] [Help] [View Toggle] [Settings]
```
- Sticky at top across all screen sizes
- Compact on mobile, expanded on desktop

**Left Sidebar** (Tablet+):
```
ARTICLE INFO
─────────────
Title
Revision ID
Categories
...
```
- Collapsible on tablet
- Hidden on mobile (bottom sheet instead)

**Right Sidebar** (Desktop only):
```
PORTAL CONFIRM
─────────────
Go to [Article Name]?
[Cancel] [Confirm]
```

**Bottom Sheet** (Mobile):
- Search input (slides up on focus)
- Article info accordion
- Navigation history

---

## Part 5: Specific Improvements Needed

### 5.1 Search UX

**Current**:
- Dropdown results below input
- Close on selection ✓
- No visual "loading" distinction ✓

**Proposed**:
- Larger input field with icon prefix (magnifying glass)
- Dropdown with recent searches + current results
- Mobile: full-width bottom sheet instead
- Keyboard: Escape to close, Up/Down arrows to navigate, Enter to select
- Accessibility: proper ARIA labels, announcements for result count

### 5.2 Article Info Panel

**Current**:
- Vertical `<dl>` list
- Truncated text
- Hard to scan

**Proposed**:
- Card-style layout with icon labels
- Collapsible sections (Summary, Categories, Sections, Links)
- On mobile: expandable accordion or bottom sheet
- Readable line-height and font size
- "Copy link" button for sharing

### 5.3 Portal Confirmation

**Current**:
- Small centered modal
- Generic button styling
- Easy to miss on 3D

**Proposed**:
- Larger, more prominent modal
- "Go to [Article Name]?" with article thumbnail/preview
- Primary button (accent-colored "Go →") visually prominent
- Secondary button (outlined "Cancel")
- Mobile: bottom sheet with thumb-friendly button size

### 5.4 Navigation History

**Current**:
- Hidden in code (App.vue refs)
- Only accessible via back/forward buttons
- No visual indication of history

**Proposed**:
- Breadcrumb trail showing: `Start › Article 1 › Article 2 › (current)`
- Clickable breadcrumbs to jump back
- Mobile: hamburger menu with history list
- Keyboard: Alt+Left/Right for back/forward

### 5.5 Settings/Preferences

**Current**:
- SettingsModal.vue exists but unclear what it contains
- No info on what's configurable

**Proposed**:
- Toggle 3D/2D view mode
- Toggle HUD visibility (H key)
- Audio on/off (future: ambient sounds)
- Performance settings (LOD, particle count, etc. - future)
- Export/Import snapshot
- About / Help links

### 5.6 Mobile Responsiveness

**Current**:
- Undocumented; likely broken

**Proposed**:
- Breakpoints: 320px (small phone), 768px (tablet), 1200px (desktop)
- Touch targets: 48px minimum
- Landscape: compress vertical, expand horizontal
- Hide secondary panels below 768px
- Full-bleed world view on mobile

---

## Part 6: Implementation Roadmap

### Phase 1: Design System Foundation (Week 1-2)
- [ ] Finalize color tokens & contrast ratios
- [ ] Create component patterns (buttons, inputs, cards, modals)
- [ ] Design responsive grid / breakpoint system
- [ ] Accessibility audit (WCAG 2.1 AA checklist)

### Phase 2: Core Navigation (Week 3)
- [ ] Redesign top bar (logo, search, nav buttons, menu)
- [ ] Refactor SearchBar.vue with new styling
- [ ] Add mobile hamburger menu
- [ ] Keyboard navigation (Tab, Enter, Escape, Arrow keys)

### Phase 3: Information Panels (Week 4)
- [ ] Redesign article info panel (collapsible cards)
- [ ] Implement breadcrumb trail for history
- [ ] Mobile bottom sheet for article info
- [ ] Portal confirmation modal redesign

### Phase 4: Polish & Responsive (Week 5)
- [ ] Responsive testing across breakpoints
- [ ] Visual refinements (glows, colors, animations)
- [ ] Accessibility testing (screen readers, keyboard nav)
- [ ] Performance optimization (bundle size check)

### Phase 5: Advanced Patterns (Future)
- [ ] Context menus on world elements
- [ ] Settings modal full implementation
- [ ] Tutorial / onboarding flow
- [ ] Toast notifications
- [ ] Minimap / world overview

---

## Part 7: Conclusion & Recommendation

### Decision: Custom Design System (NOT Vuetify)

**Reasoning**:
1. **Specialization**: Game UIs require unique layouts; general libraries don't fit
2. **Bundle size**: Custom approach lighter than Vuetify + customization
3. **Design intent**: Cosmic immersive aesthetic incompatible with Material Design
4. **Iteration speed**: Custom system allows rapid tweaks without framework constraints

### Immediate Actions:
1. **Create `design-tokens.css`** - centralized color, spacing, sizing variables
2. **Create base components** - Button.vue, Card.vue, Modal.vue, Sheet.vue
3. **Update existing components** - SearchBar, InfoHub, SettingsModal to use new system
4. **Implement responsive layout** - CSS Grid + breakpoint variables
5. **Accessibility pass** - WCAG 2.1 AA checklist, keyboard nav, ARIA

### Success Criteria:
- [ ] WCAG 2.1 AA compliance (contrast, keyboard nav, screen reader)
- [ ] Mobile responsive (tested at 320px, 768px, 1200px+)
- [ ] Game-like aesthetics (glow, neon, immersive)
- [ ] 170+ tests passing (no regression)
- [ ] Bundle size <120KB (with three.js lazy load)

---

## Appendix: Game UI References

**Games with great mobile game UIs**:
- **Outer Wilds** - minimal HUD, diegetic UI (ship computer)
- **Portal 2** - glass UI with clear affordances, solid accent regions
- **Halo** - iconic minimal HUD design
- **Stardew Valley** - mobile bottom-sheet menu pattern
- **Minecraft** - minimal immersive world, pause menu for interaction

**Design resources**:
- "The Art of Game UI Design" - David Lightbown
- GDC talks on UI design for games
- Apple HIG (Human Interface Guidelines) - mobile patterns
- Material Design - but study to contrast against
