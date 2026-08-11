import { join, basename } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { decodePng, encodePng, makeCanvas, blit, Canvas } from '../utils/tiles.js';
import { readRxdataFile, writeRxdataFile, getDataPath } from '../utils/fileHandler.js';

/**
 * Import verification tools (FR: asset-intake QA).
 *
 * Motivation: the proven sort/convert scripts classify assets by their *outer*
 * PNG dimensions (256/512/144). That is blind to two things that silently break
 * an import:
 *   1. the *content* tile size — a "remaster" sheet may be authored at 48px or
 *      64px per tile, so it renders 1.5x/2x too large in RMXP's 32px grid even
 *      though the canvas width looks fine;
 *   2. the asset *format* — MV/MZ A1-A5 autotile sheets and `$`/`!`-prefixed
 *      object sprites are not RMXP tilesets at all.
 *
 * These tools add the missing layers:
 *   - classifyAsset     : filename fingerprint + dimension + content tile-size
 *   - verifyTileset     : write a grid-overlay preview for multimodal review
 *   - registerTileset   : create a Tilesets.rxdata entry (guarded by classify)
 */

// ---------------------------------------------------------------------------
// Layer 2 — content tile-size detection (edge-periodicity)
// ---------------------------------------------------------------------------

const TILE_CANDIDATES = [16, 24, 32, 48, 64] as const;

interface PeriodScore { px: number; score: number; }

/** Grayscale luminance of an RGBA canvas, ignoring fully-transparent pixels. */
function toGray(c: Canvas): { gray: Int32Array; alpha: Uint8Array } {
  const n = c.width * c.height;
  const gray = new Int32Array(n);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    gray[i] = (c.data[p] * 77 + c.data[p + 1] * 150 + c.data[p + 2] * 29) >> 8;
    alpha[i] = c.data[p + 3];
  }
  return { gray, alpha };
}

/**
 * Detect the dominant tile grid period along each axis.
 *
 * Two design choices make this robust where a naive "highest edge energy at
 * multiples" detector fails on organic RTP tiles:
 *   1. A candidate size must EVENLY DIVIDE the canvas on that axis — 48px tiles
 *      cannot tile a 256px-wide sheet, so 48 is never even considered there.
 *   2. The per-period metric is mean edge energy ON grid lines / mean edge
 *      energy OFF grid lines. The off-line denominator is what discriminates:
 *      for native 32px art the 32-spaced borders are strong and the in-between
 *      columns weak (high ratio); for 64px art the intermediate 32-lines are
 *      weak so they inflate 32's off-set and the ratio peaks at 64 instead.
 *   3. A native bias toward 32px: 32 wins ties within 85% so noise can't push a
 *      genuine RMXP tileset into a false "oversized" verdict.
 */
