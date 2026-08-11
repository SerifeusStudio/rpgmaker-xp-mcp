import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

/**
 * Server-level guidance and documentation surfaced THROUGH the MCP, so any
 * client (not just one that can read the repo) gets the conventions:
 *  - `SERVER_INSTRUCTIONS` is returned in the initialize response and injected
 *    into context by most MCP clients.
 *  - the docs are exposed as MCP resources clients can read on demand.
 */

/** Sent on connect; keep concise — clients inject this every session. */
export const SERVER_INSTRUCTIONS = `RPG Maker XP project editor. These tools read and write a project's RGSS1 Marshal .rxdata directly (actors, skills, items, maps, events, scripts) and render PNG previews.

GOVERNANCE — these tools are the single sanctioned path for edits; they enforce the engine's invariants so the project doesn't drift:
- Keep the RPG Maker XP EDITOR CLOSED while writing — it rewrites every data file from memory on save and will clobber external changes. The server backs up to Data/.mcp-backup/ and bumps System.magic_number on map writes.
- Use the create_* tools (they mirror the editor's default constructors, so new content is canonical). Don't hand-edit .rxdata.
- Run validate_assets before shipping to catch broken graphic/audio references.

AUTHORING MAPS — FIRST call get_map_design_guide (or read the "map-design" resource). Key rules:
- TILE MEANING FIRST: render_tileset_atlas is only a numeric reference. For an uncataloged tileset, run create_tileset_identification_harness, review source adjacency and multi-tile objects, save the semantic catalog, and validate it before automatic composition.
- SIZE FIRST: a map is N screens of 20x15 tiles. Pass create_map a "purpose" (interior/room/town/dungeon/region/overworld) to default the size, and design to the returned size_advisory (~1 focal point per screen-region + a path network). Use get_map_size_advisory when editing. Engine limits 20x15..500x500.
- Layers (Map.data z, drawn z0->z1->z2 = editor Layer 1/2/3) are assigned by ROLE: z0 terrain (paint with apply_autotile for seamless edges); z1 ground clutter (priority 0: flowers, bushes, rocks); z2 overhead (priority > 0: tree canopies, roofs — player walks behind).
- NEVER overlap two multi-tile objects (trees, houses) on the same layer — set_map_tiles overwrites and they clip; space landmark objects.
- Use the tileset catalog for creator-facing meaning, render_tileset_atlas for quick numeric lookup, and render_map to verify composition (it is a FLAT composite — open the editor to confirm overhead occlusion).

Full guidance is available as resources: map-design (level design), tileset-catalog (tile identification), authoring (XP particularities + anti-drift governance), wisdom (engine internals).`;

interface DocResource { uri: string; name: string; description: string; mimeType: string; file: string; }

export const RESOURCES: DocResource[] = [
  { uri: 'rpgmaker-xp://docs/map-design', name: 'Map design guide', description: 'Level/map design: the three-layer model (terrain/clutter/overhead), tile priority & passability, multi-tile no-overlap rule, composition, authoring workflow.', mimeType: 'text/markdown', file: 'MAP-DESIGN.md' },
  { uri: 'rpgmaker-xp://docs/tileset-catalog', name: 'Tileset identification harness', description: 'Evidence-first workflow for identifying tile semantics, grouping multi-tile objects, assigning confidence, and validating catalogs before map authoring.', mimeType: 'text/markdown', file: 'TILESET-CATALOG.md' },
  { uri: 'rpgmaker-xp://docs/authoring', name: 'Authoring & governance', description: 'Particularities of writing for RPG Maker XP and how this MCP acts as a governance layer to prevent drift.', mimeType: 'text/markdown', file: 'AUTHORING-XP.md' },
  { uri: 'rpgmaker-xp://docs/wisdom', name: 'Engineering wisdom', description: 'Marshal layer, battle math, event system, tileset model, coexisting with the editor.', mimeType: 'text/markdown', file: 'WISDOM.md' },
];

async function readDoc(file: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/ at runtime
  for (const rel of ['../', '../../', '../../../']) {
    try { return await readFile(join(here, rel, file), 'utf8'); } catch { /* try next */ }
  }
  throw new Error(`Documentation file ${file} not found relative to the server`);
}

/** Resource list for ListResources (no content). */
export function listResources() {
  return RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType }));
}

/** Read one resource's content for ReadResource. */
export async function readResource(uri: string) {
  const res = RESOURCES.find(r => r.uri === uri);
  if (!res) throw new Error(`Unknown resource: ${uri}`);
  return { contents: [{ uri, mimeType: res.mimeType, text: await readDoc(res.file) }] };
}
