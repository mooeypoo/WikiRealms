# Vision

## Project summary

WikiRealms is a web app that maps Wikipedia articles into procedurally generated terrains. Each article becomes its own navigable world, and Wikipedia links become portals between worlds.

## Experience goals

- Make Wikipedia feel explorable as a landscape
- Preserve traversal history so users can move forward and back through article paths
- Keep the experience deterministic and replayable
- Start simple, but allow the world model to grow richer over time

## Design principles

### 1. Deterministic by default
A given article revision and engine version should generate the same world every time.

### 2. Separation of concerns
The system should keep fetching, generation, and presentation isolated from one another.

### 3. In-memory first
The first version should avoid databases and persistent user accounts.

### 4. Portable session state
Session state should be representable in a JSON snapshot that can be reloaded locally, saved to `localStorage`, or shared with another user.

### 5. Version everything that matters
Wikipedia revision versioning and procedural generation versioning should both be explicit.

## MVP shape

- Enter a Wikipedia article
- Generate a deterministic terrain for the article
- Show a small set of portals to linked articles
- Allow traversal between worlds
- Preserve back/forward history in session state
- Support export/import of the session snapshot

## Later possibilities

- Better semantic feature extraction
- More advanced terrain generation
- Cached nearby worlds
- Different visual themes or biomes
- Shareable world snapshots
