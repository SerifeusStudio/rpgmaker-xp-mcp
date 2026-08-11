import { readRxdataFile, writeRxdataFile, getDataPath, getMapPath } from '../utils/fileHandler.js';
import { GameMap, MapEvent, MapInfo, EventCommand, makeEventPage, makeEventCommand, makeMap, makeMapInfo } from '../utils/types.js';
import { touchMagicNumber, getSystem } from './systemTools.js';
import { MASK_TO_VARIANT, NEIGHBOR_BITS } from '../utils/autotileTable.js';
import { MAP_DESIGN_CORE } from './guideTools.js';
import { MapPurpose, resolveSize, sizeAdvisory } from '../utils/mapSizing.js';

async function loadMap(projectPath: string, mapId: number): Promise<GameMap> {
  return readRxdataFile<GameMap>(getMapPath(projectPath, mapId));
}

async function saveMap(projectPath: string, mapId: number, map: GameMap): Promise<void> {
  for (const event of Object.values(map.events ?? {})) {
    for (const page of event.pages ?? []) {
      page.list = normalizeCommandList(page.list);
    }
  }
  await writeRxdataFile(getMapPath(projectPath, mapId), map);
  // Mirror the editor: bump the save-revision marker so existing save
  // files reload the changed map instead of keeping a stale copy
  await touchMagicNumber(projectPath);
}

/**
 * Enforce the event command list invariants the editor and runtime expect:
 * every command has code/indent/parameters, and the list ends with the
 * terminator {code: 0, indent: 0, parameters: []}.
 */
function normalizeCommandList(list: any[] | undefined): EventCommand[] {
  const commands: EventCommand[] = (Array.isArray(list) ? list : []).map(cmd =>
    makeEventCommand(cmd?.code ?? 0, cmd?.indent ?? 0, cmd?.parameters ?? [])
  );
  const last = commands[commands.length - 1];
  if (!last || last.code !== 0) {
    commands.push(makeEventCommand());
  }
  return commands;
}

/**
 * Get map data by ID. The tile data Table is summarized to its dimensions
 * unless includeTiles is true (a 100x100 map has 30,000 tile entries).
 */
export async function getMap(
  projectPath: string,
  mapId: number,
  includeTiles = false
): Promise<any> {
  const map = await loadMap(projectPath, mapId);
  if (includeTiles) return map;
  const { data, ...rest } = map;
  return {
    ...rest,
    data: { _class: 'Table', dim: data.dim, xsize: data.xsize, ysize: data.ysize, zsize: data.zsize, data: '<omitted - use includeTiles>' },
  };
}

/**
 * Get information about all maps (MapInfos.rxdata: id -> RPG::MapInfo)
 */
export async function getMapInfos(projectPath: string): Promise<Record<string, MapInfo>> {
  return readRxdataFile<Record<string, MapInfo>>(getDataPath(projectPath, 'MapInfos.rxdata'));
}

/**
 * Get all events from a specific map
 */
export async function getMapEvents(projectPath: string, mapId: number): Promise<MapEvent[]> {
  const map = await loadMap(projectPath, mapId);
  return Object.values(map.events ?? {});
}

/**
 * Get a specific event from a map
 */
export async function getMapEvent(
  projectPath: string,
  mapId: number,
  eventId: number
): Promise<MapEvent> {
  const map = await loadMap(projectPath, mapId);
  const event = map.events?.[String(eventId)];
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found on map ${mapId}`);
  }
  return event;
}

/**
 * Update a map event's properties
 */
export async function updateMapEvent(
  projectPath: string,
  mapId: number,
  eventId: number,
  updates: Partial<MapEvent>
): Promise<MapEvent> {
  const map = await loadMap(projectPath, mapId);
  const event = map.events?.[String(eventId)];
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found on map ${mapId}`);
  }
  const { _class, id, ...safeUpdates } = updates as any;
  Object.assign(event, safeUpdates);
  await saveMap(projectPath, mapId, map);
  return event;
}

/**
 * Create a new event on a map. If pages are omitted, a default empty page
 * is created (same as the RMXP editor).
 */
export async function createMapEvent(
  projectPath: string,
  mapId: number,
  params: { name: string; x: number; y: number; pages?: any[] }
): Promise<MapEvent> {
  const map = await loadMap(projectPath, mapId);
  map.events = map.events ?? {};

  const ids = Object.keys(map.events).map(Number);
  const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

  const event: MapEvent = {
    _class: 'RPG::Event',
    id: newId,
    name: params.name,
    x: params.x,
    y: params.y,
    pages: params.pages && params.pages.length > 0 ? (params.pages as any) : [makeEventPage()],
  };

  map.events[String(newId)] = event;
  await saveMap(projectPath, mapId, map);
  return event;
}