function detectTileSize(c: Canvas): {
  tileX: number; tileY: number; tile: number;
  axisX: PeriodScore[]; axisY: PeriodScore[]; confident: boolean;
} {
  const { gray } = toGray(c);
  const w = c.width, h = c.height;
  const colE = new Float64Array(w);
  const rowE = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 1; x < w; x++) colE[x] += Math.abs(gray[off + x] - gray[off + x - 1]);
  }
  for (let y = 1; y < h; y++) {
    const off = y * w, prev = (y - 1) * w;
    for (let x = 0; x < w; x++) rowE[y] += Math.abs(gray[off + x] - gray[prev + x]);
  }
  const score = (E: Float64Array, size: number): PeriodScore[] => {
    const out: PeriodScore[] = [];
    for (const p of TILE_CANDIDATES) {
      if (p >= size || size % p !== 0) continue; // must evenly tile this axis
      let on = 0, onN = 0, off = 0, offN = 0;
      for (let i = 1; i < size; i++) {
        if (i % p === 0) { on += E[i]; onN++; } else { off += E[i]; offN++; }
      }
      if (onN >= 2 && offN >= 1) {
        const ratio = (on / onN) / (off / offN + 1e-9);
        out.push({ px: p, score: Math.round(ratio * 100) / 100 });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  };
  const pick = (scores: PeriodScore[]): number => {
    if (!scores.length) return 32;
    const top = scores[0];
    const s32 = scores.find(s => s.px === 32);
    if (s32 && s32.score >= top.score * 0.85) return 32; // native bias
    return top.px;
  };
  const axisX = score(colE, w);
  const axisY = score(rowE, h);
  const tileX = pick(axisX);
  const tileY = pick(axisY);
  // if either axis is confidently larger than 32, trust the larger (catches "too big")
  const tile = tileX === tileY ? tileX : Math.max(tileX, tileY);
  const confident = axisX.length >= 2 ? axisX[0].score >= axisX[1].score * 1.15 : axisX.length === 1;
  return { tileX, tileY, tile, axisX, axisY, confident };
}

// ---------------------------------------------------------------------------
// Layer 1 — filename / dimension fingerprint
// ---------------------------------------------------------------------------

const A_SERIES = /(^|[_\-])A[1-5]([_\-.]|$)/i; // MV/MZ tile sheets — prefix OR suffix

interface Fingerprint {
  base: string;
  object_sprite: boolean;   // `$` or `!` prefix
  mv_autotile: boolean;     // A1-A5
  mv_dim: boolean;          // divisible by 48
  notes: string[];
}

function fingerprint(filePath: string, w: number, h: number): Fingerprint {
  const base = basename(filePath);
  const notes: string[] = [];
  const object_sprite = /^[$!]/.test(base);
  if (object_sprite) notes.push(`'${base[0]}' prefix = MV/VX single-object sprite (Characters / event graphic, not a tileset)`);
  const mv_autotile = A_SERIES.test(base.replace(/\.[^.]+$/, ''));
  if (mv_autotile) notes.push('A1-A5 name = MV/MZ autotile sheet (different tile system from RMXP)');
  const mv_dim = w % 48 === 0 && h % 48 === 0 && !(w % 32 === 0 && h % 32 === 0);
  if (mv_dim) notes.push('dimensions divisible by 48 = MV/MZ native resolution');
  return { base, object_sprite, mv_autotile, mv_dim, notes };
}

// ---------------------------------------------------------------------------
// classify_asset
// ---------------------------------------------------------------------------

export async function classifyAsset(filePath: string): Promise<any> {
  const img = await decodePng(filePath);
  const { width: w, height: h } = img;
  const fp = fingerprint(filePath, w, h);
  const ts = detectTileSize(img);

  let tier = 'native';
  let recommended_op = 'copy';
  let target_category = 'unknown';
  const flags: string[] = [...fp.notes];

  // The A1-A5 NAME alone over-matches battler variants (e.g. Wolf_A1.png), so
  // only treat it as a real MV tile sheet when the content corroborates: a true
  // A-series sheet is authored at 48px or 64px, never 32px.
  const real_mv_autotile = fp.mv_autotile && ts.tile !== 32;
  if (fp.mv_autotile && !real_mv_autotile) {
    flags.push('name contains A1-A5 but content is 32px — treated as a normal asset (likely a battler/variant, not an MV tile sheet)');
  }

  if (fp.object_sprite) {
    tier = 'object-sprite';
    recommended_op = 'copy-to-characters';
    target_category = 'characters';
    flags.push('Do NOT register as a tileset; place as a character/event graphic.');
  } else if (real_mv_autotile) {
    tier = 'mv-autotile';
    recommended_op = 'reject-or-manual-repack';
    target_category = 'tilesets';
    flags.push(`MV A-series autotile layout + ${ts.tile}px tiles — not directly usable as an RMXP tileset.`);
  } else if (ts.tile === 48 || (fp.mv_dim && ts.tile !== 32)) {
    tier = 'oversized';
    recommended_op = 'downscale-48-to-32';
    flags.push(`content tile size ~${ts.tile}px (MV native) — downscale x2/3 so tiles become 32px before use`);
  } else if (ts.tile === 64) {
    tier = 'oversized';
    recommended_op = 'downscale-64-to-32';
    flags.push(`content tile size ~64px — renders 2x too large in RMXP (covers 2x2 cells). Downscale x1/2 first.`);
  } else if (ts.tile === 16) {
    tier = 'undersized';
    recommended_op = 'review';
    flags.push('content tile size ~16px — half RMXP scale; upscale x2 or treat as a detail sheet');
  } else {
    tier = 'native';
    recommended_op = 'copy';
  }

  return {
    file: fp.base,
    dimensions: { width: w, height: h },
    fingerprint: {
      object_sprite: fp.object_sprite,
      mv_autotile: fp.mv_autotile,
      mv_dimension: fp.mv_dim,
    },
    content_tile_size_px: ts.tile,
    content_tile_axis: { x: ts.tileX, y: ts.tileY, confident: ts.confident },
    edge_periodicity: { x: ts.axisX, y: ts.axisY },
    tier,
    recommended_op,
    target_category,
    // a flat A5-named sheet with 32px content is a usable RMXP tileset — gate on
    // the corroborated MV-autotile verdict, not the raw filename hint
    rmxp_native: tier === 'native' && !fp.object_sprite && !real_mv_autotile,
    flags,
  };
}

// ---------------------------------------------------------------------------
// verify_tileset — grid-overlay preview for multimodal review
// ---------------------------------------------------------------------------

function drawGrid(c: Canvas, step: number, rgba: [number, number, number, number]): void {
  const [r, g, b, a] = rgba;
  const put = (x: number, y: number) => {
    if (x < 0 || x >= c.width || y < 0 || y >= c.height) return;
    const i = (y * c.width + x) * 4;
    const ia = (255 - a) / 255, fa = a / 255;
    c.data[i] = Math.round(r * fa + c.data[i] * ia);
    c.data[i + 1] = Math.round(g * fa + c.data[i + 1] * ia);
    c.data[i + 2] = Math.round(b * fa + c.data[i + 2] * ia);
    c.data[i + 3] = Math.max(c.data[i + 3], a);
  };
  for (let x = 0; x <= c.width; x += step) for (let y = 0; y < c.height; y++) put(x, y);
  for (let y = 0; y <= c.height; y += step) for (let x = 0; x < c.width; x++) put(x, y);
}

/**
 * Render the asset with two grid overlays: the RMXP 32px grid (red) and the
 * detected content grid (cyan). If the cyan lines fall on every other red line
 * the art is 64px (2x too big); if they coincide it is native 32px. Writes a
 * PNG and returns its path for the caller (Claude) to read and judge visually.
 */
export async function verifyTileset(
  filePath: string,
  opts: { outDir?: string; scale?: number } = {}
): Promise<any> {
  const img = await decodePng(filePath);
  const detected = detectTileSize(img);
  const scale = Math.max(1, Math.min(4, opts.scale ?? (img.width <= 256 ? 2 : 1)));

  // upscale (nearest) for legibility
  const up = makeCanvas(img.width * scale, img.height * scale);
  for (let y = 0; y < up.height; y++) {
    const sy = (y / scale) | 0;
    for (let x = 0; x < up.width; x++) {
      const sx = (x / scale) | 0;
      const si = (sy * img.width + sx) * 4, di = (y * up.width + x) * 4;
      up.data[di] = img.data[si]; up.data[di + 1] = img.data[si + 1];
      up.data[di + 2] = img.data[si + 2]; up.data[di + 3] = img.data[si + 3];
    }
  }
  drawGrid(up, 32 * scale, [255, 0, 0, 200]);                 // RMXP 32px grid (red)
  if (detected.tile !== 32) drawGrid(up, detected.tile * scale, [0, 220, 255, 200]); // content grid (cyan)

  const outDir = opts.outDir ?? join(process.env.TEMP || '.', 'rmxp-verify');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, basename(filePath).replace(/\.[^.]+$/, '') + '_verify.png');
  writeFileSync(out, encodePng(up));

  const aligned = detected.tile === 32;
  return {
    file: basename(filePath),
    dimensions: { width: img.width, height: img.height },
    detected_tile_size_px: detected.tile,
    rmxp_grid_px: 32,
    aligned_to_rmxp_grid: aligned,
    verdict: aligned
      ? 'Content aligns to the 32px grid — native RMXP tileset.'
      : `Content tiles are ~${detected.tile}px. Red (32px) and cyan (${detected.tile}px) grids disagree — convert before use.`,
    preview_png: out,
    review_note: 'Read preview_png: every tile motif should sit inside one red cell. '
      + 'If a motif fills a 2x2 block of red cells, the art is 64px and must be downscaled.',
  };
}

