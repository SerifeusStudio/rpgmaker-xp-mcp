import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readRxdataFile } from '../utils/rxdata.js';
import { getDataPath } from '../utils/fileHandler.js';
import {
  Canvas, blit, decodePng, drawGrid, drawLabel, encodePng, makeCanvas,
  resolveGraphic, scaleCanvas,
} from '../utils/tiles.js';

const DEFAULT_RTP = process.env.RPGMAKER_RTP_PATH
  || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';

const SCHEMA_VERSION = 1;
const CATEGORIES = new Set([
  'unknown', 'terrain', 'overlay', 'water', 'path', 'wall', 'fence',
  'vegetation', 'prop', 'resource', 'building', 'roof', 'window', 'door',
  'stairs', 'bridge', 'sign', 'furniture', 'effect',
]);
const CONFIDENCE = new Set(['unknown', 'tentative', 'likely', 'confirmed']);
const PLACEMENT = new Set(['unknown', 'standalone', 'object_part', 'variant', 'autotile']);

interface AlphaStats {
  coverage: number;
  transparent_pixels: number;
  partial_pixels: number;
  opaque_pixels: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  edge_coverage: { top: number; right: number; bottom: number; left: number };
}

interface EngineTileFact {
  id: number;
  row: number;
  col: number;
  priority: number;
  passage_raw: number;
  blocked_directions: string[];
  fully_blocked: boolean;
  bush: boolean;
  counter: boolean;
  extra_flags: number;
  alpha: AlphaStats;
  engine_hints: string[];
  image: string;
  row_image: string;
}

interface HarnessManifest {
  schema_version: number;
  generated_at: string;
  tileset: {
    id: number;
    database_name: string;
    graphic_name: string;
    source_path: string;
    cols: number;
    rows: number;
    id_range: [number, number];
  };
  autotiles: Array<{
    slot: number;
    name: string;
    base_id: number;
    image: string | null;
    alpha: AlphaStats | null;
    engine_hints: string[];
  }>;
  regular_tiles: EngineTileFact[];
  review_rules: string[];
}

interface TilesetCatalog {
  schema_version: number;
  tileset_id: number;
  tileset_name: string;
  graphic_name: string;
  updated_at: string | null;
  tiles: Record<string, any>;
  objects: Record<string, any>;
  autotiles: Record<string, any>;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function padId(id: number): string {
  return String(id).padStart(3, '0');
}

function catalogDir(projectPath: string, tilesetId: number): string {
  return join(projectPath, 'Data', '.mcp-tilecatalog', padId(tilesetId));
}

function catalogPath(projectPath: string, tilesetId: number): string {
  return join(catalogDir(projectPath, tilesetId), 'catalog.json');
}

async function loadTileset(projectPath: string, tilesetId: number): Promise<{ ts: any; image: Canvas; sourcePath: string; cols: number; rows: number }> {
  const tilesets = await readRxdataFile<any[]>(getDataPath(projectPath, 'Tilesets.rxdata'));
  const ts = tilesets?.[tilesetId];
  if (!ts) throw new Error(`Tileset ${tilesetId} not found`);
  const sourcePath = resolveGraphic(projectPath, DEFAULT_RTP, 'Tilesets', ts.tileset_name);
  if (!sourcePath) throw new Error(`tileset graphic '${ts.tileset_name}' not found`);
  const image = await decodePng(sourcePath);
  if (image.width % 32 !== 0 || image.height % 32 !== 0) {
    throw new Error(`tileset graphic must be divisible by 32px (got ${image.width}x${image.height})`);
  }
  if (image.width !== 256) {
    throw new Error(`RPG Maker XP tilesets must be exactly 8 tiles / 256px wide (got ${image.width}px)`);
  }
  return { ts, image, sourcePath, cols: image.width / 32, rows: image.height / 32 };
}

function crop(src: Canvas, sx: number, sy: number, w: number, h: number): Canvas {
  const out = makeCanvas(w, h);
  blit(out, src, sx, sy, w, h, 0, 0);
  return out;
}

function alphaStats(src: Canvas): AlphaStats {
  let transparent = 0, partial = 0, opaque = 0;
  let minX = src.width, minY = src.height, maxX = -1, maxY = -1;
  const edges = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const a = src.data[(y * src.width + x) * 4 + 3];
      if (a === 0) transparent++;
      else {
        if (a === 255) opaque++; else partial++;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        if (y === 0) edges.top++;
        if (x === src.width - 1) edges.right++;
        if (y === src.height - 1) edges.bottom++;
        if (x === 0) edges.left++;
      }
    }
  }
  const total = src.width * src.height;
  return {
    coverage: Number(((opaque + partial) / total).toFixed(4)),
    transparent_pixels: transparent,
    partial_pixels: partial,
    opaque_pixels: opaque,
    bbox: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    edge_coverage: {
      top: Number((edges.top / src.width).toFixed(3)),
      right: Number((edges.right / src.height).toFixed(3)),
      bottom: Number((edges.bottom / src.width).toFixed(3)),
      left: Number((edges.left / src.height).toFixed(3)),
    },
  };
}

