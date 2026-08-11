// FR-1 P1 test: map creation + tile primitives. Copies the RMXP template into a
// scratch project, then exercises create_map / fill_region / set_map_tiles /
// get_map_tiles and verifies byte-level construction and x-major placement.
// The render step needs RTP graphics and SKIPs if they're absent.
import { cp, rm, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { createMap, getMapTiles, setMapTiles, fillRegion, applyAutotile, getMap, getMapSizeAdvisory } from '../dist/tools/mapTools.js';
import { renderMap } from '../dist/tools/renderTools.js';
import { readRxdataFile } from '../dist/utils/rxdata.js';
import { MASK_TO_VARIANT } from '../dist/utils/autotileTable.js';
import { sanitizeAutotileCells, pathCells } from '../dist/tools/mapTools.js';

const RTP = process.env.RPGMAKER_RTP_PATH || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';
process.env.RPGMAKER_RTP_PATH = RTP;
const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data';
const PROJ = new URL('./scratch-authoring', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let passed = 0, failed = 0, skipped = 0;
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (err) {
    if (err && err.skip) { skipped++; console.log(`SKIP ${label}: ${err.message}`); }
    else { failed++; console.log(`FAIL ${label}: ${err.message}`); }
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!(await exists(join(TEMPLATE, 'MapInfos.rxdata')))) {
  console.log('SKIP all: RMXP template not found at ' + TEMPLATE);
  process.exit(0);
}
await rm(PROJ, { recursive: true, force: true });
await mkdir(join(PROJ, 'Data'), { recursive: true });
await cp(TEMPLATE, join(PROJ, 'Data'), { recursive: true });

let mapId;

await check('create_map: next id, defaults, all-zero Table, MapInfos entry', async () => {
  const infosBefore = await readRxdataFile(join(PROJ, 'Data/MapInfos.rxdata'));
  const expectId = Math.max(...Object.keys(infosBefore).map(Number)) + 1;
  const c = await createMap(PROJ, { name: 'Test Meadow', width: 24, height: 18, tilesetId: 1 });
  mapId = c.mapId;
  assert(c.mapId === expectId, `id ${c.mapId} != ${expectId}`);
  assert(c.size_advisory && c.size_advisory.screens === 4 && c.size_advisory.target_focal_points === 4, 'size advisory wrong: ' + JSON.stringify(c.size_advisory));
  const m = await getMap(PROJ, mapId, true);
  assert(m.width === 24 && m.height === 18 && m.tileset_id === 1, 'header wrong');
  assert(m.encounter_step === 30 && m.bgs.volume === 80 && m.bgm.volume === 100, 'audio/encounter defaults wrong');
  assert(m.data.xsize === 24 && m.data.ysize === 18 && m.data.zsize === 3 && m.data.dim === 3, 'Table dims wrong');
  assert(m.data.data.length === 24 * 18 * 3 && m.data.data.every(v => v === 0), 'Table not blank');
  const infos = await readRxdataFile(join(PROJ, 'Data/MapInfos.rxdata'));
  const info = infos[String(mapId)];
  assert(info && info.name === 'Test Meadow' && info.scroll_x === 320 && info.scroll_y === 240 && info.parent_id === 0, 'MapInfo wrong');
});

await check('size first: purpose picks default size + advisory; engine-min clamp', async () => {
  // purpose with no width/height -> default for that purpose (interior = 20x15, one screen)
  const i = await createMap(PROJ, { name: 'Shop', purpose: 'interior' });
  const im = await getMap(PROJ, i.mapId, true);
  assert(im.width === 20 && im.height === 15, `interior default ${im.width}x${im.height} != 20x15`);
  assert(i.size_advisory.screens === 1 && i.size_advisory.target_focal_points === 1, 'interior advisory wrong');
  assert(i.size_advisory.warnings.some(w => /defaulted from purpose/.test(w)), 'missing defaulted note');
  // below engine minimum -> clamped to 20x15, never blocked
  const t = await createMap(PROJ, { name: 'Tiny', width: 8, height: 8 });
  const tm = await getMap(PROJ, t.mapId, true);
  assert(tm.width === 20 && tm.height === 15, `clamp ${tm.width}x${tm.height} != 20x15`);
  assert(t.size_advisory.warnings.some(w => /clamped/.test(w)), 'missing clamp warning');
  // big overworld -> multi-screen warning steering toward a path network
  const o = await createMap(PROJ, { name: 'Wilds', purpose: 'overworld' });
  assert(o.size_advisory.screens >= 9 && o.size_advisory.warnings.some(w => /path network/.test(w)), 'overworld advisory wrong');
});

await check('get_map_size_advisory: existing map + purpose mismatch warns', async () => {
  const a = await getMapSizeAdvisory(PROJ, mapId); // the 24x18 Test Meadow
  assert(a.tiles === 24 * 18 && a.screens === 4, 'advisory math wrong');
  const mism = await getMapSizeAdvisory(PROJ, mapId, 'town'); // 24x18 is below a town's sweet spot
  assert(mism.warnings.some(w => /small for a town/.test(w)), 'purpose mismatch not warned: ' + JSON.stringify(mism.warnings));
});

await check('fill_region: whole layer + sub-rect, x-major placement', async () => {
  await fillRegion(PROJ, mapId, 0, 48);
  const r = await fillRegion(PROJ, mapId, 0, 96, { x: 9, y: 7, w: 4, h: 3 });
  assert(r.written === 12, `wrote ${r.written}`);
  const g = await getMapTiles(PROJ, mapId, 0, { x: 8, y: 6, w: 3, h: 3 });
  // (8,6)=background 48; (9,7)/(10,7)=pond 96
  assert(g.tiles[0][0] === 48 && g.tiles[1][1] === 96 && g.tiles[1][2] === 96, 'placement wrong: ' + JSON.stringify(g.tiles));
});

await check('set_map_tiles: stamp block + out-of-bounds clipping', async () => {
  const r = await setMapTiles(PROJ, mapId, 1, 22, 0, [[384, 385, 386]]); // last col would overflow x (24 wide → x22,23 valid, x24 clipped)
  assert(r.written === 2, `wrote ${r.written} (expected 2 after clip)`);
  const g = await getMapTiles(PROJ, mapId, 1, { x: 22, y: 0, w: 2, h: 1 });
  assert(g.tiles[0][0] === 384 && g.tiles[0][1] === 385, 'stamp wrong: ' + JSON.stringify(g.tiles));
});

await check('layer isolation: writing layer 0 leaves layers 1/2 intact', async () => {
  const g2 = await getMapTiles(PROJ, mapId, 2);
  assert(g2.tiles.every(row => row.every(v => v === 0)), 'layer 2 unexpectedly modified');
});

await check('autotile placement table integrity (256 entries, anchors, diagonal-irrelevance)', async () => {
  assert(MASK_TO_VARIANT.length === 256, `length ${MASK_TO_VARIANT.length}`);
  assert(MASK_TO_VARIANT.every(v => Number.isInteger(v) && v >= 0 && v <= 47), 'variant out of 0..47');
  assert(MASK_TO_VARIANT[0] === 47, 'isolated(0) should be 47');
  assert(MASK_TO_VARIANT[255] === 0, 'full(255) should be 0');
  assert(MASK_TO_VARIANT[15] === 15, 'all-cardinals-no-diagonals(15) should be 15');
  // a diagonal bit must not change the variant unless both its cardinals are set
  const N = 0x01, E = 0x02, NE = 0x10;
  for (let m = 0; m < 256; m++) {
    if ((m & (N | E)) !== (N | E)) { // N&E not both present -> NE irrelevant
      assert(MASK_TO_VARIANT[m] === MASK_TO_VARIANT[m ^ NE], `NE changed variant at mask ${m} without N&E`);
    }
  }
});

await check('autotile-safe topology: sanitizer 4-connects, path has no diagonal pinches', async () => {
  const diagOnly = (cells) => {
    const s = new Set(cells.map(c => c.join(',')));
    let bad = 0;
    for (const [x, y] of cells) for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      if (s.has(`${x + dx},${y + dy}`) && !s.has(`${x + dx},${y}`) && !s.has(`${x},${y + dy}`)) bad++;
    return bad;
  };
  const stair = [[0, 0], [1, 1], [2, 2], [3, 3]];
  assert(diagOnly(stair) > 0, 'test setup: staircase should have pinches');
  assert(diagOnly(sanitizeAutotileCells(stair)) === 0, 'sanitizer left diagonal pinches');
  assert(diagOnly(pathCells([[5, 0], [5, 6], [10, 6], [10, 10]], 2)) === 0, 'path has diagonal pinches');
});

await check('apply_autotile: isolated cell -> variant 47, filled interior -> variant 0', async () => {
  const c = await createMap(PROJ, { name: 'AT', width: 8, height: 8, tilesetId: 1 });
  // single isolated water cell (slot 0): id should be 48 + 47
  await applyAutotile(PROJ, c.mapId, 0, 0, { region: { x: 3, y: 3, w: 1, h: 1 } });
  let g = await getMapTiles(PROJ, c.mapId, 0, { x: 3, y: 3, w: 1, h: 1 });
  assert(g.tiles[0][0] === 48 + 47, `isolated got ${g.tiles[0][0]} (expected ${48 + 47})`);
  // fill a 5x5 block; the centre cell is fully surrounded -> variant 0 -> id 48
  await applyAutotile(PROJ, c.mapId, 1, 0, { region: { x: 1, y: 1, w: 5, h: 5 } });
  g = await getMapTiles(PROJ, c.mapId, 1, { x: 3, y: 3, w: 1, h: 1 });
  assert(g.tiles[0][0] === 48, `interior got ${g.tiles[0][0]} (expected 48)`);
});

await check('render the painted map (visual pipeline)', async () => {
  if (!(await exists(join(RTP, 'Graphics/Tilesets')))) throw Object.assign(new Error('RTP graphics absent'), { skip: true });
  const r = await renderMap(PROJ, mapId, { outPath: join(PROJ, 'preview.png') });
  assert(r.pixel_w === 24 * 32 && r.pixel_h === 18 * 32, `size ${r.pixel_w}x${r.pixel_h}`);
  assert(r.notes.length === 0, `notes: ${r.notes.join('; ')}`);
});

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
