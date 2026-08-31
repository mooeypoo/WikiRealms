# Product Requirements Document (PRD)

## Product name

WikiRealms

## Overview

WikiRealms is a browser-based exploration experience that turns Wikipedia articles into procedurally generated worlds. Each article becomes a navigable terrain, and article links become portals that let users move between worlds while preserving traversal history.

The initial version focuses on English Wikipedia only and prioritizes a simple, deterministic, single-user experience.

## Problem statement

Wikipedia is one of the largest knowledge graphs in existence, but it is typically consumed as a flat sequence of pages and links. WikiRealms reframes that experience as exploration: a user should be able to enter an article, land in a generated world, and traverse related knowledge as if moving through a landscape.

## Goals

### Primary goals

- Allow users to search for Wikipedia articles by title
- Generate a deterministic world from a selected article
- Render the world in a browser in a way that can be explored by scrolling/panning
- Expose article links as portals between worlds
- Preserve traversal history so users can move back and forward through their path
- Keep the architecture modular so generation, fetching, and UI are decoupled

### Secondary goals

- Make the world reproducible from a specific Wikipedia revision and generator version
- Support in-memory session state with export/import capability
- Keep the system serverless-friendly and Netlify-friendly for the first implementation

## Target users

- Curious Wikipedia readers
- Explorers who enjoy graph/navigation-based experiences
- Users who want an alternative, visual way to browse knowledge

## MVP scope

### Must-have

#### Article search and selection
- English Wikipedia only for v1
- Title search/autocomplete powered by the Wikipedia search API
- Users can type partial titles and receive matching suggestions
- User can select an article from search results

#### World generation and rendering
- Fetch the selected article data
- Generate a deterministic world for that article
- Render the world in the browser
- Allow the user to scroll and examine the terrain
- Present the world at a high level first; advanced 3D is not required for MVP

#### Navigation
- Render portals to linked articles
- Allow traversal from one world to another
- Preserve back/forward navigation history during the session

#### Article context in UI
- Show the article title in the UI
- Show at least one basic article detail area so the user knows what world they are in

#### Session behavior
- Store state in memory for the active session
- Support export/import of session state as JSON
- Avoid a database in the first version

#### Testing discipline
- Any engine-related action must have useful tests
- Frontend elements should have tests, especially generalized composables
- Tests must verify behavior and deterministic outcomes, not just repeat interfaces
- Relevant implementation work is not complete until the useful tests pass

### Nice-to-have

- Article summary
- Primary image
- Pageviews
- Categories
- Section count
- Visited portal highlighting
- Breadcrumb or path trail
- Snapshot download/upload UI
- Stale-world indicator when the source revision changes
- Minimap or overview panel
- Richer terrain styling
- Cached recently visited worlds
- Cached nearby article metadata

## Non-goals

- User accounts
- Persistent database
- Multiplayer or collaborative sessions
- Social features
- Advanced 3D world rendering in MVP
- Advanced semantic AI/embedding-based generation in MVP
- Full Wikipedia language support in v1
- A long-lived backend service unless it becomes necessary later

## Core user flow

1. User lands on the app.
2. User searches for a Wikipedia article by title.
3. User selects a result.
4. The app fetches the article data.
5. The app generates a deterministic world.
6. The app renders the world.
7. User scrolls/pans to explore the terrain.
8. User clicks a portal to travel to another article/world.
9. The app preserves traversal history so the user can go back or forward.

## Functional requirements

### Search
- Search must use Wikipedia’s search API
- Search results should update as the user types
- Search should be responsive enough for a fluid title-selection experience

### Article data
- The app must fetch enough article data to identify the article and build its initial world
- The UI must show the article title at minimum
- The UI must show some basic article details beyond the title

### World generation
- The world must be generated deterministically from article and revision data plus engine version
- The generator must be isolated from fetching and UI logic
- Worlds should be reproducible later from the same inputs

### Navigation and portals
- Portals must represent outbound traversal options from the current article/world
- The user must be able to move between articles/worlds
- Traversal history must preserve visited order and allow back/forward behavior

### Session and export
- Session state must live in memory for the active session
- The app must be able to serialize and restore a session snapshot
- Exported snapshots should be portable JSON

### Testing
- Engine/domain logic must have useful tests for deterministic behavior and state transitions
- Shared frontend logic and generalized composables must have tests
- Tests should verify behavior, not merely duplicate implementation interfaces
- Changes affecting generation, traversal, or session behavior should be covered by relevant tests

## Technical constraints

- Frontend: Vue
- Initial hosting target: Netlify
- Initial architecture should be serverless-friendly
- No database for the first version
- English Wikipedia only at launch

## Success criteria

The MVP is successful if a user can:
- search for an article
- select it
- see a generated world
- explore that world visually
- traverse to related worlds via portals
- return using traversal history
- preserve and reload session state via snapshot export/import

## Open questions

- Which article fields should be fetched for the first-generation algorithm?
- How many portals should be surfaced initially per world?
- What is the right balance between article-derived content and generation-derived aesthetics?
- How should stale worlds be presented to the user?
- How much of the session should be required for import/export versus regenerated on load?