function passageFacts(raw: number): Pick<EngineTileFact, 'blocked_directions' | 'fully_blocked' | 'bush' | 'counter' | 'extra_flags'> {
  const directional = raw & 0x0f;
  const blocked: string[] = [];
  if (directional & 1) blocked.push('down');
  if (directional & 2) blocked.push('left');
  if (directional & 4) blocked.push('right');
  if (directional & 8) blocked.push('up');
  return {
    blocked_directions: blocked,
    fully_blocked: directional === 15,
    bush: (raw & 64) !== 0,
    counter: (raw & 128) !== 0,
    extra_flags: raw & ~0xcf,
  };
}

function tileHints(priority: number, passage: number, alpha: AlphaStats): string[] {
  const hints: string[] = [];
  if (priority > 0) hints.push('priority>0: overhead/occluding candidate');
  else hints.push('priority=0: terrain or ground-clutter candidate');
  const direction = passage & 0x0f;
  if (direction === 15) hints.push('fully blocked');
  else if (direction !== 0) hints.push('directionally blocked');
  else hints.push('passable');
  if (alpha.coverage === 0) hints.push('fully transparent/blank');
  else if (alpha.coverage < 1) hints.push('transparent pixels: overlay or multi-tile object part');
  else hints.push('fully opaque');
  if (alpha.edge_coverage.top > 0.75 && alpha.edge_coverage.bottom > 0.75
      && alpha.edge_coverage.left > 0.75 && alpha.edge_coverage.right > 0.75) {
    hints.push('fills most edges: terrain/floor or interior object tile candidate');
  }
  return hints;
}

async function buildManifest(projectPath: string, tilesetId: number): Promise<{ manifest: HarnessManifest; image: Canvas; ts: any }> {
  const { ts, image, sourcePath, cols, rows } = await loadTileset(projectPath, tilesetId);
  const priorities: number[] = ts.priorities?.data ?? [];
  const passages: number[] = ts.passages?.data ?? [];
  const regularTiles: EngineTileFact[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = 384 + row * cols + col;
      const tile = crop(image, col * 32, row * 32, 32, 32);
      const alpha = alphaStats(tile);
      const priority = priorities[id] ?? 0;
      const passage = passages[id] ?? 0;
      regularTiles.push({
        id, row, col, priority, passage_raw: passage,
        ...passageFacts(passage), alpha,
        engine_hints: tileHints(priority, passage, alpha),
        image: `tiles/${id}.png`,
        row_image: `rows/row-${String(row).padStart(2, '0')}.png`,
      });
    }
  }

  const autotiles = [];
  const names: string[] = ts.autotile_names ?? [];
  for (let slot = 0; slot < 7; slot++) {
    const name = names[slot] ?? '';
    let alpha: AlphaStats | null = null;
    const hints: string[] = [];
    if (name) {
      const path = resolveGraphic(projectPath, DEFAULT_RTP, 'Autotiles', name);
      if (path) {
        const source = await decodePng(path);
        alpha = alphaStats(source);
        hints.push(alpha.coverage < 1
          ? 'contains transparency: inspect whether it is an overlay before choosing z0'
          : 'opaque source: solid-ground candidate');
      } else hints.push('graphic missing');
    } else hints.push('unused slot');
    autotiles.push({
      slot, name, base_id: 48 * (slot + 1),
      image: name ? `autotiles/slot-${slot}.png` : null,
      alpha, engine_hints: hints,
    });
  }

  return {
    ts, image,
    manifest: {
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      tileset: {
        id: tilesetId,
        database_name: ts.name ?? '',
        graphic_name: ts.tileset_name,
        source_path: sourcePath,
        cols, rows,
        id_range: [384, 384 + cols * rows - 1],
      },
      autotiles,
      regular_tiles: regularTiles,
      review_rules: [
        'Engine hints are evidence, not semantic labels.',
        'Inspect adjacent source tiles before declaring a tile standalone.',
        'Record multi-tile objects as a rectangular grid; do not infer a final row from visual proximity alone.',
        'Use confirmed confidence only after checking the isolated tile, its source row, and the full source sheet.',
        'Transparent regular tiles on z0 require special scrutiny; they may expose black without an underlayer.',
      ],
    },
  };
}