/**
 * Search events on a map by name
 */
export async function searchMapEvents(
  projectPath: string,
  mapId: number,
  searchTerm: string
): Promise<MapEvent[]> {
  const events = await getMapEvents(projectPath, mapId);
  const term = searchTerm.toLowerCase();
  return events.filter(e => e.name.toLowerCase().includes(term));
}

/**
 * Add a command to an event page. The command is inserted before the
 * trailing terminator (code 0) so the list stays valid for the editor.
 */
export async function addEventCommand(
  projectPath: string,
  mapId: number,
  eventId: number,
  pageIndex: number,
  command: { code: number; indent?: number; parameters?: any[] },
  position?: number
): Promise<EventCommand[]> {
  const map = await loadMap(projectPath, mapId);
  const event = map.events?.[String(eventId)];
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found on map ${mapId}`);
  }
  const page = event.pages[pageIndex];
  if (!page) {
    throw new Error(`Page ${pageIndex} not found on event ${eventId}`);
  }

  const cmd = makeEventCommand(command.code, command.indent ?? 0, command.parameters ?? []);

  // Never insert past the trailing terminator command (code 0)
  const maxPos = Math.max(0, page.list.length - 1);
  const insertAt = position !== undefined ? Math.min(position, maxPos) : maxPos;
  page.list.splice(insertAt, 0, cmd);

  await saveMap(projectPath, mapId, map);
  return page.list;
}

/**
 * Add a Show Text message to an event page. In XP the first line of each
 * message box goes in a code 101 command and continuation lines in code
 * 401 commands; the message window shows up to 4 lines, so longer text is
 * split into multiple boxes automatically.
 */
export async function addShowText(
  projectPath: string,
  mapId: number,
  eventId: number,
  pageIndex: number,
  text: string,
  position?: number
): Promise<EventCommand[]> {
  const map = await loadMap(projectPath, mapId);
  const event = map.events?.[String(eventId)];
  if (!event) {
    throw new Error(`Event with ID ${eventId} not found on map ${mapId}`);
  }
  const page = event.pages[pageIndex];
  if (!page) {
    throw new Error(`Page ${pageIndex} not found on event ${eventId}`);
  }

  const lines = text.split(/\r?\n/);
  const commands: EventCommand[] = [];
  for (let i = 0; i < lines.length; i += 4) {
    commands.push(makeEventCommand(101, 0, [lines[i]]));
    for (const line of lines.slice(i + 1, i + 4)) {
      commands.push(makeEventCommand(401, 0, [line]));
    }
  }

  const maxPos = Math.max(0, page.list.length - 1);
  const insertAt = position !== undefined ? Math.min(position, maxPos) : maxPos;
  page.list.splice(insertAt, 0, ...commands);

  await saveMap(projectPath, mapId, map);
  return page.list;
}

// ---------------------------------------------------------------------------
// Map connectivity — transfer events & world graph (FR-2)
//
// Maps are wired together by "Transfer Player" event commands (code 201). The
// RGSS1 parameter layout (research/scripts Interpreter command_201) is:
//   [appoint_type, map_id, x, y, direction, fade]
//     appoint_type: 0 = direct, 1 = designate with variables ($game_variables)
//     direction:    0 retain, 2 down, 4 left, 6 right, 8 up
//     fade:         0 = fade through black, 1 = no fade
// These tools author such events and validate the resulting world graph.
// ---------------------------------------------------------------------------

const TRANSFER_CODE = 201;
const VALID_DIRECTIONS = new Set([0, 2, 4, 6, 8]);

/** Pull every Transfer-Player (201) command out of an event's pages. */
function transfersInEvent(event: MapEvent): Array<{
  pageIndex: number; appoint: number; mapId: number | null; x: number | null; y: number | null;
  direction: number; fade: boolean; dynamic: boolean; params: any[];
}> {
  const out: any[] = [];
  (event.pages ?? []).forEach((page, pageIndex) => {
    for (const cmd of page.list ?? []) {
      if (cmd.code !== TRANSFER_CODE) continue;
      const p = cmd.parameters ?? [];
      const dynamic = p[0] === 1;
      out.push({
        pageIndex, appoint: p[0] ?? 0,
        mapId: dynamic ? null : p[1] ?? null,
        x: dynamic ? null : p[2] ?? null,
        y: dynamic ? null : p[3] ?? null,
        direction: p[4] ?? 0, fade: (p[5] ?? 0) === 0, dynamic, params: p,
      });
    }
  });
  return out;
}

/**
 * Author a Transfer Player event at (x,y) on `mapId` that warps the player to
 * (targetX,targetY) on `targetMapId`. A door (trigger 0 = action button, give it
 * a graphic) or an edge teleport (trigger 1 = player touch, leave it invisible).
 * Validates both endpoints exist and are in-bounds before writing.
 */
export async function createTransferEvent(
  projectPath: string,
  mapId: number,
  params: {
    x: number; y: number;
    targetMapId: number; targetX: number; targetY: number;
    name?: string; direction?: number; fade?: boolean; trigger?: number;
    graphic?: { tileId?: number; characterName?: string; characterHue?: number; direction?: number; pattern?: number };
  }
): Promise<any> {
  const { x, y, targetMapId, targetX, targetY } = params;
  const direction = params.direction ?? 0;
  const fade = params.fade ?? true;
  const trigger = params.trigger ?? 1; // default player-touch (edge teleport)
  if (!VALID_DIRECTIONS.has(direction)) throw new Error(`direction must be 0,2,4,6,8 (got ${direction})`);
  if (![0, 1, 2].includes(trigger)) throw new Error(`trigger must be 0 (action), 1 (player touch) or 2 (event touch)`);

  // Source endpoint in-bounds (loadMap throws if the map is missing)
  const map = await loadMap(projectPath, mapId);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    throw new Error(`source (${x},${y}) out of bounds for map ${mapId} (${map.width}x${map.height})`);
  }
  // Target endpoint exists + in-bounds
  let target: GameMap;
  try { target = await loadMap(projectPath, targetMapId); }
  catch { throw new Error(`target map ${targetMapId} does not exist`); }
  if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) {
    throw new Error(`target (${targetX},${targetY}) out of bounds for map ${targetMapId} (${target.width}x${target.height})`);
  }

  const page = makeEventPage();
  page.trigger = trigger;
  if (params.graphic) {
    if (params.graphic.tileId != null) page.graphic.tile_id = params.graphic.tileId;
    if (params.graphic.characterName != null) page.graphic.character_name = params.graphic.characterName;
    if (params.graphic.characterHue != null) page.graphic.character_hue = params.graphic.characterHue;
    if (params.graphic.direction != null) page.graphic.direction = params.graphic.direction;
    if (params.graphic.pattern != null) page.graphic.pattern = params.graphic.pattern;
  }
  page.list = [makeEventCommand(TRANSFER_CODE, 0, [0, targetMapId, targetX, targetY, direction, fade ? 0 : 1])];

  const name = params.name ?? `transfer_to_${targetMapId}`;
  const event = await createMapEvent(projectPath, mapId, { name, x, y, pages: [page] });
  return {
    mapId, eventId: event.id, name, at: { x, y },
    target: { mapId: targetMapId, x: targetX, y: targetY, direction, fade },
    trigger,
  };
}

/**
 * Build and validate the world transfer graph. Scans every map's events for
 * Transfer Player (201) commands, checks each targets a real map at in-bounds
 * coords, computes reachability from the start map, and flags orphan/unreachable
 * maps. Variable-designated transfers are reported as `dynamic` (can't verify a
 * runtime-computed destination). Optionally returns a Mermaid diagram.
 */
export async function validateWorldGraph(
  projectPath: string,
  opts: { diagram?: boolean } = {}
): Promise<any> {
  const infos = await getMapInfos(projectPath);
  const mapIds = Object.keys(infos).map(Number).sort((a, b) => a - b);
  let startMapId = 0;
  try { startMapId = (await getSystem(projectPath)).start_map_id ?? 0; } catch { /* no system */ }

  // Load every map once: dimensions + outgoing transfers.
  const nodes: Record<number, { id: number; name: string; width: number; height: number; exists: boolean; transfers_out: number }> = {};
  const edges: any[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const id of mapIds) {
    const info = infos[String(id)];
    try {
      const map = await loadMap(projectPath, id);
      nodes[id] = { id, name: info?.name ?? '', width: map.width, height: map.height, exists: true, transfers_out: 0 };
    } catch {
      nodes[id] = { id, name: info?.name ?? '', width: 0, height: 0, exists: false, transfers_out: 0 };
      errors.push(`map ${id} (${info?.name ?? '?'}) is in MapInfos but its MapXXX.rxdata is missing`);
    }
  }

  for (const id of mapIds) {
    if (!nodes[id].exists) continue;
    const events = await getMapEvents(projectPath, id);
    for (const ev of events) {
      for (const t of transfersInEvent(ev)) {
        nodes[id].transfers_out++;
        const edge: any = {
          from: id, from_event: ev.id, from_event_name: ev.name, page: t.pageIndex,
          to: t.mapId, to_x: t.x, to_y: t.y, direction: t.direction, dynamic: t.dynamic, valid: true,
        };
        if (t.dynamic) {
          edge.valid = null; // unverifiable
          warnings.push(`map ${id} event ${ev.id} (${ev.name}): transfer uses variable designation — destination is runtime-computed, not verified`);
        } else if (t.mapId == null || nodes[t.mapId] == null) {
          edge.valid = false;
          errors.push(`map ${id} event ${ev.id} (${ev.name}): transfers to non-existent map ${t.mapId}`);
        } else if (!nodes[t.mapId].exists) {
          edge.valid = false;
          errors.push(`map ${id} event ${ev.id} (${ev.name}): transfers to map ${t.mapId} whose data file is missing`);
        } else {
          const tn = nodes[t.mapId];
          if (t.x! < 0 || t.y! < 0 || t.x! >= tn.width || t.y! >= tn.height) {
            edge.valid = false;
            errors.push(`map ${id} event ${ev.id} (${ev.name}): transfer target (${t.x},${t.y}) is out of bounds for map ${t.mapId} (${tn.width}x${tn.height})`);
          }
        }
        edges.push(edge);
      }
    }
  }

  // Reachability from the start map via valid static edges.
  const reachable = new Set<number>();
  if (startMapId && nodes[startMapId]?.exists) {
    const stack = [startMapId];
    reachable.add(startMapId);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of edges) {
        if (e.from === cur && e.valid === true && e.to != null && !reachable.has(e.to)) {
          reachable.add(e.to); stack.push(e.to);
        }
      }
    }
  }

  // Inbound count per map (static valid edges only).
  const inbound = new Map<number, number>();
  for (const e of edges) if (e.valid === true && e.to != null) inbound.set(e.to, (inbound.get(e.to) ?? 0) + 1);

  const orphans: number[] = [];     // no inbound transfer and not the start map
  const unreachable: number[] = []; // not reachable from start via the transfer graph
  for (const id of mapIds) {
    if (!nodes[id].exists) continue;
    if (id !== startMapId && (inbound.get(id) ?? 0) === 0) orphans.push(id);
    if (startMapId && !reachable.has(id)) unreachable.push(id);
  }
  if (!startMapId) warnings.push('System.start_map_id is 0/unset — reachability not computed');
  for (const id of orphans) warnings.push(`map ${id} (${nodes[id].name}) has no inbound transfer (orphan — reachable only via the start position or editor)`);
  for (const id of unreachable) if (!orphans.includes(id)) warnings.push(`map ${id} (${nodes[id].name}) is not reachable from the start map ${startMapId} through transfer events`);

  const result: any = {
    start_map_id: startMapId,
    summary: {
      maps: mapIds.length,
      maps_with_data: Object.values(nodes).filter(n => n.exists).length,
      transfers: edges.length,
      broken_transfers: edges.filter(e => e.valid === false).length,
      dynamic_transfers: edges.filter(e => e.dynamic).length,
      orphan_maps: orphans.length,
      unreachable_maps: unreachable.length,
      ok: errors.length === 0,
    },
    nodes: Object.values(nodes),
    edges,
    orphans,
    unreachable,
    errors,
    warnings,
  };
  if (opts.diagram) result.diagram_mermaid = worldGraphMermaid(Object.values(nodes), edges, startMapId, reachable);
  return result;
}

/** Render the world graph as a Mermaid flowchart (broken edges dashed/red). */
function worldGraphMermaid(nodes: any[], edges: any[], startMapId: number, reachable: Set<number>): string {
  const lines = ['flowchart LR'];
  const sani = (s: string) => String(s).replace(/["\\]/g, ' ').slice(0, 24);
  for (const n of nodes) {
    if (!n.exists) { lines.push(`  M${n.id}["${n.id}: ${sani(n.name)} (MISSING)"]:::missing`); continue; }
    const cls = n.id === startMapId ? ':::start' : (reachable.size && !reachable.has(n.id) ? ':::unreached' : '');
    lines.push(`  M${n.id}["${n.id}: ${sani(n.name)}"]${cls}`);
  }
  let i = 0;
  for (const e of edges) {
    if (e.dynamic || e.to == null) { lines.push(`  M${e.from} -. var .-> U${i++}((?))`); continue; }
    const label = `${e.to_x},${e.to_y}`;
    lines.push(e.valid === false ? `  M${e.from} -.->|BROKEN ${label}| M${e.to}` : `  M${e.from} -->|${label}| M${e.to}`);
  }
  lines.push('  classDef start fill:#155f85,color:#fff;');
  lines.push('  classDef missing fill:#7a1f1f,color:#fff;');
  lines.push('  classDef unreached fill:#5a4a00,color:#fff;');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Map authoring — creation and tile painting (FR-1 P1)
//
// Map.data is a Table[width,height,3] of tile ids, x-major:
//   data[x + y*xsize + z*xsize*ysize]   (WISDOM §1)
// Layers z: 0 = ground, 1 = detail, 2 = overhead. Tile id 0 = empty,
// 48..383 = autotiles, >= 384 = regular tileset tiles.
// ---------------------------------------------------------------------------

const NUM_LAYERS = 3;
const tileIndex = (t: { xsize: number; ysize: number }, x: number, y: number, z: number) =>
  x + y * t.xsize + z * t.xsize * t.ysize;

function assertLayer(layer: number): void {
  if (!Number.isInteger(layer) || layer < 0 || layer >= NUM_LAYERS) {
    throw new Error(`layer must be 0, 1, or 2 (got ${layer})`);
  }
}

/**
 * Create a new map: writes the next-free `MapXXX.rxdata` (a blank
 * `Table(width,height,3)`) plus a `MapInfos.rxdata` entry, using the RMXP
 * editor's defaults. Returns the new map id.
 */
export async function createMap(
  projectPath: string,
  params: { name: string; width?: number; height?: number; purpose?: MapPurpose; tilesetId?: number; parentId?: number }
): Promise<any> {
  const { name } = params;
  // Size is the first design decision: an explicit size wins; otherwise the
  // purpose picks a sensible default. Result is clamped to engine limits
  // (a sub-20x15 / >500 map won't open). The advisory is returned, never blocks.
  if (params.width != null && (!Number.isInteger(params.width) || params.width < 1)) {
    throw new Error('width must be a positive integer');
  }
  if (params.height != null && (!Number.isInteger(params.height) || params.height < 1)) {
    throw new Error('height must be a positive integer');
  }
  const sized = resolveSize(params.purpose, params.width, params.height);
  const width = sized.width, height = sized.height;
  const advisory = sizeAdvisory(width, height, params.purpose);
  if (sized.clamped) advisory.warnings.unshift(`Size clamped to engine limits (20x15..500x500).`);
  if (sized.defaulted && params.purpose) advisory.warnings.unshift(`Size defaulted from purpose "${params.purpose}" -> ${width}x${height}. Pass width/height to override.`);
  const tilesetId = params.tilesetId ?? 1;
  const parentId = params.parentId ?? 0;

  const infosPath = getDataPath(projectPath, 'MapInfos.rxdata');
  const infos = await readRxdataFile<Record<string, MapInfo>>(infosPath);
  const ids = Object.keys(infos).map(Number);
  const newId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  const orders = Object.values(infos).map(i => i.order ?? 0);
  const order = orders.length > 0 ? Math.max(...orders) + 1 : 1;

  const map = makeMap(width, height, tilesetId);
  await saveMap(projectPath, newId, map); // writes MapXXX.rxdata + bumps magic_number

  infos[String(newId)] = makeMapInfo(name, parentId, order);
  await writeRxdataFile(infosPath, infos);

  return { mapId: newId, name, width, height, tilesetId, parentId, order, size_advisory: advisory, design_guide: MAP_DESIGN_CORE };
}

/**
 * Size advisory for an existing map (screens, focal-point/path targets, scatter
 * density, oversize warnings) — so "adjust size first" is surfaced when editing.
 */
export async function getMapSizeAdvisory(
  projectPath: string,
  mapId: number,
  purpose?: MapPurpose
): Promise<any> {
  const map = await loadMap(projectPath, mapId);
  return sizeAdvisory(map.data.xsize, map.data.ysize, purpose);
}

/**
 * Read tile ids as a 2D grid (never the raw flat dump). Returns one layer's
 * grid when `layer` is given, otherwise all three. An optional `region` crops
 * in tiles. Grid rows are top-to-bottom, each row left-to-right.
 */
export async function getMapTiles(
  projectPath: string,
  mapId: number,
  layer?: number,
  region?: { x: number; y: number; w: number; h: number }
): Promise<any> {
  const map = await loadMap(projectPath, mapId);
  const t = map.data;
  const rx = region?.x ?? 0, ry = region?.y ?? 0;
  const rw = Math.min(region?.w ?? t.xsize, t.xsize - rx);
  const rh = Math.min(region?.h ?? t.ysize, t.ysize - ry);

  const gridFor = (z: number) => {
    const rows: number[][] = [];
    for (let y = 0; y < rh; y++) {
      const row: number[] = [];
      for (let x = 0; x < rw; x++) row.push(t.data[tileIndex(t, rx + x, ry + y, z)]);
      rows.push(row);
    }
    return rows;
  };

  const base = { mapId, width: t.xsize, height: t.ysize, region: { x: rx, y: ry, w: rw, h: rh } };
  if (layer !== undefined) {
    assertLayer(layer);
    return { ...base, layer, tiles: gridFor(layer) };
  }
  return { ...base, layers: [0, 1, 2].map(z => ({ layer: z, tiles: gridFor(z) })) };
}

/**
 * Stamp a 2D block of tile ids into a layer with its top-left at (x, y). Cells
 * that fall outside the map are skipped. `grid` is rows of ids (use 0 to clear
 * a cell). Returns how many cells were written.
 */
export async function setMapTiles(
  projectPath: string,
  mapId: number,
  layer: number,
  x: number,
  y: number,
  grid: number[][]
): Promise<any> {
  assertLayer(layer);
  if (!Array.isArray(grid) || !grid.every(Array.isArray)) {
    throw new Error('grid must be a 2D array of tile ids (rows of numbers)');
  }
  const map = await loadMap(projectPath, mapId);
  const t = map.data;
  let written = 0;
  for (let dy = 0; dy < grid.length; dy++) {
    const ty = y + dy;
    if (ty < 0 || ty >= t.ysize) continue;
    const row = grid[dy];
    for (let dx = 0; dx < row.length; dx++) {
      const tx = x + dx;
      if (tx < 0 || tx >= t.xsize) continue;
      t.data[tileIndex(t, tx, ty, layer)] = row[dx] | 0;
      written++;
    }
  }
  await saveMap(projectPath, mapId, map);
  return { mapId, layer, origin: { x, y }, written };
}

/**
 * Fill a rectangle of a layer with a single tile id (or the whole layer when
 * `rect` is omitted). Use tile id 0 to clear.
 */
export async function fillRegion(
  projectPath: string,
  mapId: number,
  layer: number,
  tileId: number,
  rect?: { x: number; y: number; w: number; h: number }
): Promise<any> {
  assertLayer(layer);
  const map = await loadMap(projectPath, mapId);
  const t = map.data;
  const rx = Math.max(0, rect?.x ?? 0);
  const ry = Math.max(0, rect?.y ?? 0);
  const rw = Math.min(rect?.w ?? t.xsize, t.xsize - rx);
  const rh = Math.min(rect?.h ?? t.ysize, t.ysize - ry);
  let written = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      t.data[tileIndex(t, x, y, layer)] = tileId | 0;
      written++;
    }
  }
  await saveMap(projectPath, mapId, map);
  return { mapId, layer, tileId, rect: { x: rx, y: ry, w: rw, h: rh }, written };
}

// Deterministic-enough PRNG (seedable) for organic shape/scatter generation.
function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * Generate an organic blob of cells — an ellipse (rx,ry around cx,cy) whose
 * radius wobbles per-angle and per-cell, so coastlines/forests are irregular,
 * not rectangular. `irregularity` 0..1 (default 0.4). Deterministic given `seed`.
 */
export function blobCells(
  cx: number, cy: number, rx: number, ry: number, irregularity = 0.4, seed = 1
): Array<[number, number]> {
  const rand = rng(seed);
  // per-angle radius multipliers (8 control points, smoothed)
  const ctrl = Array.from({ length: 8 }, () => 1 - irregularity / 2 + rand() * irregularity);
  const radAt = (ang: number) => {
    const f = (ang / (2 * Math.PI)) * 8;
    const i = Math.floor(f) % 8, j = (i + 1) % 8, frac = f - Math.floor(f);
    return ctrl[i] * (1 - frac) + ctrl[j] * frac;
  };
  const cells: Array<[number, number]> = [];
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const ang = Math.atan2(ny, nx) + Math.PI;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d <= radAt(ang) * (0.92 + rand() * 0.16)) cells.push([x, y]);
    }
  }
  return cells;
}

/**
 * Make a cell set AUTOTILE-SAFE so it never renders pinched/isolated: autotiles
 * can only connect orthogonally, so (a) diagonal-only steps are 4-connected by
 * adding an elbow cell, and (b) 1-cell holes (an empty cell with all 4 orthogonal
 * neighbours filled) are filled. Idempotent on solid shapes (blobs/rects).
 */
export function sanitizeAutotileCells(input: Array<[number, number]>): Array<[number, number]> {
  const set = new Set(input.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  for (let pass = 0, changed = true; changed && pass < 8; pass++) {
    changed = false;
    for (const k of [...set]) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (has(x + dx, y + dy) && !has(x + dx, y) && !has(x, y + dy)) { set.add(`${x + dx},${y}`); changed = true; }
      }
    }
    const cands = new Set<string>();
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + dx, y + dy)) cands.add(`${x + dx},${y + dy}`);
    }
    for (const kk of cands) {
      const [x, y] = kk.split(',').map(Number);
      if (has(x + 1, y) && has(x - 1, y) && has(x, y + 1) && has(x, y - 1)) { set.add(kk); changed = true; }
    }
  }
  return [...set].map(k => k.split(',').map(Number) as [number, number]);
}

/**
 * Generate an autotile-safe path/road through waypoints: walks orthogonally
 * (horizontal then vertical — never diagonal) with the given width (>=2
 * recommended), then sanitizes. Use for trails/roads/rivers so they stay
 * continuous instead of breaking into isolated tiles.
 */
export function pathCells(points: Array<[number, number]>, width = 2): Array<[number, number]> {
  const w = Math.max(1, Math.round(width)), r = Math.floor((w - 1) / 2);
  const cells = new Set<string>();
  const stamp = (x: number, y: number) => { for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) cells.add(`${x + dx - r},${y + dy - r}`); };
  for (let i = 0; i < points.length - 1; i++) {
    let [x, y] = points[i]; const [tx, ty] = points[i + 1];
    while (x !== tx) { stamp(x, y); x += x < tx ? 1 : -1; }
    while (y !== ty) { stamp(x, y); y += y < ty ? 1 : -1; }
  }
  if (points.length) stamp(points[points.length - 1][0], points[points.length - 1][1]);
  return sanitizeAutotileCells([...cells].map(k => k.split(',').map(Number) as [number, number]));
}

/**
 * Paint an autotile (slot 0..6) over an arbitrary set of cells OR a rectangle,
 * computing the correct edge variant per cell from 8-neighbour connectivity. Pass
 * `cells` (e.g. from blobCells / a meandering stroke) for **organic** water,
 * forests and paths — a rect produces blocky shapes. The border ring of existing
 * same-autotile cells is recomputed so it blends. `edgeMode` 'same' (default)
 * treats the map border as connected; 'different' draws an edge there.
 */
export async function applyAutotile(
  projectPath: string,
  mapId: number,
  layer: number,
  autotileSlot: number,
  area: {
    region?: { x: number; y: number; w: number; h: number };
    cells?: Array<[number, number]>;
    blob?: { cx: number; cy: number; rx: number; ry: number; irregularity?: number; seed?: number };
    path?: { points: Array<[number, number]>; width?: number };
  },
  edgeMode: 'same' | 'different' = 'same'
): Promise<any> {
  assertLayer(layer);
  if (!Number.isInteger(autotileSlot) || autotileSlot < 0 || autotileSlot > 6) {
    throw new Error(`autotileSlot must be 0..6 (got ${autotileSlot})`);
  }
  const map = await loadMap(projectPath, mapId);
  const t = map.data;
  const base = 48 * (autotileSlot + 1);
  const targetSlot = autotileSlot + 1;
  const slotOf = (id: number) => (id >= 48 && id < 384) ? Math.floor(id / 48) : 0;
  const inb = (x: number, y: number) => x >= 0 && x < t.xsize && y >= 0 && y < t.ysize;

  // resolve target cells (rect or explicit list), clipped to the map
  let raw: Array<[number, number]> = [];
  if (area.path) {
    raw = pathCells(area.path.points, area.path.width ?? 2);
  } else if (area.blob) {
    const b = area.blob;
    raw = blobCells(b.cx, b.cy, b.rx, b.ry, b.irregularity, b.seed);
  } else if (area.cells?.length) {
    raw = area.cells;
  } else if (area.region) {
    const { x, y, w, h } = area.region;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) raw.push([xx, yy]);
  } else {
    throw new Error('apply_autotile needs `blob`, `path`, `cells`, or `region`');
  }
  // enforce autotile-safe topology (4-connected, no diagonal pinches / 1-cell holes), then clip to map
  const cells: Array<[number, number]> = [];
  for (const [x, y] of sanitizeAutotileCells(raw)) if (inb(x, y)) cells.push([x, y]);
  if (cells.length === 0) throw new Error('no in-bounds cells to paint');

  // 1. paint target cells as this autotile (variant filled in below)
  for (const [x, y] of cells) t.data[tileIndex(t, x, y, layer)] = base;

  // 2. recompute variant for painted cells + their border ring (same-slot only)
  const sameHere = (x: number, y: number) => inb(x, y) ? slotOf(t.data[tileIndex(t, x, y, layer)]) === targetSlot : edgeMode === 'same';
  const todo = new Set<number>();
  for (const [x, y] of cells) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny)) todo.add(ny * t.xsize + nx);
    }
  }
  let updated = 0;
  for (const key of todo) {
    const x = key % t.xsize, y = Math.floor(key / t.xsize);
    if (slotOf(t.data[tileIndex(t, x, y, layer)]) !== targetSlot) continue;
    let mask = 0;
    for (const [dx, dy, bit] of NEIGHBOR_BITS) if (sameHere(x + dx, y + dy)) mask |= bit;
    t.data[tileIndex(t, x, y, layer)] = base + MASK_TO_VARIANT[mask];
    updated++;
  }

  await saveMap(projectPath, mapId, map);
  return { mapId, layer, autotileSlot, painted: cells.length, updated, edgeMode };
}

/**
 * Scatter clutter tile ids over a region with natural distribution — random
 * placement at a target `density` (fraction of cells, 0..1), optional radial
 * falloff toward/away from a focal point, and skipping already-occupied cells by
 * default. Fixes "lone sprinkled tiles / corner clustering" — use for flowers,
 * bushes, rocks, tall grass. Deterministic given `seed`.
 */
export async function scatterTiles(
  projectPath: string,
  mapId: number,
  layer: number,
  tileIds: number[],
  region: { x: number; y: number; w: number; h: number },
  opts: { density?: number; seed?: number; avoidOccupied?: boolean; focal?: { x: number; y: number; falloff?: number } } = {}
): Promise<any> {
  assertLayer(layer);
  if (!Array.isArray(tileIds) || tileIds.length === 0) throw new Error('tileIds must be a non-empty array');
  const density = Math.min(1, Math.max(0, opts.density ?? 0.12));
  const avoid = opts.avoidOccupied !== false;
  const rand = rng(opts.seed ?? 12345);
  const map = await loadMap(projectPath, mapId);
  const t = map.data;
  const rx = Math.max(0, region.x), ry = Math.max(0, region.y);
  const rw = Math.min(region.w, t.xsize - rx), rh = Math.min(region.h, t.ysize - ry);
  const focal = opts.focal;
  const maxD = focal ? Math.hypot(rw, rh) : 1;
  let placed = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const idx = tileIndex(t, x, y, layer);
      if (avoid && t.data[idx] !== 0) continue;
      let p = density;
      if (focal) {
        const d = Math.hypot(x - focal.x, y - focal.y) / maxD; // 0 at focal .. 1 far
        const fall = focal.falloff ?? 1; // >0 denser near focal, <0 denser far
        p = density * (fall >= 0 ? (1 - d * fall) : (1 + (1 - d) * fall));
      }
      if (rand() < Math.max(0, p)) {
        t.data[idx] = tileIds[Math.floor(rand() * tileIds.length)];
        placed++;
      }
    }
  }
  await saveMap(projectPath, mapId, map);
  return { mapId, layer, placed, density, region: { x: rx, y: ry, w: rw, h: rh } };
}
