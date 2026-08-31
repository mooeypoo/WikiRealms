# Domain Model

## Overview

This document defines the core objects for WikiRealms and the responsibilities of each.

The model is intentionally split between:

- source Wikipedia data
- generated world data
- traversal/session state
- portable snapshot state

## Core objects

### Article
A normalized representation of a Wikipedia article.

Purpose:
- represent the current page conceptually
- expose the latest known revision
- provide features used for generation and navigation

Suggested fields:
- `articleId`
- `title`
- `language`
- `pageId`
- `url`
- `namespace`
- `latestRevisionId`
- `latestRevisionTimestamp`
- `summary`
- `categories`
- `links`
- `images`
- `pageviews`
- `sectionCount`

### Revision
An immutable Wikipedia revision.

Purpose:
- represent a specific version of an article
- serve as a stable input to world generation

Suggested fields:
- `revisionId`
- `articleId`
- `timestamp`
- `contentHash` optional
- `summary`
- `metadata`

### World
A generated instance of an article/revision pair.

Purpose:
- represent the procedural terrain and its navigable features
- stay reproducible across time
- carry the revision it was generated from so staleness can be detected

Suggested fields:
- `worldId`
- `articleId`
- `revisionId`
- `engineVersion`
- `seed`
- `generatedAt`
- `terrain`
- `biomes`
- `landmarks`
- `portals`
- `style`

Notes:
- `articleId` and `revisionId` are the source inputs to the world
- the world can be compared against the article’s latest revision to determine whether it is stale

### Portal
An outbound traversal connection owned by a single article/world.

Purpose:
- represent an article-local, one-way connection to another article/world
- support navigation without turning the portal itself into a bidirectional object

Suggested fields:
- `portalId`
- `sourceArticleId`
- `targetArticleId`
- `label`
- `position`
- `origin` (`article-link` or `generated`)
- `visited` optional
- `firstVisitedAt` optional
- `metadata` optional

Notes:
- portals are stored per article and are always outbound from that article’s perspective
- if the target article also links back, it will have its own portal
- return behavior that does not come from article content should be handled by traversal state, not by portal duplication

### TraversalState
The session’s current navigation state.

Purpose:
- preserve the user’s path through worlds
- support back/forward navigation
- record visited transitions

Suggested fields:
- `currentArticleId`
- `currentWorldId`
- `backstack`
- `forwardstack`
- `visitedWorldIds`
- `lastPortalId`
- `routeGraph`

### GenerationContext
The input bundle used to generate a world.

Purpose:
- collect all generation inputs in one place
- keep generation deterministic and testable

Suggested fields:
- `article`
- `revision`
- `engineVersion`
- `featureVector`
- `seedMaterial`

### Snapshot
Portable serializable session state.

Purpose:
- store and restore the app without a database
- support `localStorage`, downloadable JSON, and sharing

Suggested fields:
- `schemaVersion`
- `appVersion`
- `engineVersion`
- `createdAt`
- `articles`
- `revisions`
- `worlds`
- `traversal`
- `uiState`
- `caches`

## Naming rules

- Use `articleId` and `revisionId` directly in `World`
- Avoid extra `source...` prefixes in the `World` object unless a new distinction is needed later
- Keep portals article-local and outbound-only
- Keep traversal behavior in session state, not in the portal object itself

## Open questions

- How much of the article record should be cached in snapshots?
- Which portal metadata is essential vs derived?
- How should route graphs be stored if traversal analytics become important later?