function blankCatalog(manifest: HarnessManifest): TilesetCatalog {
  return {
    schema_version: SCHEMA_VERSION,
    tileset_id: manifest.tileset.id,
    tileset_name: manifest.tileset.database_name,
    graphic_name: manifest.tileset.graphic_name,
    updated_at: null,
    tiles: {}, objects: {}, autotiles: {},
  };
}

async function readCatalog(projectPath: string, tilesetId: number, fallback?: HarnessManifest): Promise<TilesetCatalog> {
  const path = catalogPath(projectPath, tilesetId);
  if (!(await exists(path))) {
    if (!fallback) {
      const { manifest } = await buildManifest(projectPath, tilesetId);
      fallback = manifest;
    }
    return blankCatalog(fallback);
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

function summary(catalog: TilesetCatalog, manifest: HarnessManifest) {
  const reviewed = Object.keys(catalog.tiles ?? {}).length;
  return {
    regular_tiles: manifest.regular_tiles.length,
    reviewed_tiles: reviewed,
    unreviewed_tiles: Math.max(0, manifest.regular_tiles.length - reviewed),
    objects: Object.keys(catalog.objects ?? {}).length,
    reviewed_autotiles: Object.keys(catalog.autotiles ?? {}).length,
  };
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

function harnessHtml(manifest: HarnessManifest, catalog: TilesetCatalog): string {
  const categories = [...CATEGORIES];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tileset ${manifest.tileset.id} identification harness</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,Consolas,monospace}body{margin:0;background:#11151a;color:#e6edf3}header{padding:14px 18px;background:#1b222b;position:sticky;top:0;z-index:20;border-bottom:1px solid #39424e}h1{font-size:18px;margin:0 0 6px}.sub{color:#9fb0c3;font-size:12px}.layout{display:grid;grid-template-columns:minmax(600px,1fr) 390px;gap:14px;padding:14px}.panel{background:#171d24;border:1px solid #343e49;border-radius:8px;padding:12px}.source-wrap{overflow:auto;max-height:72vh}.source{position:relative;width:${manifest.tileset.cols * 64}px;height:${manifest.tileset.rows * 64}px;background:#bbb}.source>img{width:100%;height:100%;image-rendering:pixelated}.hit{position:absolute;width:64px;height:64px;border:1px solid rgba(255,255,255,.12);box-sizing:border-box;cursor:pointer}.hit:hover{border:2px solid #62d2ff}.hit.selected{border:3px solid #ffcf4a;background:rgba(255,207,74,.12)}.hit.reviewed:after{content:'OK';position:absolute;right:2px;bottom:1px;color:#74e39a;text-shadow:0 1px 2px #000;font-size:9px}.facts{font-size:12px;line-height:1.45;white-space:pre-wrap}.preview{display:flex;gap:10px;align-items:flex-start}.tile-img{width:128px;height:128px;image-rendering:pixelated;background-color:#ddd;background-image:linear-gradient(45deg,#aaa 25%,transparent 25%),linear-gradient(-45deg,#aaa 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#aaa 75%),linear-gradient(-45deg,transparent 75%,#aaa 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}.row-img{max-width:100%;image-rendering:pixelated;background:#bbb}label{display:block;font-size:11px;color:#9fb0c3;margin-top:8px}input,select,textarea,button{font:inherit;background:#0e1318;color:#e6edf3;border:1px solid #465260;border-radius:4px;padding:6px;box-sizing:border-box}input,select,textarea{width:100%}textarea{min-height:62px}button{cursor:pointer;margin:8px 5px 0 0}button.primary{background:#155f85}.toolbar{display:flex;flex-wrap:wrap;gap:6px}.toolbar button{margin:0}.warn{color:#ffcf4a}.good{color:#74e39a}.object-list{font-size:11px;max-height:140px;overflow:auto}.rule{font-size:11px;color:#b6c4d2;margin:3px 0}@media(max-width:1050px){.layout{grid-template-columns:1fr}.source-wrap{max-height:55vh}}
.autotiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.autotile{font-size:11px;background:#10161c;padding:8px;border-radius:5px}.autotile img{max-width:100%;max-height:160px;image-rendering:pixelated;background:#bbb}
</style></head><body>
<header><h1>Tileset ${manifest.tileset.id}: ${manifest.tileset.database_name || manifest.tileset.graphic_name}</h1><div class="sub">Click a tile. Ctrl-click selects multiple adjacent tiles. Engine facts are evidence; creator semantics are the reviewed truth.</div></header>
<div class="layout"><main>
<section class="panel"><div class="toolbar"><button id="clearSel">Clear selection</button><button id="export">Export catalog JSON</button><label style="margin:0"><input id="import" type="file" accept="application/json" style="width:220px"></label><span id="status" class="sub"></span></div></section>
<section class="panel"><h2>Labeled source sheet</h2><div class="source-wrap"><div id="source" class="source"><img src="source-labeled.png" alt="tileset source with tile ids"></div></div></section>
<section class="panel"><h2>Exact source row</h2><img id="rowImage" class="row-img" alt="selected source row"></section>
<section class="panel"><h2>Autotile sources</h2><div class="autotiles">${manifest.autotiles.map(a => `<div class="autotile"><b>Slot ${a.slot} / base ${a.base_id}</b><br>${a.name || 'unused'}${a.image ? `<br><img src="${a.image}" alt="autotile slot ${a.slot}">` : ''}<br>${a.engine_hints.join('<br>')}</div>`).join('')}</div></section>
<section class="panel"><h2>Review rules</h2>${manifest.review_rules.map(r => `<div class="rule">* ${r}</div>`).join('')}</section>
</main><aside>
<section class="panel"><h2 id="tileTitle">Select a tile</h2><div class="preview"><img id="tileImage" class="tile-img"><div id="facts" class="facts"></div></div>
<label>Label<input id="label"></label><label>Category<select id="category">${categories.map(c => `<option>${c}</option>`).join('')}</select></label>
<label>Placement<select id="placement">${[...PLACEMENT].map(c => `<option>${c}</option>`).join('')}</select></label>
<label>Recommended layer<select id="layer"><option value="">unknown</option><option value="0">0 terrain</option><option value="1">1 clutter/detail</option><option value="2">2 overhead</option><option value="event">event graphic</option></select></label>
<label>Object ID<input id="objectId" placeholder="green-tree, market-stall..."></label><label>Object part<input id="objectPart" placeholder="top-left, trunk, window..."></label>
<label>Confidence<select id="confidence">${[...CONFIDENCE].map(c => `<option>${c}</option>`).join('')}</select></label>
<label>Usage<textarea id="usage"></textarea></label><label>Evidence / notes<textarea id="notes"></textarea></label>
<button id="apply" class="primary">Apply to selection</button><button id="makeObject">Create object grid</button></section>
<section class="panel"><h2>Catalog objects</h2><div id="objects" class="object-list"></div></section>
</aside></div>
<script>
const manifest=${jsonForHtml(manifest)};const initial=${jsonForHtml(catalog)};const key='rmxp-tilecatalog-'+manifest.tileset.id;
let catalog=(()=>{try{return JSON.parse(localStorage.getItem(key))||initial}catch{return initial}})();
catalog.tiles||={};catalog.objects||={};catalog.autotiles||={};let selected=new Set();
const $=id=>document.getElementById(id),source=$('source');
for(const t of manifest.regular_tiles){const d=document.createElement('div');d.className='hit';d.style.left=(t.col*64)+'px';d.style.top=(t.row*64)+'px';d.dataset.id=t.id;d.title=String(t.id);d.onclick=e=>selectTile(t.id,e.ctrlKey||e.metaKey);source.appendChild(d)}
function persist(){catalog.updated_at=new Date().toISOString();localStorage.setItem(key,JSON.stringify(catalog));renderMarks();renderObjects();$('status').textContent=Object.keys(catalog.tiles).length+'/'+manifest.regular_tiles.length+' reviewed'}
function renderMarks(){document.querySelectorAll('.hit').forEach(d=>{const id=d.dataset.id;d.classList.toggle('selected',selected.has(Number(id)));d.classList.toggle('reviewed',!!catalog.tiles[id])})}
function selectTile(id,multi){if(!multi)selected.clear();if(multi&&selected.has(id))selected.delete(id);else selected.add(id);renderMarks();loadEditor(id)}
function loadEditor(id){const t=manifest.regular_tiles.find(x=>x.id===id);if(!t)return;const a=catalog.tiles[id]||{};$('tileTitle').textContent='Tile '+id+' (row '+t.row+', col '+t.col+')';$('tileImage').src=t.image;$('rowImage').src=t.row_image;$('facts').textContent='priority: '+t.priority+'\npassage: '+t.passage_raw+'\nblocked: '+(t.blocked_directions.join(', ')||'none')+'\nalpha coverage: '+t.alpha.coverage+'\nbbox: '+JSON.stringify(t.alpha.bbox)+'\n'+t.engine_hints.join('\n');for(const f of ['label','category','placement','objectId','objectPart','confidence','usage','notes']){const k=f==='objectId'?'object_id':f==='objectPart'?'object_part':f;$(f).value=a[k]??(f==='category'||f==='placement'||f==='confidence'?'unknown':'')}$('layer').value=a.recommended_layer??''}
$('apply').onclick=()=>{for(const id of selected){catalog.tiles[id]={id,label:$('label').value.trim(),category:$('category').value,placement:$('placement').value,recommended_layer:$('layer').value===''?null:($('layer').value==='event'?'event':Number($('layer').value)),object_id:$('objectId').value.trim()||null,object_part:$('objectPart').value.trim()||null,confidence:$('confidence').value,usage:$('usage').value.trim(),notes:$('notes').value.trim()}}persist()};
$('makeObject').onclick=()=>{const id=$('objectId').value.trim();if(!id||!selected.size){alert('Select adjacent tiles and enter an Object ID first.');return}const ts=[...selected].map(n=>manifest.regular_tiles.find(t=>t.id===n));const minR=Math.min(...ts.map(t=>t.row)),maxR=Math.max(...ts.map(t=>t.row)),minC=Math.min(...ts.map(t=>t.col)),maxC=Math.max(...ts.map(t=>t.col));const grid=Array.from({length:maxR-minR+1},()=>Array(maxC-minC+1).fill(null));for(const t of ts)grid[t.row-minR][t.col-minC]=t.id;const layer=$('layer').value;catalog.objects[id]={id,label:$('label').value.trim()||id,category:$('category').value,recommended_layer:layer===''?null:(layer==='event'?'event':Number(layer)),confidence:$('confidence').value,usage:$('usage').value.trim(),notes:$('notes').value.trim(),grid};for(const t of ts){catalog.tiles[t.id]={...(catalog.tiles[t.id]||{id:t.id}),object_id:id,placement:'object_part'}}persist()};
function renderObjects(){$('objects').innerHTML=Object.values(catalog.objects).map(o=>'<div><b>'+o.id+'</b> '+(o.label||'')+' '+(o.grid?.[0]?.length||0)+'x'+(o.grid?.length||0)+'</div>').join('')||'<span class="sub">No object groups yet.</span>'}
$('clearSel').onclick=()=>{selected.clear();renderMarks()};$('export').onclick=()=>{const b=new Blob([JSON.stringify(catalog,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='tileset'+String(manifest.tileset.id).padStart(3,'0')+'.catalog.json';a.click();URL.revokeObjectURL(a.href)};
$('import').onchange=async e=>{catalog=JSON.parse(await e.target.files[0].text());persist()};persist();
</script></body></html>`;
}

function harnessReadme(manifest: HarnessManifest): string {
  return `# Tileset ${manifest.tileset.id} identification harness

Open \`index.html\` in a browser. Review the source sheet before assigning semantics.

## Workflow

1. Click a tile in the source sheet; Ctrl-click adjacent tiles that form one object.
2. Check the burned-in tile ID, isolated tile, exact source row, priority, passage flags, and transparency.
3. Record a creator-facing label, category, placement mode, recommended layer, usage, evidence, and confidence.
4. For a rectangular multi-tile object, enter an object ID and use **Create object grid**.
5. Export the catalog JSON, then persist it through the MCP \`save_tileset_catalog\` tool.
6. Run \`validate_tileset_catalog\`. Only confirmed catalog entries should drive automatic map authoring.

Engine facts live in \`manifest.json\`. Human semantics live in \`catalog.json\` and must never be inferred solely from priority/passability.
`;
}

export async function createTilesetIdentificationHarness(
  projectPath: string,
  tilesetId: number,
  opts: { scale?: number; outDir?: string } = {},
): Promise<any> {
  const scale = Math.max(2, Math.min(8, Math.floor(opts.scale ?? 4)));
  const { manifest, image } = await buildManifest(projectPath, tilesetId);
  const dir = opts.outDir || catalogDir(projectPath, tilesetId);
  const tilesDir = join(dir, 'tiles'), rowsDir = join(dir, 'rows'), autotilesDir = join(dir, 'autotiles');
  await mkdir(tilesDir, { recursive: true });
  await mkdir(rowsDir, { recursive: true });
  await mkdir(autotilesDir, { recursive: true });
  await writeFile(join(dir, 'source.png'), encodePng(image));
  const labeledSource = scaleCanvas(image, 2);
  drawGrid(labeledSource, 64, [0, 0, 0, 120]);
  for (const fact of manifest.regular_tiles) {
    drawLabel(labeledSource, fact.col * 64 + 3, fact.row * 64 + 3, String(fact.id), 1, [255, 255, 160]);
  }
  await writeFile(join(dir, 'source-labeled.png'), encodePng(labeledSource));

  for (const fact of manifest.regular_tiles) {
    const tile = crop(image, fact.col * 32, fact.row * 32, 32, 32);
    await writeFile(join(tilesDir, `${fact.id}.png`), encodePng(scaleCanvas(tile, scale)));
  }
  for (let row = 0; row < manifest.tileset.rows; row++) {
    const sourceRow = crop(image, 0, row * 32, image.width, 32);
    const rendered = scaleCanvas(sourceRow, scale);
    drawGrid(rendered, 32 * scale, [0, 0, 0, 100]);
    for (let col = 0; col < manifest.tileset.cols; col++) {
      const id = 384 + row * manifest.tileset.cols + col;
      drawLabel(rendered, col * 32 * scale + 3, 3, String(id), 1, [255, 255, 160]);
    }
    await writeFile(join(rowsDir, `row-${String(row).padStart(2, '0')}.png`), encodePng(rendered));
  }
  for (const autotile of manifest.autotiles) {
    if (!autotile.name) continue;
    const sourcePath = resolveGraphic(projectPath, DEFAULT_RTP, 'Autotiles', autotile.name);
    if (!sourcePath) continue;
    const source = await decodePng(sourcePath);
    await writeFile(
      join(autotilesDir, `slot-${autotile.slot}.png`),
      encodePng(scaleCanvas(source, Math.min(scale, 3))),
    );
  }

  const catalog = await readCatalog(projectPath, tilesetId, manifest);
  const template = blankCatalog(manifest);
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(join(dir, 'catalog.template.json'), JSON.stringify(template, null, 2));
  if (!(await exists(join(dir, 'catalog.json')))) {
    await writeFile(join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2));
  }
  await writeFile(join(dir, 'index.html'), harnessHtml(manifest, catalog));
  await writeFile(join(dir, 'README.md'), harnessReadme(manifest));

  return {
    directory: dir,
    review_page: join(dir, 'index.html'),
    manifest: join(dir, 'manifest.json'),
    catalog: join(dir, 'catalog.json'),
    source_sheet: join(dir, 'source.png'),
    labeled_source_sheet: join(dir, 'source-labeled.png'),
    tileset: manifest.tileset,
    summary: summary(catalog, manifest),
    workflow: [
      'Review the labeled source adjacency and isolated tile before labeling.',
      'Group only visually confirmed rectangular multi-tile objects.',
      'Persist exported annotations with save_tileset_catalog.',
      'Run validate_tileset_catalog before using labels for map authoring.',
    ],
  };
}

export async function getTilesetCatalog(projectPath: string, tilesetId: number): Promise<any> {
  const { manifest } = await buildManifest(projectPath, tilesetId);
  const path = catalogPath(projectPath, tilesetId);
  const found = await exists(path);
  const catalog = await readCatalog(projectPath, tilesetId, manifest);
  return { found, path, catalog, summary: summary(catalog, manifest) };
}

function copyDefined(target: any, input: any, allowed: string[]): any {
  const out = { ...target };
  for (const key of allowed) if (input[key] !== undefined) out[key] = input[key];
  return out;
}

function mergeCatalog(base: TilesetCatalog, args: any): TilesetCatalog {
  if (args.catalog) {
    const imported = args.catalog;
    return {
      ...base,
      updated_at: new Date().toISOString(),
      tiles: { ...(imported.tiles ?? {}) },
      objects: { ...(imported.objects ?? {}) },
      autotiles: { ...(imported.autotiles ?? {}) },
    };
  }
  const catalog: TilesetCatalog = args.replace
    ? { ...base, tiles: {}, objects: {}, autotiles: {} }
    : { ...base, tiles: { ...base.tiles }, objects: { ...base.objects }, autotiles: { ...base.autotiles } };
  for (const entry of args.entries ?? []) {
    const id = Number(entry.id);
    if (entry.remove) { delete catalog.tiles[String(id)]; continue; }
    catalog.tiles[String(id)] = copyDefined(catalog.tiles[String(id)] ?? { id }, entry, [
      'id', 'label', 'category', 'placement', 'recommended_layer', 'object_id',
      'object_part', 'confidence', 'usage', 'notes', 'tags', 'evidence',
    ]);
  }
  for (const object of args.objects ?? []) {
    const id = String(object.id ?? '');
    if (!id) continue;
    if (object.remove) {
      delete catalog.objects[id];
      for (const entry of Object.values(catalog.tiles)) {
        if (entry.object_id !== id) continue;
        delete entry.object_id;
        if (entry.placement === 'object_part') entry.placement = 'unknown';
      }
      continue;
    }
    catalog.objects[id] = copyDefined(catalog.objects[id] ?? { id }, object, [
      'id', 'label', 'category', 'recommended_layer', 'confidence', 'usage', 'notes', 'tags', 'grid',
    ]);
    for (const row of object.grid ?? []) for (const value of row ?? []) {
      if (value == null || value === 0) continue;
      const tileId = Number(value);
      catalog.tiles[String(tileId)] = {
        ...(catalog.tiles[String(tileId)] ?? { id: tileId }),
        object_id: id,
        placement: 'object_part',
      };
    }
  }
  for (const entry of args.autotiles ?? []) {
    const slot = Number(entry.slot);
    if (entry.remove) { delete catalog.autotiles[String(slot)]; continue; }
    catalog.autotiles[String(slot)] = copyDefined(catalog.autotiles[String(slot)] ?? { slot }, entry, [
      'slot', 'label', 'category', 'recommended_layer', 'confidence', 'usage', 'notes', 'tags', 'rendering',
    ]);
  }
  catalog.updated_at = new Date().toISOString();
  return catalog;
}

function validateCatalogObject(catalog: TilesetCatalog, manifest: HarnessManifest, strict = false) {
  const errors: string[] = [], warnings: string[] = [];
  const facts = new Map(manifest.regular_tiles.map(t => [t.id, t]));
  const validLayer = (layer: any) => layer == null || layer === 'event' || [0, 1, 2].includes(layer);
  if (catalog.schema_version !== SCHEMA_VERSION) errors.push(`schema_version must be ${SCHEMA_VERSION}`);
  if (catalog.tileset_id !== manifest.tileset.id) errors.push(`catalog tileset_id ${catalog.tileset_id} does not match ${manifest.tileset.id}`);
  for (const [key, entry] of Object.entries(catalog.tiles ?? {})) {
    const id = Number(key);
    const fact = facts.get(id);
    if (!fact) { errors.push(`tile ${key} is outside ${manifest.tileset.id_range[0]}..${manifest.tileset.id_range[1]}`); continue; }
    if (entry.id != null && Number(entry.id) !== id) errors.push(`tile key ${key} disagrees with entry.id ${entry.id}`);
    if (entry.category != null && !CATEGORIES.has(entry.category)) errors.push(`tile ${id}: invalid category '${entry.category}'`);
    if (entry.confidence != null && !CONFIDENCE.has(entry.confidence)) errors.push(`tile ${id}: invalid confidence '${entry.confidence}'`);
    if (entry.placement != null && !PLACEMENT.has(entry.placement)) errors.push(`tile ${id}: invalid placement '${entry.placement}'`);
    const layer = entry.recommended_layer;
    if (layer != null && layer !== 'event' && ![0, 1, 2].includes(layer)) errors.push(`tile ${id}: recommended_layer must be 0,1,2,event,or null`);
    if (layer === 0 && fact.alpha.coverage < 1) warnings.push(`tile ${id}: transparent tile recommended for z0; verify an underlayer or black may show`);
    if (layer === 1 && fact.priority > 0) warnings.push(`tile ${id}: priority ${fact.priority} on z1; likely belongs on z2`);
    if (layer === 2 && fact.priority === 0) warnings.push(`tile ${id}: priority 0 on z2; confirm it truly should be overhead`);
    if (entry.placement === 'object_part' && !entry.object_id) warnings.push(`tile ${id}: object_part without object_id`);
    if (entry.confidence === 'confirmed' && (!entry.label || !entry.usage)) warnings.push(`tile ${id}: confirmed entry should include label and usage`);
  }
  const objectTileOwners = new Map<number, string>();
  for (const [objectId, object] of Object.entries(catalog.objects ?? {})) {
    if (object.id != null && String(object.id) !== objectId) errors.push(`object key '${objectId}' disagrees with object.id '${object.id}'`);
    if (object.category != null && !CATEGORIES.has(object.category)) errors.push(`object '${objectId}': invalid category '${object.category}'`);
    if (object.confidence != null && !CONFIDENCE.has(object.confidence)) errors.push(`object '${objectId}': invalid confidence '${object.confidence}'`);
    if (!validLayer(object.recommended_layer)) errors.push(`object '${objectId}': recommended_layer must be 0,1,2,event,or null`);
    if (object.confidence === 'confirmed' && (!object.label || !object.usage)) warnings.push(`object '${objectId}': confirmed object should include label and usage`);
    if (!Array.isArray(object.grid) || object.grid.length === 0 || !Array.isArray(object.grid[0])) {
      errors.push(`object '${objectId}': grid must be a non-empty 2D array`); continue;
    }
    const width = object.grid[0].length;
    if (object.grid.some((row: any) => !Array.isArray(row) || row.length !== width)) errors.push(`object '${objectId}': grid rows must have equal width`);
    for (const row of object.grid) for (const value of row) {
      if (value == null) continue;
      if (value === 0) { errors.push(`object '${objectId}': use null, not numeric 0, for empty grid cells`); continue; }
      const id = Number(value);
      const fact = facts.get(id);
      if (!fact) errors.push(`object '${objectId}': tile ${value} outside tileset range`);
      else if (fact.alpha.coverage === 0) errors.push(`object '${objectId}': tile ${id} is fully transparent; use null for the gap`);
      const owner = objectTileOwners.get(id);
      if (owner && owner !== objectId) warnings.push(`tile ${id} appears in objects '${owner}' and '${objectId}'`);
      else objectTileOwners.set(id, objectId);
    }
  }
  const autotileFacts = new Map(manifest.autotiles.map(a => [a.slot, a]));
  for (const [slot, entry] of Object.entries(catalog.autotiles ?? {})) {
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 0 || n > 6) errors.push(`autotile slot '${slot}' must be 0..6`);
    if (entry.slot != null && Number(entry.slot) !== n) errors.push(`autotile key ${slot} disagrees with entry.slot ${entry.slot}`);
    if (entry.category != null && !CATEGORIES.has(entry.category)) errors.push(`autotile ${slot}: invalid category '${entry.category}'`);
    if (entry.confidence != null && !CONFIDENCE.has(entry.confidence)) errors.push(`autotile ${slot}: invalid confidence '${entry.confidence}'`);
    if (!validLayer(entry.recommended_layer)) errors.push(`autotile ${slot}: recommended_layer must be 0,1,2,event,or null`);
    const fact = autotileFacts.get(n);
    if (entry.recommended_layer === 0 && fact?.alpha && fact.alpha.coverage < 1) warnings.push(`autotile ${slot}: transparent autotile recommended for z0; verify an underlayer or black may show`);
    if (entry.confidence === 'confirmed' && (!entry.label || !entry.usage)) warnings.push(`autotile ${slot}: confirmed entry should include label and usage`);
  }
  const reviewed = Object.keys(catalog.tiles ?? {}).length;
  if (strict && reviewed !== manifest.regular_tiles.length) errors.push(`strict mode: ${manifest.regular_tiles.length - reviewed} regular tiles remain unreviewed`);
  return { ok: errors.length === 0, errors, warnings, summary: summary(catalog, manifest) };
}

export async function saveTilesetCatalog(projectPath: string, tilesetId: number, args: any): Promise<any> {
  const { manifest } = await buildManifest(projectPath, tilesetId);
  const base = await readCatalog(projectPath, tilesetId, manifest);
  const catalog = mergeCatalog(base, args);
  const validation = validateCatalogObject(catalog, manifest, false);
  if (!validation.ok) throw new Error(`catalog rejected: ${validation.errors.join('; ')}`);
  const dir = catalogDir(projectPath, tilesetId);
  await mkdir(dir, { recursive: true });
  const path = catalogPath(projectPath, tilesetId);
  await writeFile(path, JSON.stringify(catalog, null, 2));
  return { path, catalog, validation };
}

export async function validateTilesetCatalog(projectPath: string, tilesetId: number, strict = false): Promise<any> {
  const { manifest } = await buildManifest(projectPath, tilesetId);
  const path = catalogPath(projectPath, tilesetId);
  if (!(await exists(path))) throw new Error(`catalog not found at ${path}; run create_tileset_identification_harness first`);
  const catalog = JSON.parse(await readFile(path, 'utf8')) as TilesetCatalog;
  return { path, ...validateCatalogObject(catalog, manifest, strict) };
}
