import { join } from 'path';
import { readdirSync, existsSync } from 'fs';
import { readRxdataFile, getDataPath, getMapPath } from '../utils/fileHandler.js';

/**
 * Referenced-asset validator (FR-15). Scans the data files for every graphic
 * and audio filename they reference and reports the ones with no matching file
 * on disk — broken references are otherwise silent until the game runs.
 *
 * Resolution mirrors the renderer: a project's own Graphics/ and Audio/ take
 * precedence, then the RTP (RPGMAKER_RTP_PATH; defaults to the Steam install).
 * RMXP stores names without an extension and audio formats vary (.ogg/.wav/.mid
 * /.mp3, graphics .png/.jpg), so existence is matched on the base name regardless
 * of extension.
 */

const DEFAULT_RTP = process.env.RPGMAKER_RTP_PATH
  || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';

/** Lowercased base-name (no extension) index of a folder, cached. */
const folderCache = new Map<string, Set<string>>();
function indexFolder(absDir: string): Set<string> {
  let set = folderCache.get(absDir);
  if (set) return set;
  set = new Set<string>();
  if (existsSync(absDir)) {
    for (const f of readdirSync(absDir)) {
      const base = f.replace(/\.[^.]+$/, '').toLowerCase();
      set.add(base);
    }
  }
  folderCache.set(absDir, set);
  return set;
}

/** Does `name` exist (any extension) under `<root>/<sub>` for project or RTP? */
function assetExists(projectPath: string, sub: string, name: string): boolean {
  const key = name.replace(/\.[^.]+$/, '').toLowerCase();
  for (const root of [projectPath, DEFAULT_RTP]) {
    if (indexFolder(join(root, sub)).has(key)) return true;
  }
  return false;
}

interface Ref { kind: string; where: string; field: string; sub: string; name: string; }

export async function validateAssets(
  projectPath: string,
  opts: { includeMaps?: boolean } = {}
): Promise<any> {
  const { includeMaps = true } = opts;
  folderCache.clear();
  const refs: Ref[] = [];
  const add = (kind: string, where: string, field: string, sub: string, name: any) => {
    if (typeof name === 'string' && name.length > 0) refs.push({ kind, where, field, sub, name });
  };
  const read = async (file: string) => {
    try { return await readRxdataFile<any>(getDataPath(projectPath, file)); }
    catch { return null; }
  };

  // System
  const sys = await read('System.rxdata');
  if (sys) {
    add('System', '-', 'title_name', 'Graphics/Titles', sys.title_name);
    add('System', '-', 'gameover_name', 'Graphics/Gameovers', sys.gameover_name);
    add('System', '-', 'windowskin_name', 'Graphics/Windowskins', sys.windowskin_name);
    add('System', '-', 'battleback_name', 'Graphics/Battlebacks', sys.battleback_name);
    add('System', '-', 'battler_name', 'Graphics/Battlers', sys.battler_name);
    add('System', '-', 'battle_transition', 'Graphics/Transitions', sys.battle_transition);
    add('System', '-', 'title_bgm', 'Audio/BGM', sys.title_bgm?.name);
    add('System', '-', 'battle_bgm', 'Audio/BGM', sys.battle_bgm?.name);
    add('System', '-', 'battle_end_me', 'Audio/ME', sys.battle_end_me?.name);
    add('System', '-', 'gameover_me', 'Audio/ME', sys.gameover_me?.name);
  }

  // Array databases (index 0 = nil)
  const each = (arr: any[] | null, fn: (e: any, i: number) => void) => {
    if (Array.isArray(arr)) arr.forEach((e, i) => { if (e) fn(e, i); });
  };
  each(await read('Tilesets.rxdata'), (t, i) => {
    add('Tileset', `#${i} ${t.name}`, 'tileset_name', 'Graphics/Tilesets', t.tileset_name);
    add('Tileset', `#${i} ${t.name}`, 'panorama_name', 'Graphics/Panoramas', t.panorama_name);
    add('Tileset', `#${i} ${t.name}`, 'fog_name', 'Graphics/Fogs', t.fog_name);
    add('Tileset', `#${i} ${t.name}`, 'battleback_name', 'Graphics/Battlebacks', t.battleback_name);
    (t.autotile_names ?? []).forEach((n: string) => add('Tileset', `#${i} ${t.name}`, 'autotile', 'Graphics/Autotiles', n));
  });
  each(await read('Actors.rxdata'), (a, i) => {
    add('Actor', `#${i} ${a.name}`, 'character_name', 'Graphics/Characters', a.character_name);
    add('Actor', `#${i} ${a.name}`, 'battler_name', 'Graphics/Battlers', a.battler_name);
  });
  each(await read('Enemies.rxdata'), (e, i) => add('Enemy', `#${i} ${e.name}`, 'battler_name', 'Graphics/Battlers', e.battler_name));
  each(await read('Animations.rxdata'), (a, i) => add('Animation', `#${i} ${a.name}`, 'animation_name', 'Graphics/Animations', a.animation_name));
  for (const file of ['Skills', 'Items', 'Weapons', 'Armors']) {
    each(await read(`${file}.rxdata`), (e, i) => add(file.slice(0, -1), `#${i} ${e.name}`, 'icon_name', 'Graphics/Icons', e.icon_name));
  }

  // Maps: bgm/bgs + event page character graphics
  if (includeMaps) {
    const infos = await read('MapInfos.rxdata');
    for (const id of Object.keys(infos ?? {})) {
      let map: any;
      try { map = await readRxdataFile<any>(getMapPath(projectPath, Number(id))); } catch { continue; }
      const tag = `Map${String(id).padStart(3, '0')} ${infos[id]?.name ?? ''}`.trim();
      add('Map', tag, 'bgm', 'Audio/BGM', map.bgm?.name);
      add('Map', tag, 'bgs', 'Audio/BGS', map.bgs?.name);
      for (const ev of Object.values(map.events ?? {}) as any[]) {
        (ev.pages ?? []).forEach((p: any, pi: number) =>
          add('Map', `${tag} ev${ev.id} p${pi}`, 'graphic.character_name', 'Graphics/Characters', p.graphic?.character_name));
      }
    }
  }

  const missing = refs.filter(r => !assetExists(projectPath, r.sub, r.name));
  return {
    ok: missing.length === 0,
    checked: refs.length,
    missing_count: missing.length,
    rtp: DEFAULT_RTP,
    missing: missing.map(m => ({ kind: m.kind, where: m.where, field: m.field, expected: `${m.sub}/${m.name}` })),
  };
}
