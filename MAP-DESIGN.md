# Level / Map Design Guide (RPG Maker XP)

**Load this when authoring or editing maps with the MCP.** It codifies the layer
model, tile priority/passability, multi-tile object rules, and composition
principles so generated maps read well and behave correctly in-engine — and so
authoring doesn't drift into the "everything on one layer, objects clipping"
failure mode.

> Companion to `AUTHORING-XP.md` (data-model governance). This doc is the *design*
> layer; the MCP exposes it via the `get_map_design_guide` tool.

---

## 0. Size first — a map is N screens

**Choose the size before anything else, from the map's *purpose*.** RPG Maker
XP's screen is **20×15 tiles** (640×480 ÷ 32px), so a map is really a grid of
*screens*: `screens = ceil(w/20) × ceil(h/15)`. Almost every rule below ("one
focal point + a path", "no bare patch > 5×5", "frame the edges") is a **per-screen**
rule — scale it by the screen count or a big map reads empty.

- **Engine limits:** min **20×15** (one screen, no scrolling), max **500×500**.
  `create_map` clamps to this range (it never blocks).
- **Pass a `purpose`** to `create_map` and it picks a sensible default size and
  returns a **size advisory** (screens, target focal-point count, scatter
  density, oversize warnings). For an existing map call `get_map_size_advisory`.

| Purpose | Default | Sweet spot | Use for |
|---|---|---|---|
| `interior` | 20×15 | 20×15–25×20 | shop, house, small cave — one screen, 1 focal point |
| `room` | 25×20 | 20×15–30×25 | big room / house cluster (1–2 screens) |
| `town` | 40×35 | 30×25–55×45 | plaza focal point + a street network |
| `dungeon` | 45×40 | 30×25–70×60 | rooms + corridors; a focal point per room |
| `region` | 60×50 | 40×35–100×90 | field/wilderness — a few focal points joined by trails |
| `overworld` | 100×90 | 70×60–130×110 | overworld **segment** — landmark + path network |

**Scaling rule:** aim for **~1 focal point per screen-region** and a connecting
**path network** (not a single trail). Scatter density stays constant per area
(~0.04–0.08), so total clutter scales with tile count automatically.

**Don't build one mega-map.** Past ~150 in a dimension the editor lags and large
empties look unfinished — split into screen-sized segments stitched with transfer
events.

## 1. The three tile layers — use all of them

`Map.data` is `Table[w,h,3]`: three z-layers, drawn **z0 → z1 → z2** (bottom to
top). In the RMXP editor these show as **Layer 1 / 2 / 3**. Assign by *role*, not
convenience:

| z (MCP) | Editor | Role | Put here |
|---|---|---|---|
| **0** | Layer 1 | **Terrain** | Ground autotiles (grass, water, dirt/paths), floors — the continuous base. Paint with `apply_autotile`. |
| **1** | Layer 2 | **Ground clutter** | Things resting *on* the ground that the player stands in front of: flowers, bushes, rocks, signs, low fences, item piles. (Tiles with priority 0.) |
| **2** | Layer 3 | **Overhead / tall objects** | Things the player passes *behind*: tree canopies, roofs, cliff tops, bridge tops. (Tiles with priority > 0.) |

**Anti-pattern (what went wrong before):** ground on z0 and *everything else*
(flora + trees) jammed on z1, with z2 unused. That puts tall objects at clutter
level and forces overlaps. Spread by role across all three layers.

## 2. Priority — what makes a tile "overhead"

Priority is a **tileset property** (`priorities` Table, per tile id), *not* a
layer property. A tile with priority *p* is drawn *p* tiles **above the player**,
so the player walks **behind** it; priority 0 draws under the player.

- The atlas (`render_tileset_atlas`) is your reference; check a tile's priority
  before placing it. Tree-canopy and roof tiles have priority > 0 → they belong
  on the **overhead layer (z2)**. Flowers/bushes/floor decals are priority 0 →
  **clutter layer (z1)**.
- Priority handles player occlusion automatically once the tile is on a sensible
  layer; you don't simulate it. (Note: `render_map` composites layers flat and
  does **not** show player-occlusion — open the editor / playtest to verify that.)

## 3. Passability — what blocks movement

Passability is also a tileset property (`passages` Table): bits 1/2/4/8 block
down/left/right/up, 15 = fully blocked. The atlas shows a **red dot** (blocked) /
**orange dot** (partial). Place blockers (walls, water, cliff faces) deliberately;
remember many decorative tiles (even some trees) are *passable* by default — add a
blocking event or edit `passages` if you need hard collision.

## 4. Multi-tile objects (trees, houses, statues) — the clipping rule

Big objects occupy a **bounding box** of tile ids (e.g. the Grassland green tree
is a 4×4 block, ids 424…451). To place one, stamp the whole block with
`set_map_tiles`.

