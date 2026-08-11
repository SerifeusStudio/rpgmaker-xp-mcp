import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { readRxdataFile } from '../utils/rxdata.js';
import { getMapPath, getDataPath } from '../utils/fileHandler.js';
import {
  Canvas, decodePng, encodePng, makeCanvas, blit, scaleCanvas, drawGrid, fillRect, drawLabel, resolveGraphic,
} from '../utils/tiles.js';
import { AUTOTILE_INDEX, AUTOTILE_COLS, QUAD_X, QUAD_Y } from '../utils/autotileTable.js';

/**
 * Default RTP graphics root (Steam RPG Maker XP install). Override with the
 * RPGMAKER_RTP_PATH env var. Project-local Graphics/ always take precedence.
 */
const DEFAULT_RTP = process.env.RPGMAKER_RTP_PATH
  || 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/rtp';

/** Decoded-graphic cache, keyed by resolved file path, shared across calls. */
const decodeCache = new Map<string, Canvas>();
async function decodeCached(path: string): Promise<Canvas> {
  let img = decodeCache.get(path);
  if (!img) {
    img = await decodePng(path);
    decodeCache.set(path, img);
  }
  return img;
}

/** Render one autotile variant 0 (base, fully-surrounded) to a 32x32 canvas. */
function renderAutotileBase(src: Canvas): Canvas {
  const out = makeCanvas(32, 32);
  for (let q = 0; q < 4; q++) {
    const sub = AUTOTILE_INDEX[q]; // variant 0 quadrants
    blit(out, src, (sub % AUTOTILE_COLS) * 16, Math.floor(sub / AUTOTILE_COLS) * 16, 16, 16, QUAD_X[q] * 16, QUAD_Y[q] * 16);
  }
  return out;
}

/**
 * Render a labeled tileset atlas (FR-1 P3): the tileset graphic scaled with a
 * grid, each regular tile's id burned in (with a passability dot — red=blocked,
 * orange=partial), plus a top legend strip of the 7 autotile slots (their base
 * appearance + slot number). The model reads this once to learn what each tile is
 * (`id = 384 + row*8 + col`), then references tiles by id.
 */
export async function renderTilesetAtlas(
  projectPath: string,
  tilesetId: number,
  opts: { scale?: number; outPath?: string } = {}
): Promise<any> {
  const scale = Math.max(1, Math.floor(opts.scale ?? 2));
  const notes: string[] = [];
  const tilesets = await readRxdataFile<any[]>(getDataPath(projectPath, 'Tilesets.rxdata'));
  const ts = tilesets?.[tilesetId];
  if (!ts) throw new Error(`Tileset ${tilesetId} not found`);

  const tsPath = resolveGraphic(projectPath, DEFAULT_RTP, 'Tilesets', ts.tileset_name);
  const img = tsPath ? await decodeCached(tsPath) : null;
  if (!img) throw new Error(`tileset graphic '${ts.tileset_name}' not found`);
  const cols = Math.floor(img.width / 32), rows = Math.floor(img.height / 32);
  const cell = 32 * scale;
  const passages = ts.passages?.data;
  const passDot = (id: number) => (passages && id < passages.length) ? passages[id] : 0;

  // legend strip: 7 autotile slots across the top
  const stripH = cell + 7 * scale + 4;
  const atlas = makeCanvas(Math.max(cols, 7) * cell, stripH + rows * cell);
  const autoNames: string[] = ts.autotile_names ?? [];
  for (let s = 0; s < 7; s++) {
    const nm = autoNames[s];
    if (nm) {
      const p = resolveGraphic(projectPath, DEFAULT_RTP, 'Autotiles', nm);
      if (p) blit(atlas, scaleCanvas(renderAutotileBase(await decodeCached(p)), scale), 0, 0, cell, cell, s * cell, 0);
    }
    drawLabel(atlas, s * cell + 2, cell + 1, String(s), scale, [120, 230, 255]);
  }

  // regular-tile grid below, each labeled with its id + passability dot
  const scaled = scaleCanvas(img, scale);
  blit(atlas, scaled, 0, 0, scaled.width, scaled.height, 0, stripH);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = 384 + r * cols + c;
      const x = c * cell, y = stripH + r * cell;
      const pv = passDot(id);
      if (pv === 15) fillRect(atlas, x + cell - 6, y + 2, 4, 4, [255, 40, 40, 255]);
      else if (pv !== 0) fillRect(atlas, x + cell - 6, y + 2, 4, 4, [255, 170, 0, 255]);
      drawLabel(atlas, x + 2, y + 2, String(id), scale, [255, 255, 160]);
    }
  }
  drawGrid(atlas, cell, [0, 0, 0, 70]);

  const dir = join(projectPath, 'Data', '.mcp-preview');
  await mkdir(dir, { recursive: true });
  const file = opts.outPath || join(dir, `tileset${String(tilesetId).padStart(3, '0')}-atlas.png`);
  await writeFile(file, encodePng(atlas));

  return {
    path: file,
    tileset: { id: tilesetId, name: ts.tileset_name },
    grid: { cols, rows, id_range: [384, 384 + cols * rows - 1], formula: 'id = 384 + row*cols + col' },
    autotile_slots: autoNames.map((name, slot) => ({ slot, name, base_id: 48 * (slot + 1) })).filter(a => a.name),
    passability_legend: 'red dot = blocked (15), orange dot = partial; no dot = passable',
    notes,
  };
}