// ---------------------------------------------------------------------------
// register_tileset — guarded Tilesets.rxdata entry creation
// ---------------------------------------------------------------------------

function emptyTable(xsize: number) {
  return { _class: 'Table', dim: 1, xsize, ysize: 1, zsize: 1, data: new Array(xsize).fill(0) };
}

/**
 * Create a Tilesets.rxdata entry for a graphic already present in
 * Graphics/Tilesets. Refuses non-native assets (object sprites, MV autotiles,
 * non-32px content) unless `force` is set — this is the gate that today's
 * mis-import would have failed.
 */
export async function registerTileset(
  projectPath: string,
  args: { graphicName: string; name?: string; autotileNames?: string[]; force?: boolean }
): Promise<any> {
  const graphicsDir = join(projectPath, 'Graphics', 'Tilesets');
  const file = join(graphicsDir, args.graphicName.replace(/\.[^.]+$/, '') + '.png');

  let verdict: any;
  try { verdict = await classifyAsset(file); }
  catch (e) { return { ok: false, error: `cannot read graphic: ${file} (${e})` }; }

  if (!verdict.rmxp_native && !args.force) {
    return {
      ok: false,
      blocked: true,
      reason: `'${args.graphicName}' is tier '${verdict.tier}' (${verdict.recommended_op}). `
        + `Registration refused to keep the database clean.`,
      classify: verdict,
      hint: 'Convert/relocate the asset first, or pass force:true to override.',
    };
  }

  const img = await decodePng(file);
  if (img.width !== 256) {
    return { ok: false, blocked: true, reason: `tileset width is ${img.width}px; RMXP expects 256px.`, classify: verdict };
  }
  const xsize = 384 + (img.height / 4); // 384 autotile region + 8*(height/32) regular tiles

  const arr = await readRxdataFile<any[]>(getDataPath(projectPath, 'Tilesets.rxdata'));
  const id = arr.length;
  arr.push({
    _class: 'RPG::Tileset', id,
    name: (args.name ?? args.graphicName).slice(0, 40),
    tileset_name: args.graphicName.replace(/\.[^.]+$/, ''),
    autotile_names: (args.autotileNames ?? []).concat(['', '', '', '', '', '', '']).slice(0, 7),
    panorama_name: '', panorama_hue: 0,
    fog_name: '', fog_hue: 0, fog_opacity: 64, fog_blend_type: 0, fog_zoom: 200, fog_sx: 0, fog_sy: 0,
    battleback_name: '',
    passages: emptyTable(xsize), priorities: emptyTable(xsize), terrain_tags: emptyTable(xsize),
  });
  await writeRxdataFile(getDataPath(projectPath, 'Tilesets.rxdata'), arr);

  return {
    ok: true, id, tileset_name: arr[id].tileset_name,
    rows: img.height / 32, table_size: xsize,
    note: 'Passability/priority/terrain default to 0 (passable, ground). Set real passability separately.',
  };
}