- **Never overlap two objects' bounding boxes on the same layer.** `set_map_tiles`
  overwrites, so an overlapping stamp cuts the previous object — this is exactly
  the clipping you saw. Space landmark objects so their boxes don't intersect
  (a 4-wide tree at x=0 and another at x=5 are clear; x=2 overlaps).
- For *density* (a forest), don't pile big trees — use the smaller bush/hedge
  tiles between spaced landmark trees.
- Put the object on the layer matching its tiles' priority (canopies → z2). A
  whole tree whose tiles are all priority > 0 goes entirely on z2.

## 5. Composition principles

- **A focal point + a journey.** Give the eye a destination (a pond, a shrine, a
  building) and a path that *leads there* — not a path to nowhere.
- **Frame with verticals.** Spaced trees/cliffs at the edges frame the scene and
  hide the map border.
- **Cluster, don't sprinkle.** Flowers and bushes read as *beds* and *thickets*
  when grouped; lone single tiles look like noise.
- **Break up uniformity.** A large flat field is boring — vary ground (patches of
  tall grass, a dirt clearing), add elevation/water, scatter clutter unevenly.
- **Readability over detail.** Keep paths and walkable space clear; decoration
  should accent, not clog, the play area.
- **Edges matter.** Water/cliff/path autotiles carry their own edge art — let
  `apply_autotile` compute them; don't hand-place edge tiles.

## 5b. Craft — the rules that separate a real map from a "programmer map"

A programmer map = big empty same-grass fields, a rectangular pond, trees in one
corner, a straight path to nowhere. Avoid it with concrete rules:

**Shapes — never rectangular nature.** Paint water, lakes, and forest patches
with `apply_autotile`'s **`blob`** (organic ellipse with wobbly edges,
`irregularity` 0.4–0.6), and rivers/custom shapes with **`cells`**. Reserve a
**`region`** rect only for genuinely rectangular things (a building floor). No
straight terrain edge longer than ~3–4 tiles.

**Paths meander and connect.** Use `apply_autotile`'s **`path`** (waypoints +
width ≥ 2) — it walks orthogonally so the trail stays continuous. A path must
start and end at **meaningful** places (an entrance, a building, the water's
edge) — give it a small **clearing** where it arrives. Never straight; never to
nowhere; never width 1 (a 1-wide trail autotiles into a pinched mess).

**Autotile-safe shapes (the tool enforces this).** Autotiles only connect
*orthogonally*, so diagonal-only steps and 1-cell holes render broken/pinched.
`apply_autotile` auto-sanitizes every shape (4-connects diagonal steps, fills
1-cell holes), so `blob`/`path` are always safe. If you build a raw `cells` list
yourself: keep it ≥ 2 wide, 4-connected (no diagonal-only steps), and avoid lone
single cells.

**Density: detail everywhere, with a gradient.** No bare patch of identical
ground larger than ~5×5. Use **`scatter_tiles`** for ambient clutter
(density ~0.04–0.08) across the *whole* map, and raise density toward the focal
point via `focal` + `falloff`. Scatter makes *beds/thickets*; never hand-place
lone tiles in corners.

**One focal point + a journey.** Every map has a focal point (a pond, a landmark
tree, a shrine, a building). Lead the path to it and let detail density rise as
you approach it.

**Frame the edges.** Line map borders with spaced trees/cliffs (a *treeline*) on
z2 to hide the border and frame the scene.

**Vary the ground.** Break uniform grass with scattered tall grass/flowers and an
occasional clearing — but mind autotile *type* (next rule).

**Solid vs overlay autotiles.** Some autotiles are **solid** (grass, water, the
opaque ground/dirt) → paint on **z0**. Others are **transparent-edged overlays**
(dirt-on-grass patches that blend) → these must go on **z1 over the grass**;
putting an overlay autotile on z0 renders **black edges** (nothing shows through).
If a `render_map` shows black borders around a ground patch, it's an overlay on
the wrong layer — move it to z1 or use the solid ground autotile.

### Bad-map smell test (red flags)
Large empty same-tile areas · rectangular/straight-edged water or buildings ·
decoration only in corners · straight paths · no focal point · symmetry ·
lone sprinkled tiles · map too big to fill (split it) · furniture flush on walls ·
inconsistent wall/cliff height on connected sections · hard right-angle paths
where people would curve · decor in visible rows/patterns · empty dead-ends ·
hidden/obstructed exits · over-applied three-tile rule (on roads/rivers/interiors) ·
overused fog/tint/weather.

### Good-map checklist
Organic blob/cells shapes (no rects in nature) · detail across the whole map with
a density gradient · a focal point + a path that leads to it · edges framed by a
treeline · varied ground · clustered (scattered) decor, not sprinkled.

### Named patterns
- **Organic pond/lake** — `apply_autotile` water `blob` + rocks scattered at the
  shore + a dirt **clearing** where a path arrives.