export interface RenderMapOptions {
  /** Which z-layers (0..2) to composite, in draw order. Default all three. */
  layers?: number[];
  /** Integer nearest-neighbour upscale. Default 1. */
  scale?: number;
  /** Crop in tiles. Default: whole map. */
  region?: { x: number; y: number; w: number; h: number };
  /** Overlay a 32px tile grid. Default false. */
  drawGrid?: boolean;
  /** Draw events (page-0 sprite/tile, else a marker) + return a legend. Default false. */
  drawEvents?: boolean;
  /** Tint cells by passability (red=blocked, orange=partial), approximate. Default false. */
  passability?: boolean;
  /** Output PNG path. Default: <project>/Data/.mcp-preview/map<NNN>.png */
  outPath?: string;
}

/**
 * Render a map's tile layers to a flat top-down PNG preview, outside the editor.
 *
 * Composites the three tile layers (ground/detail/overhead) in z order using the
 * tileset graphic (ids >= 384) and the tileset's autotiles (ids 48..383, via the
 * cross-verified quadrant table). This is a layout preview, not a runtime-faithful
 * render: no priority/overhead draw-order vs. the player, no fog/panorama/weather,
 * autotile frame 0 only, events not drawn (v1). Non-fatal issues are collected in
 * `notes` rather than thrown.
 */
