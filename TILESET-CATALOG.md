# Tileset Identification Harness

RPG Maker XP stores tile IDs and engine behavior, not creator-facing meaning.
Priority and passability can suggest how a tile behaves, but they cannot prove
that a graphic is a fence, window, roof edge, tree part, or standalone prop.

The catalog workflow keeps three kinds of information separate:

1. **Engine facts** are generated from `Tilesets.rxdata` and the source PNG:
   tile ID, row/column, priority, passage flags, bush/counter flags, alpha
   coverage, alpha bounds, and edge coverage.
2. **Visual evidence** preserves source adjacency: the unmodified full sheet, a
   labeled full sheet with burned-in tile IDs, exact source rows, isolated tiles
   on transparency, and autotile source graphics.
3. **Creator semantics** are reviewed claims: label, category, intended use,
   placement mode, recommended layer, multi-tile object membership, evidence,
   and confidence.

## Workflow

1. Run `create_tileset_identification_harness` for the map's tileset ID.
2. Open the returned `index.html` review page. Give models
   `source-labeled.png`, where IDs are attached to their cells; `source.png`
   remains the unmodified visual evidence.
3. Inspect the full labeled sheet before the isolated tile. Nearby tiles often reveal
   that an apparent prop is one row of a larger object or a visual variant.
4. Ctrl-click tiles that form one rectangular object and create an object grid.
5. Record semantics. Use `confirmed` only after checking the source sheet,
   source row, isolated tile, and engine facts.
6. Export the catalog JSON and pass it as `catalog` to
   `save_tileset_catalog`, or save incremental `entries`, `objects`, and
   `autotiles` arrays.
7. Run `validate_tileset_catalog`. Use `strict: true` when a tileset is intended
   to drive automatic map authoring.

## Agent-assisted review

For a new tileset, use staged model roles instead of one model making and
approving its own claims:

1. Give two inexpensive visual reviewers `source-labeled.png`, row images, and
   isolated tiles. Keep their proposals independent.
2. Give a separate inexpensive reviewer only `manifest.json` and engine facts.
   It should identify blank cells, priority groups, transparency risks, and
   mechanical contradictions without guessing semantics.
3. Use a stronger model to adjudicate disagreements against both visual and
   engine evidence. Ambiguous adjacency grammars go to a review queue.
4. Run an inexpensive final critic over the adjudication. It must reject blank
   object cells, numeric `0` gaps, overlapping object membership, invalid
   schema values, unsupported transparent z0 placement, and any claim that is
   simultaneously accepted and queued.
5. Promote only the critic's safe subset to `catalog.json`, then validate it.

Agreement between visual reviewers is useful evidence, not proof. Reviewers can
share the same tile-ID drift when the image does not visibly bind IDs to cells;
the labeled source sheet and engine-only pass are mandatory controls.

Files are stored under `Data/.mcp-tilecatalog/<tileset-id>/` by default. This
keeps the catalog beside the project data without modifying any `.rxdata` file.

## Confidence Rules

- `unknown`: not reviewed.
- `tentative`: plausible from appearance, but adjacency or use is unresolved.
- `likely`: source context and engine facts agree; no in-game confirmation yet.
- `confirmed`: source context, composition, layer behavior, and intended use
  have all been checked.

Unreviewed tiles are unknown. They are never permission to guess.

## Layer Interpretation

- `0`: opaque terrain or floor foundation.
- `1`: priority-0 detail, ground clutter, or transparent overlay over terrain.
- `2`: priority-above-zero overhead material such as canopy or roof pieces.
- `event`: interaction or stateful graphic better represented by an event.

These are recommendations, not deductions. The validator warns about suspicious
combinations such as transparent regular tiles on layer 0, priority-above-zero
tiles on layer 1, or priority-0 tiles on layer 2.

## Multi-Tile Objects

Record the complete object as a 2D tile-ID grid. Preserve source orientation and
use `null` only for a genuinely empty cell inside the object's bounding box.
Do not infer that adjacent rows belong together merely because their colors
match. Windows, fence rails, roof trim, trunks, and wall fragments are commonly
misidentified when viewed without their original sheet context.

Only confirmed catalog entries should be used as semantic inputs for automatic
map composition. `render_tileset_atlas` remains useful as a quick numeric
reference, but it is not a substitute for this review process.