- **Winding trail** — `apply_autotile` ground `cells` along a curve between two
  places.
- **Treeline border** — spaced trees on z2 down an edge (no overlap).
- **Forest density gradient** — `scatter_tiles` bushes/trees denser toward a
  thicket, thinning to open ground.
- **Clearing with focal landmark** — open ring of low clutter around a lone
  landmark tree/shrine, detail densest at the ring.

## 5c. Composition craft (named techniques)

These are the named, community/level-design rules that separate a competent map
from a flat one. Citations in §9.

- **Three-tile rule (a guideline, not a law).** On *natural* maps, avoid more than
  ~3 identical tiles in a row — break the run with a variation tile. It makes
  terrain read organic. **Do NOT apply it to roads, rivers, walls, or interiors**
  (over-applying it is itself a mistake). *MCP:* a light `scatter_tiles` pass of
  variation tiles over a base-painted region; never on `path` stamps or interiors.
- **Contrast is the *mechanism* of a focal point.** "A tall thing only seems
  special when surrounded by short things." A focal point isn't a thing you place,
  it's a contrast you create — in height, density, orientation, or shape. *MCP:*
  thin `scatter_tiles` density *around* the landmark (focal gradient), then one
  tall z2 object towering over the thinned low clutter.
- **Sightlines & vistas.** Keep an open, clutter-free sightline along the player's
  likely approach; at a key transition, open a **vista** — a deep view that
  previews the next area so the player can form a plan. *MCP:* reserve a density-0
  corridor and frame its sides with a z2 treeline so the gap reads as intentional.
- **Paths are affordances, not "leading lines."** Decorative converging lines
  barely steer players; a **walkable path** does, because it's a navigational
  affordance. Keep leading the eye with the `path` to the focal point — that's the
  version that actually works.
- **Inter-terrain transitions.** Where two terrains meet (grass/dirt/sand), let the
  autotile edge variants blend them — never butt two full-tile textures with a hard
  straight seam. *MCP:* `apply_autotile` `cells`/`path` along the boundary on z0;
  the engine picks the edge piece.
- **Border treatment (matters MORE in XP).** RMXP shows the **literal edge tiles
  repeated** beyond the map (no MV/MZ auto-fill), so paint a sensible border ring —
  continue the treeline/wall-top past the boundary and block it with passability.
  Never leave a raw blank or mismatched edge; never bury a map *exit* under decor.
- **Restraint & negative space.** Don't fill every tile to avoid emptiness, and
  don't mask weak design with z2 clutter. Deliberate negative space is part of the
  composition; "every screen-sized shot should compose."

## 5d. Map-type playbooks

Outdoor/nature is the default elsewhere in this guide; these cover the other types.

- **Interior.** Furniture sits *in front of* walls (one row below the wall), never
  painted onto the wall face (that looks like a flat cutout). Rugs/carpets along a
  wall are partly tucked **under** the ceiling/wall tile. Keep **one wall height**
  per building; the interior footprint should echo the exterior. Furnish by
  **function** ("two ovens + flour sacks = bakery"), not clutter. Size `interior`
  (~one screen). *MCP:* `set_map_tiles` furniture on z1; wall/ceiling on z2; keep
  wall rows uniform; no overlapping multi-tile furniture (§4).
- **Town.** Decide the town's **purpose/economy first**; set **2–3 anchors** (shop,
  inn, exit/dungeon) and let it grow **organically** around them. Orient house
  entrances **toward** the central anchor so paths stay short and logical; build
  from local materials; add non-building land (crops, animals, grass) for breathing
  room; prefer a compact **walled/bordered** town over sprawl. *MCP:* anchors =
  focal points (one per screen-region); `path` mode connects entrances to the
  centre; `scatter_tiles` for crops/clutter between buildings.
- **Dungeon.** Lay a **critical path** to the goal, add **branches** where **no
  dead-end is empty** (each holds treasure/content), convert spare connectors into
  **imperfect loops** (kill the lost-backtrack), use **hub** rooms with **gated**
  doors and **shortcuts** back, and **tease** visible-but-unreachable treasure
  early to set goals. *MCP:* one focal reward per room-region; `apply_autotile`
  floor blobs per room + `path` corridors; doors/gates as `set_map_tiles` stamps;
  keys/gating via events. (RMXP has **no region IDs** — zone with terrain tags +
  events + passability.)
- **Cliffs / verticality.** Every **connected** cliff section shares **one height**
  (separate plateaus may differ); break long straight cliff edges with small jogs;
  scatter **same-palette rubble at the base** "as if it fell." Stairs/ramps connect
  levels and segment the space into a multi-room feel. *MCP:* paint faces with the
  cliff autotile keeping each plateau's wall rows uniform; low-density base rocks
  via `scatter_tiles`; stairs as stamps. (No MV/MZ "shadow pen" in XP — paint
  shadow tiles manually or omit.)

