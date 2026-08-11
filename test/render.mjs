// FR-50 map renderer test. Validates the autotile table integrity and renders
// real maps to PNG: the Steam template Map001 (flat grass) and the bundled
// Valentine90-ABS "Montanha" map (water/cliff/path autotiles + regular tiles +
// events + passability — the case that exercises distinct autotile variants).
//
// Renders need local RMXP graphics (the Steam RTP install + the library/ fixture);
// those checks SKIP rather than fail when the assets are absent, like the other
// integration tests in this suite. The table-integrity check always runs.
import { mkdir, rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import { renderMap, renderTilesetAtlas } from '../dist/tools/renderTools.js';
import { AUTOTILE_INDEX } from '../dist/utils/autotileTable.js';

const RTP = process.env.RPGMAKER_RTP_PATH
  || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';
process.env.RPGMAKER_RTP_PATH = RTP;

const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System';
const ABS = new URL('../library/Valentine90-ABS', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const OUT = new URL('./render-out', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

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
const skipUnless = async (p, what) => { if (!(await exists(p))) throw Object.assign(new Error(`${what} not found at ${p}`), { skip: true }); };
function pngDims(buf) {
  assert(buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG', 'not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await check('autotile table is 192 entries (48 variants x 4 quadrants), all 0..47', async () => {
  assert(AUTOTILE_INDEX.length === 192, `length ${AUTOTILE_INDEX.length}`);
  assert(AUTOTILE_INDEX.every(v => Number.isInteger(v) && v >= 0 && v <= 47), 'sub-tile index out of 0..47');
});

await check('render template Map001 (640x480, flat grass, no missing graphics)', async () => {
  await skipUnless(join(TEMPLATE, 'Data/Map001.rxdata'), 'Steam template');
  await skipUnless(join(RTP, 'Graphics/Tilesets'), 'RTP graphics');
  const out = join(OUT, 'map001.png');
  const r = await renderMap(TEMPLATE, 1, { outPath: out });
  assert(r.pixel_w === 640 && r.pixel_h === 480, `got ${r.pixel_w}x${r.pixel_h}`);
  assert(r.notes.length === 0, `notes: ${r.notes.join('; ')}`);
  const { w, h } = pngDims(await readFile(out));
  assert(w === 640 && h === 480, `PNG ${w}x${h}`);
});

await check('render Valentine90 Montanha (autotile edges + regular tiles, no notes)', async () => {
  await skipUnless(join(ABS, 'Data/Map001.rxdata'), 'Valentine90 fixture');
  await skipUnless(join(RTP, 'Graphics/Tilesets'), 'RTP graphics');
  const out = join(OUT, 'montanha.png');
  const r = await renderMap(ABS, 1, { outPath: out });
  assert(r.tileset.name === '004-Mountain01', `tileset ${r.tileset.name}`);
  assert(r.notes.length === 0, `notes: ${r.notes.join('; ')}`);
  const buf = await readFile(out);
  pngDims(buf);
  assert(buf.length > 10000, `suspiciously small PNG (${buf.length} bytes)`);
});

await check('overlays: events legend + passability tint render without notes', async () => {
  await skipUnless(join(ABS, 'Data/Map001.rxdata'), 'Valentine90 fixture');
  await skipUnless(join(RTP, 'Graphics/Tilesets'), 'RTP graphics');
  const r = await renderMap(ABS, 1, { outPath: join(OUT, 'overlays.png'), drawEvents: true, passability: true, drawGrid: true });
  assert(Array.isArray(r.events) && r.events.length === 10, `events ${r.events?.length}`);
  assert(r.events[0].name && typeof r.events[0].x === 'number', 'event legend missing fields');
  assert(r.notes.length === 0, `notes: ${r.notes.join('; ')}`);
});

await check('render_tileset_atlas: labeled atlas with slot legend + id range', async () => {
  await skipUnless(join(RTP, 'Graphics/Tilesets'), 'RTP graphics');
  const r = await renderTilesetAtlas(TEMPLATE, 1, { scale: 2, outPath: join(OUT, 'atlas.png') });
  assert(r.tileset.name === '001-Grassland01', `tileset ${r.tileset.name}`);
  assert(r.grid.cols === 8 && r.grid.id_range[0] === 384, `grid ${JSON.stringify(r.grid)}`);
  assert(Array.isArray(r.autotile_slots) && r.autotile_slots.length === 7, `slots ${r.autotile_slots?.length}`);
  assert(r.autotile_slots[4].name === '041-Grass01' && r.autotile_slots[4].base_id === 240, 'slot 4 wrong');
  const buf = await readFile(join(OUT, 'atlas.png'));
  pngDims(buf);
  assert(buf.length > 10000, 'atlas suspiciously small');
});

await check('region crop + scale produce expected pixel dimensions', async () => {
  await skipUnless(join(TEMPLATE, 'Data/Map001.rxdata'), 'Steam template');
  await skipUnless(join(RTP, 'Graphics/Tilesets'), 'RTP graphics');
  const r = await renderMap(TEMPLATE, 1, { region: { x: 2, y: 2, w: 5, h: 4 }, scale: 2, outPath: join(OUT, 'crop.png') });
  assert(r.pixel_w === 5 * 32 * 2 && r.pixel_h === 4 * 32 * 2, `got ${r.pixel_w}x${r.pixel_h}`);
});

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
