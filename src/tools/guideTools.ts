import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

/**
 * The core map-design rules, embedded so they are always available (and surfaced
 * inline by create_map). The full guide is MAP-DESIGN.md / get_map_design_guide.
 */
export const MAP_DESIGN_CORE = [
  'MAP DESIGN — load the full guide with get_map_design_guide before authoring.',
  'SIZE FIRST — a map is N screens of 20x15 tiles (screens = ceil(w/20)*ceil(h/15)).',
  '  Choose size from PURPOSE before designing: interior 20x15 (1 screen) | room 25x20 |',
  '  town 40x35 | dungeon 45x40 | region 60x50 | overworld 100x90 (segment). create_map',
  '  picks the default from `purpose` and returns a size_advisory; get_map_size_advisory',
  '  does the same when editing. Engine limits 20x15..500x500 (clamped). Aim ~1 focal point',
  '  per screen-region + a path NETWORK (not one trail); scatter density ~0.04-0.08 per area.',
  '  Don\'t build one mega-map (>~150) — split into segments joined by transfer events.',
  'LAYERS (Map.data z, drawn z0->z1->z2 = editor Layer 1/2/3) — assign by ROLE:',
  '  z0 Terrain: ground autotiles (grass/water/dirt/paths), floors. Use apply_autotile.',
  '  z1 Ground clutter (priority 0): flowers, bushes, rocks, signs — player stands in front.',
  '  z2 Overhead (priority > 0): tree canopies, roofs, cliff/bridge tops — player walks behind.',
  'PRIORITY is a tileset property (per tile id), not a layer; render_tileset_atlas shows it.',
  '  Put priority>0 tiles on z2, priority 0 decor on z1. Do NOT pile everything on one layer.',
  'MULTI-TILE OBJECTS (trees/houses): stamp the whole id block; NEVER overlap two objects on',
  '  the same layer (set_map_tiles overwrites -> clipping). Space landmark trees; use small',
  '  bushes for density. A tree whose tiles are all priority>0 goes entirely on z2.',
  'SHAPES — never paint nature as a rectangle. Use apply_autotile `blob` for ponds/lakes/forest',
  '  patches (irregularity 0.4-0.6) and `cells` for rivers/curved paths; `region` rect only for',
  '  truly rectangular things (a floor). No straight terrain edge longer than ~4 tiles.',
  'DENSITY — detail across the WHOLE map, not corners. Use scatter_tiles (density ~0.04-0.08) for',
  '  flowers/bushes/grass, denser toward the focal point (focal+falloff). No bare same-tile patch >5x5.',
  'PATHS: use apply_autotile `path` (waypoints, width>=2) — it walks orthogonally so trails stay',
  '  continuous. Meander and connect meaningful places, ending in a clearing; never straight/width-1.',
  'AUTOTILE-SAFE: shapes are auto-sanitized (4-connected, no diagonal pinches/1-cell holes) so they',
  '  never render broken. Raw `cells` you build must be >=2 wide and 4-connected (no diagonal-only steps).',
  'AUTOTILE TYPES: solid autotiles (grass/water/opaque dirt) go on z0; transparent-edged OVERLAY',
  '  autotiles (dirt-on-grass) must go on z1 over grass — on z0 they render BLACK edges.',
  'COMPOSE: ONE focal point + a path that leads there; frame edges with a treeline (spaced trees on z2).',
  '  A focal point is made by CONTRAST (height/density/shape) — thin clutter around it so it stands out.',
  'THREE-TILE RULE (nature only): avoid >3 identical tiles in a row; break runs with a variation tile.',
  '  Do NOT apply it to roads, rivers, walls or interiors. Keep deliberate negative space; don\'t over-fill.',
  'BORDER (XP repeats edge tiles off-map, no auto-fill): paint a sensible border ring; never bury an exit.',
  'MAP TYPES (see guide §5d): interior = furniture in FRONT of walls, one wall height, furnish by function;',
  '  town = 2-3 anchors + organic growth, entrances face centre; dungeon = critical path + loops, no empty',
  '  dead-ends, gated hubs; cliffs = connected sections share one height, rubble at the base.',
  'RMXP FLAGS: no region IDs (zone via terrain tags/events/passability), no shadow pen (manual shadows).',
  'VERIFY: render_map is a FLAT composite (no player-occlusion) — open the editor/playtest to',
  '  confirm overhead occlusion and passability.',
].join('\n');

/** Return the full MAP-DESIGN.md (read from the package), or the embedded core. */
export async function getMapDesignGuide(): Promise<any> {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/tools at runtime
  for (const rel of ['../../MAP-DESIGN.md', '../../../MAP-DESIGN.md', '../../../../MAP-DESIGN.md']) {
    try {
      const guide = await readFile(join(here, rel), 'utf8');
      return { source: 'MAP-DESIGN.md', guide };
    } catch { /* try next */ }
  }
  return { source: 'embedded-core', guide: MAP_DESIGN_CORE };
}
