# Initial MVP Implementation Plan

**Date:** 2026-08-31  
**Version:** 1.0  
**Based on:** `docs/prd.md`

## Purpose

This document breaks the WikiRealms MVP PRD into an actionable implementation plan for the first build stage. The intent is to deliver the smallest usable version of the product while preserving a clean architecture for future iteration.

## MVP summary

The MVP is an English-only Wikipedia explorer where users can:

- search for an article by title
- select a result
- generate a deterministic world from that article
- scroll and examine the terrain in the browser
- traverse portals to linked articles
- preserve back/forward history
- export and import session state as JSON

## Implementation principles

- Keep generation isolated from fetching and UI
- Keep session state in memory first
- Make the world deterministic and reproducible
- Prefer simple structures that can evolve naturally
- Avoid building features that are not needed for the MVP
- Any engine-related action or generalized frontend behavior must have useful tests
- Tests should verify behavior and determinism, not merely mirror interfaces
- Relevant changes are not complete until the useful tests pass

## Milestone 1: Project setup

### Goals

Establish the app foundation, repository structure, and basic conventions.

### Tasks

- Scaffold the Vue application
- Add Netlify-friendly project configuration
- Define the initial folder structure
- Add shared types and domain module placeholders
- Add basic app shell and layout structure
- Ensure docs are organized and discoverable

### Deliverables

- Running Vue app
- Basic landing shell
- Initial directories for core, engine, adapters, ui, and docs

### Acceptance criteria

- The app starts locally without errors
- The repository structure supports future module separation
- The initial documentation is in place and referenced clearly

## Milestone 2: Wikipedia title search

### Goals

Allow users to search for English Wikipedia articles by title.

### Tasks

- Integrate the Wikipedia search API
- Add autocomplete/search suggestions as the user types
- Support selection from the results list
- Handle loading, empty, and error states
- Add useful tests for search behavior and shared search logic

### Deliverables

- Search input with live suggestions
- Search result selection flow

### Acceptance criteria

- Typing partial text such as `Ein` returns relevant suggestions like `Albert Einstein`
- Selecting a result advances the app to article loading/generation
- Search works for English Wikipedia only in MVP
- Search logic is covered by useful tests

## Milestone 3: Article fetch and normalization

### Goals

Fetch the selected article and normalize the data required by the app.

### Tasks

- Fetch article data for the selected title
- Resolve article identity and latest revision information
- Normalize article data into the app’s `Article` model
- Store the minimum article fields needed for MVP
- Add useful tests for article normalization and revision handling

### Deliverables

- Article fetch adapter
- Normalized article object
- Basic article context data available to the rest of the app

### Acceptance criteria

- The app can retrieve the selected article reliably
- The UI can display the article title and basic context
- The article record retains latest revision information
- Article normalization and revision logic are covered by useful tests

## Milestone 4: World generation v1

### Goals

Generate a deterministic world from the article and its revision.

### Tasks

- Define the world generation input contract
- Build a seed derivation strategy
- Implement a first-pass terrain generator
- Generate portals from outbound links
- Version the generator so it can evolve later
- Add useful tests for determinism, seed derivation, and portal generation behavior

### Deliverables

- Generation engine v1
- `World` object with `articleId`, `revisionId`, `engineVersion`, and generated terrain/portal data

### Acceptance criteria

- The same article/revision/engine version produces the same world
- Generated worlds can be cached and reloaded in-session
- Portal generation is decoupled from rendering logic
- World generation logic is covered by useful tests

## Milestone 5: World rendering and exploration

### Goals

Render the world in a browser and allow the user to examine it.

### Tasks

- Build the world view
- Allow scrolling and panning/exploration
- Render terrain at a high level first
- Show portals visually in the world
- Show article title and basic article details in the UI
- Add useful tests for generalized composables and shared presentation logic

### Deliverables

- Exploratory world view
- Basic article context panel or header
- Portal visualization

### Acceptance criteria

- The user can see a world after selecting an article
- The user can scroll or pan to inspect the terrain
- The article title is visible in the UI
- Some basic article detail is visible in the UI beyond just the title
- Generalized frontend logic is covered by useful tests

## Milestone 6: Traversal and history

### Goals

Allow navigation between worlds and preserve traversal history.

### Tasks

- Make portals clickable
- Traverse from one article/world to another
- Track backstack and forwardstack
- Preserve the current traversal state in memory
- Support return navigation even when the article does not explicitly link back, via history
- Add useful tests for traversal behavior and state transitions

### Deliverables

- Navigation state model
- Portal traversal behavior
- Back and forward controls or equivalent behavior

### Acceptance criteria

- Clicking a portal navigates to the target world
- The user can go back and forward within the session
- Traversal history persists while the session is active
- Traversal logic is covered by useful tests

## Milestone 7: Snapshot export/import

### Goals

Make session state portable.

### Tasks

- Define the snapshot serialization format
- Export session state to JSON
- Import session state from JSON
- Store session snapshots in `localStorage` if appropriate
- Validate basic compatibility/versioning
- Add useful tests for snapshot serialization and restoration behavior

### Deliverables

- Snapshot schema implementation
- Export/import UI or controls

### Acceptance criteria

- The current session can be exported as JSON
- A saved snapshot can be restored
- The restored session matches the prior navigation state closely enough for continuity
- Snapshot logic is covered by useful tests

## Milestone 8: MVP polish

### Goals

Add the small improvements needed to make the MVP usable and understandable.

### Tasks

- Improve loading states
- Improve error states
- Add empty states
- Add minimal visual polish
- Add a stale-world indicator if practical without delaying the MVP
- Improve clarity of the article context panel

### Deliverables

- More polished MVP experience
- Basic UX cleanup

### Acceptance criteria

- The app is usable without major ambiguity
- Common failure and empty states are handled gracefully
- The experience feels coherent enough for early testing

## Explicit out of scope for MVP

- User accounts
- Database-backed persistence
- Multiplayer or collaboration
- Advanced 3D rendering
- Sophisticated semantic generation or embeddings
- Multi-language Wikipedia support
- Long-lived backend services unless later required

## Dependencies and sequencing

Recommended order:

1. Project setup
2. Title search
3. Article fetch and normalization
4. World generation v1
5. Rendering and exploration
6. Traversal and history
7. Snapshot export/import
8. Polish

This order keeps the app vertically sliceable and avoids overcommitting to generation details before the user flow is proven.

## Open questions for later iteration

- Which exact article fields should feed generation beyond the MVP minimum?
- How should portals be prioritized or filtered if an article has many links?
- What should the default high-level terrain visualization look like?
- How should stale worlds be surfaced to users after the MVP?
- When, if ever, should cached worlds become persistent beyond the session?
