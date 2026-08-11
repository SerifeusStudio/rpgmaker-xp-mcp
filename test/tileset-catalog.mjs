import { access, copyFile, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import {
  createTilesetIdentificationHarness,
  getTilesetCatalog,
  saveTilesetCatalog,
  validateTilesetCatalog,
} from '../dist/tools/tilesetCatalogTools.js';

const RTP = process.env.RPGMAKER_RTP_PATH
  || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';
process.env.RPGMAKER_RTP_PATH = RTP;

const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System';
const OUT = new URL('./tileset-catalog-out', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PROJECT = join(OUT, 'project');
const HARNESS = join(OUT, 'harness');

let passed = 0, failed = 0, skipped = 0;
const exists = async p => { try { await access(p); return true; } catch { return false; } };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function check(label, fn) {
  try { await fn(); passed++; console.log(`PASS ${label}`); }
  catch (error) {
    if (error?.skip) { skipped++; console.log(`SKIP ${label}: ${error.message}`); }
    else { failed++; console.log(`FAIL ${label}: ${error.message}`); }
  }
}

await rm(OUT, { recursive: true, force: true });
await mkdir(join(PROJECT, 'Data'), { recursive: true });

if (!(await exists(join(TEMPLATE, 'Data', 'Tilesets.rxdata')))
    || !(await exists(join(RTP, 'Graphics', 'Tilesets')))) {
  console.log('SKIP tileset catalog integration: Steam template or RTP graphics unavailable');
  process.exit(0);
}
await copyFile(join(TEMPLATE, 'Data', 'Tilesets.rxdata'), join(PROJECT, 'Data', 'Tilesets.rxdata'));

let manifest;

await check('generate complete evidence bundle', async () => {
  const result = await createTilesetIdentificationHarness(PROJECT, 1, { scale: 2, outDir: HARNESS });
  assert(result.tileset.id === 1, `tileset ${result.tileset.id}`);
  for (const relative of [
    'source.png', 'source-labeled.png', 'manifest.json', 'catalog.template.json', 'catalog.json',
    'index.html', 'README.md', 'tiles/384.png', 'rows/row-00.png',
  ]) assert(await exists(join(HARNESS, relative)), `missing ${relative}`);

  manifest = JSON.parse(await readFile(join(HARNESS, 'manifest.json'), 'utf8'));
  assert(manifest.tileset.cols === 8, `columns ${manifest.tileset.cols}`);
  assert(manifest.regular_tiles.length === manifest.tileset.rows * 8, 'tile count does not match source grid');
  assert(manifest.regular_tiles[0].id === 384, 'regular tile ids must start at 384');
  assert(manifest.regular_tiles.every(t => t.alpha && Array.isArray(t.engine_hints)), 'engine evidence missing');
  assert(manifest.autotiles.length === 7, 'must describe all seven autotile slots');
  assert((await readFile(join(HARNESS, 'index.html'), 'utf8')).includes('Create object grid'), 'interactive reviewer missing');
});

await check('save incremental creator semantics and object grids', async () => {
  const fact = manifest.regular_tiles.find(t => t.alpha.coverage === 1 && t.priority === 0)
    || manifest.regular_tiles[0];
  const result = await saveTilesetCatalog(PROJECT, 1, {
    entries: [{
      id: fact.id,
      label: 'review fixture tile',
      category: 'terrain',
      placement: 'standalone',
      recommended_layer: 0,
      confidence: 'confirmed',
      usage: 'Integration-test fixture only.',
      evidence: ['source sheet', 'isolated tile', 'engine facts'],
    }],
    objects: [{
      id: 'fixture-object',
      label: 'fixture object',
      category: 'prop',
      recommended_layer: 1,
      confidence: 'tentative',
      usage: 'Exercises rectangular object storage.',
      grid: [[384, 385]],
    }],
    autotiles: [{
      slot: 0,
      label: 'fixture autotile',
      category: 'terrain',
      recommended_layer: 0,
      confidence: 'tentative',
      usage: 'Exercises autotile notes.',
    }],
  });
  assert(result.validation.ok, result.validation.errors.join('; '));
  assert(await exists(result.path), 'catalog was not written');
});

await check('read and round-trip the browser-exported catalog JSON', async () => {
  const before = await getTilesetCatalog(PROJECT, 1);
  assert(before.found && before.summary.reviewed_tiles >= 1, 'saved catalog not found');
  const reviewedBefore = before.summary.reviewed_tiles;
  const exported = structuredClone(before.catalog);
  const newId = manifest.regular_tiles.find(t => !before.catalog.tiles[String(t.id)]).id;
  exported.tiles[String(newId)] = {
    id: newId,
    label: 'second fixture tile',
    category: 'unknown',
    placement: 'unknown',
    recommended_layer: null,
    confidence: 'tentative',
    usage: 'Full catalog import fixture.',
  };
  await saveTilesetCatalog(PROJECT, 1, { catalog: exported });
  const after = await getTilesetCatalog(PROJECT, 1);
  assert(after.summary.reviewed_tiles === reviewedBefore + 1, `reviewed ${after.summary.reviewed_tiles}`);
  assert(after.catalog.objects['fixture-object'], 'object lost during full import');
});

await check('validator warns about semantic/engine contradictions', async () => {
  const transparent = manifest.regular_tiles.find(t => t.alpha.coverage < 1);
  assert(transparent, 'fixture tileset has no transparent tile');
  await saveTilesetCatalog(PROJECT, 1, {
    entries: [{
      id: transparent.id,
      label: 'deliberate bad layer fixture',
      category: 'overlay',
      placement: 'standalone',
      recommended_layer: 0,
      confidence: 'likely',
      usage: 'Must trigger transparent-z0 warning.',
    }],
  });
  const result = await validateTilesetCatalog(PROJECT, 1, false);
  assert(result.ok, result.errors.join('; '));
  assert(result.warnings.some(w => w.includes('transparent tile recommended for z0')), result.warnings.join('; '));
});

await check('validator rejects invalid semantic categories', async () => {
  let rejected = false;
  try {
    await saveTilesetCatalog(PROJECT, 1, { entries: [{ id: 384, category: 'definitely-a-window-fence' }] });
  } catch (error) {
    rejected = String(error.message).includes('invalid category');
  }
  assert(rejected, 'invalid category was accepted');
});

await check('validator rejects numeric object gaps and invalid object metadata', async () => {
  let rejected = false;
  try {
    await saveTilesetCatalog(PROJECT, 1, {
      objects: [{
        id: 'invalid-object',
        category: 'definitely-a-window-fence',
        grid: [[384, 0]],
      }],
    });
  } catch (error) {
    const message = String(error.message);
    rejected = message.includes('invalid category') && message.includes('use null, not numeric 0');
  }
  assert(rejected, 'invalid object metadata or numeric gap was accepted');
});

await check('validator rejects fully transparent object cells', async () => {
  const blank = manifest.regular_tiles.find(t => t.alpha.coverage === 0);
  assert(blank, 'fixture tileset has no fully transparent regular tile');
  let rejected = false;
  try {
    await saveTilesetCatalog(PROJECT, 1, {
      objects: [{ id: 'blank-object', category: 'prop', grid: [[blank.id]] }],
    });
  } catch (error) {
    rejected = String(error.message).includes(`tile ${blank.id} is fully transparent`);
  }
  assert(rejected, 'fully transparent object cell was accepted');
});

await check('validator rejects invalid autotile metadata', async () => {
  let rejected = false;
  try {
    await saveTilesetCatalog(PROJECT, 1, {
      autotiles: [{ slot: 0, category: 'definitely-a-window-fence' }],
    });
  } catch (error) {
    rejected = String(error.message).includes('autotile 0: invalid category');
  }
  assert(rejected, 'invalid autotile category was accepted');
});

await check('strict mode reports every unreviewed regular tile', async () => {
  const result = await validateTilesetCatalog(PROJECT, 1, true);
  assert(!result.ok, 'strict validation should fail for a partial catalog');
  assert(result.errors.some(e => e.includes('remain unreviewed')), result.errors.join('; '));
});

console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
