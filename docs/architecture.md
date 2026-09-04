# Architecture

## Overview

WikiRealms should be organized around three major domains:

1. **Fetching / article graph engine**
2. **Procedural generation engine**
3. **UI / presentation layer**

These domains should remain decoupled so that each can evolve independently.

## Domain responsibilities

### 1. Fetching / article graph engine
Responsible for:
- resolving Wikipedia article identity
- fetching article metadata and link data
- obtaining revision information
- normalizing article records
- exposing traversal/navigation operations

This layer should not know how worlds are rendered or generated.

### 2. Procedural generation engine
Responsible for:
- deriving deterministic seeds
- converting the article section tree into terrain peaks and citation-driven
	land biomes
- generating worlds, biomes, landmarks, and portals
- versioning the generation algorithm

This layer should not know about the UI or network fetching.

### 3. UI / presentation layer
Responsible for:
- displaying the generated world
- rendering 2D and Three.js 3D terrain views from the same world data
- showing portal and section-beacon interactions
- presenting section and citation context on hover
- visualizing history and article context
- handling user input and navigation actions

This layer should only consume state and emit actions.

## Proposed modular structure

- `core/` — pure domain logic and types
- `engine/` — generation and navigation logic
- `adapters/` — Wikipedia API, persistence, Netlify/serverless integration
- `ui/` — Vue frontend
- `docs/` — design and implementation notes

## Versioning model

A world should be derived from:

- article identity
- article revision identity
- generation engine version

This allows old worlds to remain reproducible even as article content and generator behavior evolve.

## State model

The project should maintain an in-memory session state that includes:

- current article/world
- backstack / forwardstack
- visited worlds
- cached article metadata
- cached generation outputs
- UI state such as camera position or selected portal

This state should be serializable to a portable JSON snapshot.

## Hosting assumption

The initial target is Netlify.

That suggests:
- a static frontend deployment
- optional serverless functions for lightweight fetching or caching
- a preference for client-side session state at first

If the app later needs more durable in-memory caching or a long-lived backend process, the architecture should allow that shift without rewriting the core engine.
