import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { PNG } from 'pngjs';

/**
 * Tiny RGBA image type used for compositing map previews. `data` is straight
 * (non-premultiplied) 8-bit RGBA, row-major: pixel (x,y) starts at
 * `(y*width + x) * 4`. A fresh canvas is fully transparent (all zero).
 *
 * Shared image I/O for the map renderer (FR-50) and tileset atlas (FR-1).
 */
export interface Canvas {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Decode a PNG to RGBA. pngjs expands palette + tRNS transparency for us. */
export async function decodePng(path: string): Promise<Canvas> {
  const png = PNG.sync.read(await readFile(path));
  return { width: png.width, height: png.height, data: png.data };
}

/** Encode an RGBA canvas to a PNG buffer. */
export function encodePng(c: Canvas): Buffer {
  const png = new PNG({ width: c.width, height: c.height });
  png.data = Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength);
  return PNG.sync.write(png);
}

/** A new, fully-transparent canvas. */
export function makeCanvas(width: number, height: number): Canvas {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/**
 * Alpha-composite a sub-rect of `src` onto `dst` at (dx,dy) using the `over`
 * operator. Out-of-bounds destination pixels are clipped. Fully transparent
 * source pixels are skipped; fully opaque ones are copied directly.
 */
export function blit(
  dst: Canvas,
  src: Canvas,
  sx: number, sy: number, sw: number, sh: number,
  dx: number, dy: number,
): void {
  for (let row = 0; row < sh; row++) {
    const yy = dy + row;
    if (yy < 0 || yy >= dst.height) continue;
    const syRow = sy + row;
    if (syRow < 0 || syRow >= src.height) continue;
    for (let col = 0; col < sw; col++) {
      const xx = dx + col;
      if (xx < 0 || xx >= dst.width) continue;
      const sxCol = sx + col;
      if (sxCol < 0 || sxCol >= src.width) continue;
      const si = (syRow * src.width + sxCol) * 4;
      const sa = src.data[si + 3];
      if (sa === 0) continue;
      const di = (yy * dst.width + xx) * 4;
      if (sa === 255) {
        dst.data[di] = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = 255;
      } else {
        const a = sa / 255;
        const ia = 1 - a;
        dst.data[di] = Math.round(src.data[si] * a + dst.data[di] * ia);
        dst.data[di + 1] = Math.round(src.data[si + 1] * a + dst.data[di + 1] * ia);
        dst.data[di + 2] = Math.round(src.data[si + 2] * a + dst.data[di + 2] * ia);
        dst.data[di + 3] = Math.max(dst.data[di + 3], sa);
      }
    }
  }
}

/** Alpha-blend a filled rectangle over the canvas (debug overlays). */
export function fillRect(c: Canvas, x: number, y: number, w: number, h: number, rgba: [number, number, number, number]): void {
  const a = rgba[3] / 255, ia = 1 - a;
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= c.height) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= c.width) continue;
      const di = (yy * c.width + xx) * 4;
      c.data[di] = Math.round(rgba[0] * a + c.data[di] * ia);
      c.data[di + 1] = Math.round(rgba[1] * a + c.data[di + 1] * ia);
      c.data[di + 2] = Math.round(rgba[2] * a + c.data[di + 2] * ia);
      c.data[di + 3] = Math.max(c.data[di + 3], rgba[3]);
    }
  }
}

/** Nearest-neighbour integer upscale (for legibility). */
export function scaleCanvas(c: Canvas, s: number): Canvas {
  if (s === 1) return c;
  const w = c.width * s, h = c.height * s;
  const out = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / s);
      const si = (sy * c.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = c.data[si];
      out.data[di + 1] = c.data[si + 1];
      out.data[di + 2] = c.data[si + 2];
      out.data[di + 3] = c.data[si + 3];
    }
  }
  return out;
}

/** Blend a 1px grid over the canvas every `step` pixels (debug overlay). */
export function drawGrid(c: Canvas, step: number, rgba: [number, number, number, number] = [0, 0, 0, 64]): void {
  const a = rgba[3] / 255, ia = 1 - a;
  for (let y = 0; y < c.height; y++) {
    const yLine = y % step === 0;
    for (let x = 0; x < c.width; x++) {
      if (!yLine && x % step !== 0) continue;
      const di = (y * c.width + x) * 4;
      c.data[di] = Math.round(rgba[0] * a + c.data[di] * ia);
      c.data[di + 1] = Math.round(rgba[1] * a + c.data[di + 1] * ia);
      c.data[di + 2] = Math.round(rgba[2] * a + c.data[di + 2] * ia);
      c.data[di + 3] = Math.max(c.data[di + 3], rgba[3]);
    }
  }
}

// Minimal 3x5 bitmap font (digits + a few labels) for burning tile ids onto the
// atlas — no font library needed. Each glyph is 5 rows of a 3-bit mask.
const GLYPHS_3x5: Record<string, number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111], '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111], '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001], '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111], '7': [0b111, 0b001, 0b001, 0b001, 0b001],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111], '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  '#': [0b101, 0b111, 0b101, 0b111, 0b101], 'A': [0b111, 0b101, 0b111, 0b101, 0b101],
  ' ': [0, 0, 0, 0, 0], '-': [0, 0, 0b111, 0, 0],
};

/**
 * Draw a short label (digits, `A`, `#`, `-`, space) at (x,y) using the 3x5 font,
 * scaled, with a 1px dark backing for legibility on any tile. Returns the width drawn.
 */
export function drawLabel(c: Canvas, x: number, y: number, text: string, scale = 2, color: [number, number, number] = [255, 255, 255]): number {
  const gw = 3 * scale, gh = 5 * scale, gap = scale;
  const w = text.length * (gw + gap);
  fillRect(c, x - 1, y - 1, w + 2, gh + 2, [0, 0, 0, 200]); // backing
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS_3x5[ch] ?? GLYPHS_3x5[' '];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (g[row] & (1 << (2 - col))) fillRect(c, cx + col * scale, y + row * scale, scale, scale, [color[0], color[1], color[2], 255]);
      }
    }
    cx += gw + gap;
  }
  return w;
}

/**
 * Resolve an RMXP graphic by name, trying the project's own `Graphics/<subdir>`
 * first, then the RTP. Returns null if not found in either. Names may or may not
 * carry the `.png` extension.
 */
export function resolveGraphic(
  projectPath: string,
  rtpPath: string,
  subdir: string,
  name: string,
): string | null {
  if (!name) return null;
  const file = name.toLowerCase().endsWith('.png') ? name : `${name}.png`;
  for (const base of [join(projectPath, 'Graphics', subdir), join(rtpPath, 'Graphics', subdir)]) {
    const p = join(base, file);
    if (existsSync(p)) return p;
  }
  return null;
}
