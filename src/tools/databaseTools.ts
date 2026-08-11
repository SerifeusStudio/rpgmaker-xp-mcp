import { readRxdataFile, writeRxdataFile, getDataPath } from '../utils/fileHandler.js';
import type { PlainTable } from '../utils/rxdata.js';

/**
 * Generic access to the remaining database files (all are arrays with a
 * nil slot at index 0). Tables inside entries (tileset passages, enemy
 * element_ranks, etc.) appear as { _class: 'Table', ... } and can be
 * edited in place via update_database_entry.
 */

const DATABASE_FILES = {
  actors: 'Actors.rxdata',
  classes: 'Classes.rxdata',
  skills: 'Skills.rxdata',
  items: 'Items.rxdata',
  weapons: 'Weapons.rxdata',
  armors: 'Armors.rxdata',
  enemies: 'Enemies.rxdata',
  troops: 'Troops.rxdata',
  states: 'States.rxdata',
  animations: 'Animations.rxdata',
  tilesets: 'Tilesets.rxdata',
  common_events: 'CommonEvents.rxdata',
} as const;

export type DatabaseKind = keyof typeof DATABASE_FILES;

function fileFor(kind: string): string {
  const file = DATABASE_FILES[kind as DatabaseKind];
  if (!file) {
    throw new Error(
      `Unknown database "${kind}" (expected one of: ${Object.keys(DATABASE_FILES).join(', ')})`
    );
  }
  return file;
}

async function loadDatabase(projectPath: string, kind: string): Promise<(any | null)[]> {
  return readRxdataFile<(any | null)[]>(getDataPath(projectPath, fileFor(kind)));
}

/** Replace Table values with a dimensions-only summary for list output */
function summarizeTables(entry: any): any {
  if (entry === null || typeof entry !== 'object') return entry;
  if (Array.isArray(entry)) return entry.map(summarizeTables);
  if (entry._class === 'Table') {
    const t = entry as PlainTable;
    return { _class: 'Table', dim: t.dim, xsize: t.xsize, ysize: t.ysize, zsize: t.zsize, data: '<omitted>' };
  }
  const out: any = {};
  for (const key of Object.keys(entry)) out[key] = summarizeTables(entry[key]);
  return out;
}

/**
 * Get all entries of a database file. Tables and event command lists are
 * summarized; use get_database_entry for full data.
 */
export async function getDatabase(projectPath: string, kind: string): Promise<any[]> {
  const entries = await loadDatabase(projectPath, kind);
  return entries
    .filter(e => e !== null)
    .map(e => {
      const summarized = summarizeTables(e);
      // Command/frame lists can be huge — collapse to a count in list view
      if (Array.isArray(summarized.list)) summarized.list = `<${summarized.list.length} commands>`;
      if (Array.isArray(summarized.frames)) summarized.frames = `<${summarized.frames.length} frames>`;
      return summarized;
    });
}

/**
 * Get one full database entry by ID (including Tables and command lists)
 */
export async function getDatabaseEntry(projectPath: string, kind: string, id: number): Promise<any> {
  const entries = await loadDatabase(projectPath, kind);
  const entry = entries[id];
  if (!entry) {
    throw new Error(`${kind} entry ${id} not found (1-${entries.length - 1})`);
  }
  return entry;
}

/**
 * Merge updates into a database entry and save the file
 */
export async function updateDatabaseEntry(
  projectPath: string,
  kind: string,
  id: number,
  updates: Record<string, any>
): Promise<any> {
  const file = fileFor(kind);
  const path = getDataPath(projectPath, file);
  const entries = await readRxdataFile<(any | null)[]>(path);
  const entry = entries[id];
  if (!entry) {
    throw new Error(`${kind} entry ${id} not found (1-${entries.length - 1})`);
  }
  const { _class, id: _id, ...safeUpdates } = updates;
  Object.assign(entry, safeUpdates);
  await writeRxdataFile(path, entries);
  return summarizeTables(entry);
}
