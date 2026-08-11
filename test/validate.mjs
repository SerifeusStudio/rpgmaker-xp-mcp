// FR-15 asset validator test. Copies the template, confirms a clean project
// validates, then breaks a reference and confirms it's reported. SKIPs if the
// RMXP template/RTP graphics are absent.
import { cp, rm, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { validateAssets } from '../dist/tools/assetTools.js';
import { readRxdataFile, writeRxdataFile } from '../dist/utils/rxdata.js';

const RTP = process.env.RPGMAKER_RTP_PATH || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';
process.env.RPGMAKER_RTP_PATH = RTP;
const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data';
const PROJ = new URL('./scratch-assets', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let passed = 0, failed = 0;
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (err) { failed++; console.log(`FAIL ${label}: ${err.message}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

if (!(await exists(join(TEMPLATE, 'System.rxdata'))) || !(await exists(join(RTP, 'Graphics/Battlers')))) {
  console.log('SKIP all: RMXP template/RTP not found'); process.exit(0);
}
await rm(PROJ, { recursive: true, force: true });
await mkdir(join(PROJ, 'Data'), { recursive: true });
await cp(TEMPLATE, join(PROJ, 'Data'), { recursive: true });

await check('clean template validates (every reference resolves via RTP)', async () => {
  const r = await validateAssets(PROJ);
  assert(r.checked > 100, `only checked ${r.checked} refs`);
  assert(r.ok && r.missing_count === 0, `unexpected missing: ${JSON.stringify(r.missing.slice(0, 3))}`);
});

await check('a broken battler reference is reported with context', async () => {
  const actors = await readRxdataFile(join(PROJ, 'Data/Actors.rxdata'));
  actors[1].battler_name = 'DoesNotExist123';
  await writeRxdataFile(join(PROJ, 'Data/Actors.rxdata'), actors);
  const r = await validateAssets(PROJ);
  assert(!r.ok && r.missing_count >= 1, 'break not detected');
  const hit = r.missing.find(m => m.expected.endsWith('DoesNotExist123'));
  assert(hit && hit.kind === 'Actor' && hit.field === 'battler_name', 'wrong report: ' + JSON.stringify(r.missing[0]));
});

await rm(PROJ, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
