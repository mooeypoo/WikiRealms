# WikiRealms

A private prototype for a procedural Wikipedia-to-world exploration web app.

## Concept

WikiRealms turns Wikipedia articles into deterministic procedural worlds. Each article becomes its own navigable realm, and Wikipedia links become portals between worlds while preserving traversal history.

The goal is to explore knowledge as a landscape.

## Core goals

- Deterministic world generation from Wikipedia article data
- Clear separation between fetching, generation, and UI
- In-memory session state with export/import support
- Serverless-friendly architecture to start, with room to grow
- Versioned generation so worlds remain reproducible over time

## Versioning model

WikiRealms treats Wikipedia content versioning and procedural generation versioning as separate concerns:

- **Article versioning** is based on Wikipedia revisions
- **World generation versioning** is based on the engine version

A world is generated from a specific article revision and an engine version, making it reproducible and comparable over time.

## Planned docs

- `docs/vision.md`
- `docs/architecture.md`
- `docs/model.md`
- `docs/generation.md`
- `docs/snapshot-format.md`
- `docs/roadmap.md`

## Stack

- Frontend: Vue
- Runtime: JavaScript / Node.js-compatible tooling
- Deployment target: Netlify

## Status

Initial implementation underway. Project scaffold and Wikipedia title search (Milestones 1–2) are in place.

## Getting started

```bash
npm install
npm run dev    # start the dev server
npm run build  # production build
npm test       # run the test suite (vitest)
```

## Project structure

- `src/core/` — pure domain logic (e.g. search result normalization)
- `src/adapters/` — external integrations (Wikipedia API, etc.)
- `src/engine/` — world generation and navigation logic (future)
- `src/ui/` — Vue components and composables
- `tests/` — test suite, mirroring the `src/` structure (kept separate so `src/` can ship cleanly)
