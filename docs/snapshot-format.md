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
  "schemaVersion": "3.0",
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

The journey: a graph of realms, plus the order you moved between them.

```json
"navigation": {
  "graph": {
    "realms": {
      "r:Saturn": { "id": "r:Saturn", "title": "Saturn", "order": 1 },
      "r:Titan":  { "id": "r:Titan",  "title": "Titan",  "order": 2 }
    },
    "edges": [{ "from": "r:Saturn", "to": "r:Titan" }],
    "history": ["r:Saturn", "r:Titan"],
    "cursor": 1,
    "nextOrder": 3
  }
}
```

A realm's identity is its title, because that is what determines the world:
`worldId` derives from articleId, revision and engine version, so reaching an
article twice generates the byte-identical world. Two arrivals are one place.

There are two structures here, which is the split a browser makes. The GRAPH
records where you have been and how those places connect — cycles are ordinary,
since `Spacetime → Template talk → Physics → Spacetime` is a perfectly normal
afternoon. The HISTORY records the order you moved, which is what back and
forward walk; a graph has no unique "previous", a history does.

An `edge` means a portal was actually taken. A jump — a search, a shared link —
adds a realm but no edge, because claiming a connection that does not exist
would put a road on the map where there is none.

Schema 2.0 stored a tree of ARRIVALS: one node per visit, merged only when a
realm was re-entered from the same parent. That duplicated a realm reached by
two routes and could not represent a loop at all. Schema 1.0 stored `current`,
`backstack` and `forwardstack`. Both are still read: 2.0 merges its nodes by
title and turns parent links into edges, and 1.0 replays its flat history.

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
