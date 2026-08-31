# Generation

## Goal

The generation engine should turn Wikipedia article data into a deterministic world.

## Versioning

Generation must be versioned independently from Wikipedia content.

Recommended world key inputs:

- article identity
- article revision identity
- generation engine version

Example conceptual form:

```text
worldKey = hash(articleIdentity + revisionIdentity + engineVersion)
```

## Feature vector idea

The generator can use article features as input signals, for example:

### Identity features
- title
- canonical page ID
- language edition
- namespace

### Content features
- summary length
- number of sections
- number of images
- presence of a primary image
- outbound link count
- revision date
- revision size

### Semantic features
- categories
- article type or topic class
- concreteness vs abstractness
- domain or subject area

### Graph features
- link density
- neighborhood similarity
- centrality / prominence

### Popularity features
- pageviews
- relative attention or traffic signals

## Output mapping ideas

Feature signals may influence:

- island size
- terrain roughness
- water ratio
- biome distribution
- landmark density
- portal count and placement
- color palette
- ambient visual style

## Generation pipeline

1. Normalize article identity
2. Fetch metadata and content features
3. Derive deterministic seed material
4. Generate terrain and biome structure
5. Place portals and landmarks
6. Assemble final world model

## Design notes

- Prefer pure functions where possible
- Keep random generation deterministic from the seed
- Make it easy to swap or version individual generation rules
- Preserve enough metadata to explain how a world was produced

## Open questions

- Which article features should matter most?
- Should generation rely more on identity, content, or graph context?
- How much of the generation should be semantic vs purely structural?
- Should portals be generated for every link or only a curated subset?
