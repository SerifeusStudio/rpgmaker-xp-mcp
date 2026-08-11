// FR-2 test: map connectivity (Transfer Player events + world-graph validation).
// Copies the RMXP template, creates a couple of maps, wires them with transfer
// events, and checks the 201 command shape + the validator (broken targets,
// out-of-bounds, orphans, reachability, dynamic transfers).
import { cp, rm, mkdir, access } from 'fs/promises';
import { join } from 'path';
import {
  createMap, createTransferEvent, validateWorldGraph, getMapEvent, createMapEvent, addEventCommand,
} from '../dist/tools/mapTools.js';
import { updateStartingPosition } from '../dist/tools/systemTools.js';

const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data';
const PROJ = new URL('./scratch-connectivity', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let passed = 0, failed = 0, skipped = 0;
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (err) { failed++; console.log(`FAIL ${label}: ${err.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!(await exists(join(TEMPLATE, 'MapInfos.rxdata')))) {
  console.log('SKIP all: RMXP template not found at ' + TEMPLATE);
  process.exit(0);
}
await rm(PROJ, { recursive: true, force: true });
await mkdir(join(PROJ, 'Data'), { recursive: true });
await cp(TEMPLATE, join(PROJ, 'Data'), { recursive: true });

// Two maps: a town and a cave.
const town = (await createMap(PROJ, { name: 'Town', width: 30, height: 25, tilesetId: 1 })).mapId;
const cave = (await createMap(PROJ, { name: 'Cave', width: 20, height: 15, tilesetId: 1 })).mapId;
await updateStartingPosition(PROJ, town, 5, 5);

await check('create_transfer_event: writes a valid 201 command (door, action trigger)', async () => {
  const r = await createTransferEvent(PROJ, town, {
    x: 10, y: 8, targetMapId: cave, targetX: 3, targetY: 12, trigger: 0, direction: 2,
    graphic: { tileId: 384 },
  });
  assert(r.eventId >= 1 && r.target.mapId === cave, 'return shape wrong');
  const ev = await getMapEvent(PROJ, town, r.eventId);
  const cmd = ev.pages[0].list.find(c => c.code === 201);
  assert(cmd, 'no 201 command');
  assert(JSON.stringify(cmd.parameters) === JSON.stringify([0, cave, 3, 12, 2, 0]), 'param layout wrong: ' + JSON.stringify(cmd.parameters));
  assert(ev.pages[0].trigger === 0, 'trigger not action button');
  assert(ev.pages[0].graphic.tile_id === 384, 'graphic not set');
});

await check('create_transfer_event: rejects out-of-bounds target', async () => {
  let threw = false;
  try { await createTransferEvent(PROJ, town, { x: 1, y: 1, targetMapId: cave, targetX: 99, targetY: 99 }); }
  catch (e) { threw = /out of bounds/.test(e.message); }
  assert(threw, 'should reject out-of-bounds target');
});

await check('create_transfer_event: rejects non-existent target map', async () => {
  let threw = false;
  try { await createTransferEvent(PROJ, town, { x: 1, y: 1, targetMapId: 9999, targetX: 1, targetY: 1 }); }
  catch (e) { threw = /does not exist/.test(e.message); }
  assert(threw, 'should reject missing target map');
});

await check('validate_connectivity: cave reachable from town, no errors, diagram emitted', async () => {
  // add the return transfer cave -> town so both are linked
  await createTransferEvent(PROJ, cave, { x: 3, y: 12, targetMapId: town, targetX: 10, targetY: 9, trigger: 1 });
  const g = await validateWorldGraph(PROJ, { diagram: true });
  assert(g.summary.ok && g.errors.length === 0, 'errors: ' + JSON.stringify(g.errors));
  assert(g.summary.transfers === 2, 'expected 2 transfers, got ' + g.summary.transfers);
  assert(g.start_map_id === town, 'start map wrong');
  assert(!g.unreachable.includes(cave), 'cave should be reachable');
  assert(typeof g.diagram_mermaid === 'string' && g.diagram_mermaid.includes('flowchart'), 'no mermaid diagram');
});

await check('validate_connectivity: detects a broken transfer to a deleted-coords map', async () => {
  // hand-author a transfer to an out-of-bounds coord via raw command, bypassing create validation
  const ev = await createMapEvent(PROJ, town, { name: 'bad_door', x: 2, y: 2 });
  await addEventCommand(PROJ, town, ev.id, 0, { code: 201, parameters: [0, cave, 50, 50, 0, 0] });
  const g = await validateWorldGraph(PROJ);
  assert(!g.summary.ok && g.errors.some(e => /out of bounds/.test(e)), 'should flag out-of-bounds transfer: ' + JSON.stringify(g.errors));
  assert(g.summary.broken_transfers >= 1, 'broken_transfers not counted');
});

await check('validate_connectivity: flags orphan + dynamic transfer', async () => {
  // an orphan map with no inbound transfer
  const island = (await createMap(PROJ, { name: 'Island', width: 20, height: 15, tilesetId: 1 })).mapId;
  // a dynamic (variable-designated) transfer from town
  const ev = await createMapEvent(PROJ, town, { name: 'dyn', x: 3, y: 3 });
  await addEventCommand(PROJ, town, ev.id, 0, { code: 201, parameters: [1, 1, 2, 3, 0, 0] });
  const g = await validateWorldGraph(PROJ);
  assert(g.orphans.includes(island), 'island should be an orphan');
  assert(g.summary.dynamic_transfers >= 1, 'dynamic transfer not counted');
  assert(g.warnings.some(w => /variable designation/.test(w)), 'no dynamic-transfer warning');
});

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