export async function renderMap(
  projectPath: string,
  mapId: number,
  opts: RenderMapOptions = {},
): Promise<any> {
  const { layers = [0, 1, 2], scale = 1, region, drawGrid: grid = false, drawEvents = false, passability = false, outPath } = opts;
  const notes: string[] = [];

  const map = await readRxdataFile<any>(getMapPath(projectPath, mapId));
  const table = map.data;
  if (!table || table._class !== 'Table') {
    throw new Error(`Map ${mapId} has no tile data Table`);
  }
  const W = table.xsize, H = table.ysize, Z = table.zsize;

  // Tilesets.rxdata is an array indexed by id (index 0 = nil).
  const tilesets = await readRxdataFile<any[]>(getDataPath(projectPath, 'Tilesets.rxdata'));
  const ts = tilesets?.[map.tileset_id];
  if (!ts) throw new Error(`Tileset ${map.tileset_id} not found for map ${mapId}`);

  // Tileset graphic (ids >= 384). Width is fixed at 8 cols in XP, but derive it
  // from the bitmap so unusual tilesets still map correctly.
  const tilesetPath = resolveGraphic(projectPath, DEFAULT_RTP, 'Tilesets', ts.tileset_name);
  const tilesetImg = tilesetPath ? await decodeCached(tilesetPath) : null;
  if (!tilesetImg) notes.push(`tileset graphic '${ts.tileset_name}' not found (project Graphics/ or RTP)`);
  const tilesetCols = tilesetImg ? Math.floor(tilesetImg.width / 32) : 8;

  // Autotiles (slots 0..6). Empty name = unused slot.
  const autotiles: (Canvas | null)[] = [];
  const autoNames: string[] = ts.autotile_names ?? [];
  for (let i = 0; i < 7; i++) {
    const nm = autoNames[i];
    if (!nm) { autotiles[i] = null; continue; }
    const p = resolveGraphic(projectPath, DEFAULT_RTP, 'Autotiles', nm);
    if (!p) { autotiles[i] = null; notes.push(`autotile '${nm}' (slot ${i}) not found`); continue; }
    autotiles[i] = await decodeCached(p);
  }

  const rx = region?.x ?? 0, ry = region?.y ?? 0;
  const rw = Math.min(region?.w ?? W, W - rx), rh = Math.min(region?.h ?? H, H - ry);
  const canvas = makeCanvas(rw * 32, rh * 32);
  // Table is x-major: data[x + y*xsize + z*xsize*ysize] (WISDOM §1).
  const at = (x: number, y: number, z: number) => table.data[x + y * W + z * W * H];

  let missingAutotile = 0;
  for (const z of layers) {
    if (z < 0 || z >= Z) continue;
    for (let yy = 0; yy < rh; yy++) {
      for (let xx = 0; xx < rw; xx++) {
        const id = at(rx + xx, ry + yy, z);
        if (!id || id <= 0) continue; // 0 = empty
        const dx = xx * 32, dy = yy * 32;
        if (id >= 384) {
          if (!tilesetImg) continue;
          const t = id - 384;
          blit(canvas, tilesetImg, (t % tilesetCols) * 32, Math.floor(t / tilesetCols) * 32, 32, 32, dx, dy);
        } else if (id >= 48) {
          const slot = Math.floor(id / 48) - 1;
          const variant = id % 48;
          const src = autotiles[slot];
          if (!src) { missingAutotile++; continue; }
          for (let q = 0; q < 4; q++) {
            const sub = AUTOTILE_INDEX[4 * variant + q];
            blit(canvas, src, (sub % AUTOTILE_COLS) * 16, Math.floor(sub / AUTOTILE_COLS) * 16, 16, 16,
              dx + QUAD_X[q] * 16, dy + QUAD_Y[q] * 16);
          }
        }
        // ids 1..47 are not valid tile data; skip silently.
      }
    }
  }
  if (missingAutotile > 0) notes.push(`${missingAutotile} cell(s) referenced an autotile with no graphic`);

  const inRegion = (x: number, y: number) => x >= rx && x < rx + rw && y >= ry && y < ry + rh;

  // Passability tint (approximate): classify each cell by the topmost non-zero
  // tile's passage value. passages is a Table indexed by tile id; 0=passable,
  // 15=fully blocked, other nonzero=partial (1/2/4/8 = down/left/right/up).
  if (passability) {
    const passages = ts.passages;
    if (!passages?.data) {
      notes.push('passability requested but tileset has no passages Table');
    } else {
      for (let yy = 0; yy < rh; yy++) {
        for (let xx = 0; xx < rw; xx++) {
          let id = 0;
          for (let z = Z - 1; z >= 0; z--) { const v = at(rx + xx, ry + yy, z); if (v > 0) { id = v; break; } }
          if (!id) continue;
          const p = id < passages.data.length ? passages.data[id] : 0;
          if (p === 15) fillRect(canvas, xx * 32, yy * 32, 32, 32, [255, 0, 0, 90]);
          else if (p !== 0) fillRect(canvas, xx * 32, yy * 32, 32, 32, [255, 160, 0, 70]);
        }
      }
    }
  }

  // Events: draw the page-0 graphic (character sprite standing frame, or tile),
  // else a marker box. Always collect a legend so labels can be correlated.
  const events: Array<{ id: number; name: string; x: number; y: number }> = [];
  if (drawEvents) {
    for (const ev of Object.values(map.events ?? {}) as any[]) {
      if (!inRegion(ev.x, ev.y)) continue;
      events.push({ id: ev.id, name: ev.name, x: ev.x, y: ev.y });
      const dx = (ev.x - rx) * 32, dy = (ev.y - ry) * 32;
      const g = ev.pages?.[0]?.graphic;
      let drawn = false;
      if (g?.tile_id >= 384 && tilesetImg) {
        const t = g.tile_id - 384;
        blit(canvas, tilesetImg, (t % tilesetCols) * 32, Math.floor(t / tilesetCols) * 32, 32, 32, dx, dy);
        drawn = true;
      } else if (g?.character_name) {
        const cp = resolveGraphic(projectPath, DEFAULT_RTP, 'Characters', g.character_name);
        if (cp) {
          const img = await decodeCached(cp);
          const cw = Math.floor(img.width / 4), ch = Math.floor(img.height / 4);
          const rowDir = Math.max(0, Math.min(3, Math.floor((g.direction ?? 2) / 2) - 1));
          const colPat = Math.max(0, Math.min(3, g.pattern ?? 0));
          // RMXP anchors the sprite bottom-centre on the tile.
          blit(canvas, img, colPat * cw, rowDir * ch, cw, ch, dx + 16 - Math.floor(cw / 2), dy + 32 - ch);
          drawn = true;
        }
      }
      if (!drawn) fillRect(canvas, dx + 7, dy + 7, 18, 18, [80, 160, 255, 150]);
    }
  }

  if (grid) drawGrid(canvas, 32);
  const out = scaleCanvas(canvas, Math.max(1, Math.floor(scale)));

  const dir = join(projectPath, 'Data', '.mcp-preview');
  await mkdir(dir, { recursive: true });
  const file = outPath || join(dir, `map${String(mapId).padStart(3, '0')}.png`);
  await writeFile(file, encodePng(out));

  return {
    path: file,
    pixel_w: out.width,
    pixel_h: out.height,
    map: { id: mapId, width: W, height: H, layers: Z },
    tileset: { id: map.tileset_id, name: ts.tileset_name },
    rendered_layers: layers,
    region: { x: rx, y: ry, w: rw, h: rh },
    ...(drawEvents ? { events } : {}),
    notes,
  };
}