## 5e. RMXP-specific flags (don't assume MV/MZ behaviour)

- **No region IDs** — use terrain tags + events + passability for zoning/gating.
- **No shadow pen** — cliff/wall shadows are manual tiles or skipped, not auto.
- **Edge tiles repeat** off-map (no auto-fill border) — paint the border ring.
- **RGSS1 autotiles** (≤7 per tileset, Shift-draw to force a variant) — the blend
  *concept* transfers from MV/MZ but tile geometry differs.

## 6. The authoring workflow

0. **Size first** — pick the size from the map's purpose (§0). `create_map` with a
   `purpose` defaults the size and returns the screen/focal-point/clutter budget;
   `get_map_size_advisory` does the same for a map you're editing. Plan the design
   to that budget (focal points and a path network per screen-region).
1. **Understand the tileset** — `render_tileset_atlas(tileset_id)`; read tile ids,
   note priority (overhead vs ground) and passability (the dots), identify the
   autotile slots and the multi-tile objects' bounding boxes.
2. **Plan** — sketch terrain shapes, the focal point, the path, where verticals
   frame the scene. Decide each element's layer by role (§1).
3. **Paint terrain (z0)** — `apply_autotile`: `blob` for ponds/lakes/forest
   patches, `cells` for rivers/curved paths, `region` only for rectangular floors.
   Overlay (transparent-edged) ground autotiles go on z1, not z0 (§5b).
4. **Place ground clutter (z1)** — `scatter_tiles` (density + focal gradient) for
   flowers/bushes/grass across the whole map; `set_map_tiles` for specific props.
5. **Place overhead (z2)** — trees/roofs, spaced so bounding boxes don't overlap.
6. **Render & refine** — `render_map` to check composition (flat); open the editor
   or playtest to confirm occlusion/passability; iterate.

## 7. Quick checklist before calling a map done

- [ ] Terrain on z0, clutter on z1, tall/overhead on z2 — all three used by role.
- [ ] No two multi-tile objects overlap on the same layer (no clipping).
- [ ] Overhead tiles (priority > 0) are on z2, not z1.
- [ ] The path leads to a focal point; walkable space is clear.
- [ ] Decoration is clustered, not sprinkled; the field isn't uniformly flat.
- [ ] Map border is framed/hidden by verticals or terrain.
- [ ] A focal point made by *contrast* (height/density/shape), not just placement.
- [ ] (Interior) furniture in front of walls, one wall height, furnished by function.
- [ ] (Dungeon) no empty dead-ends; loops over lone branches; gated progression.
- [ ] (Cliffs) connected sections share one height; rubble at the base.

## 8. Sources

The craft in §5c–§5e is drawn from these (researched 2026-06; XP-applicability
noted inline). Universal level-design craft, plus RPG-Maker-specific tutorials:

- The Level Design Book — *Composition* (sightline, vista, focal point, contrast;
  the skeptical take on leading lines): https://book.leveldesignbook.com/process/blockout/massing/composition
- RPG Maker Web blog — *Mapping: Towns* (purpose-first, anchors + organic growth):
  https://www.rpgmakerweb.com/blog/mapping-towns
- RPG Maker Web blog — *Tutorial: Mapping Interior* (furniture off walls, wall
  height, function): https://www.rpgmakerweb.com/blog/tutorial-mapping-interior
- RPG Maker Web blog — *Tips & Tricks: Mapping Cliffs* (plateau consistency, base
  rubble): https://www.rpgmakerweb.com/blog/tips-and-tricks-mapping-cliffs
- RPG Maker Web forums — *Dungeon Design for Dummies* (critical path, loops, hubs,
  gating, rewarded dead-ends): https://forums.rpgmakerweb.com/threads/dungeon-design-for-dummies.130738/
- RPG Maker Web forums — *Mapping & Map Design tips* / *Mapping Tips* (draft-first,
  variation tiles, restraint, cardboard-cutout warning):
  https://forums.rpgmakerweb.com/threads/mapping-and-map-design-tips.140273/ ·
  https://forums.rpgmakerweb.com/index.php?threads/mapping-tips.89212/
- rpgmaker.net forums — *The Three Tile Rule* (rule + caveats) and *Map Making 101*
  (RMXP-era community): https://rpgmaker.net/forums/topics/5357/ ·
  https://rpgmaker.net/forums/topics/2412/
- MoeGamer — *RPG Maker MV: Basic Mapping* (autotile transitions, soft barriers,
  start-trapped warning): https://moegamer.net/2016/08/10/rpg-maker-mv-basic-mapping/

> Note: Driftwood Gaming / Echo607 / SeaPhoenix are well-known but video-only or
> not retrievably indexed; no specific rule here is attributed to them.
