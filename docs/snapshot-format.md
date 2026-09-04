# Snapshot Format

## Purpose

WikiRealms should support portable session state so a user can:

- reload the current experience later
- store the state in `localStorage`
- export the state as a JSON file
- import and reuse a snapshot later
- potentially share the snapshot with others

## Goals

- No database required for the first version
- Simple and explicit schema
- Forward-compatible versioning
- Easy to serialize and deserialize

## Suggested top-level structure

```json
{
  "schemaVersion": "2.0",
  "createdAt": "2026-08-31T12:00:00Z",
  "appVersion": "0.1.0",
  "engineVersion": "gen-v1",
  "worlds": {},
  "navigation": {},
  "articleCache": {},
  "generationCache": {},
  "uiState": {}
}
```

## Sections

### `worlds`
Generated world outputs keyed by world identity.

### `navigation`
The journey, as a visit graph:

```json
"navigation": {
  "graph": {
    "nodes": {
      "n1": { "id": "n1", "title": "Saturn", "parentId": null, "lastChildId": "n2" },
      "n2": { "id": "n2", "title": "Titan", "parentId": "n1", "lastChildId": null }
    },
    "rootIds": ["n1"],
    "currentId": "n2",
    "nextId": 3
  }
}
```

A node is one ARRIVAL, not one article: reaching the same title by two
different routes makes two nodes, because they are two different places in
the journey. `lastChildId` is the branch the viewer last descended, which is
what "forward" means when a node has several children.

Schema 1.0 stored `current`, `backstack` and `forwardstack` instead. Those
two flat stacks could not represent a journey that branched — going back and
taking a different portal discarded the abandoned branch outright. A 1.0
snapshot is still read, and migrates to a single unbranched journey, which is
exactly what it recorded.

### `articleCache`
Fetched article metadata, revision information, and normalized article records.

### `generationCache`
Intermediate seeds or generation artifacts that help reproduce a world.

### `uiState`
Camera position, zoom, view mode, selected portal, and other presentation-only state.

## Storage targets

The same structure should be usable for:

- browser `localStorage`
- downloaded `.json` files
- imported snapshots
- future persistence mechanisms if needed

## Compatibility rules

- Increment `schemaVersion` when the snapshot structure changes in a breaking way
- Keep `appVersion` and `engineVersion` separate from schema version
- Treat old snapshots as data migrations rather than one-off special cases

## Open questions

- Which cached data should be considered essential vs disposable?
- Should the snapshot store raw Wikipedia payloads or normalized article records only?
- How much of the generated world should be re-derived on import?
