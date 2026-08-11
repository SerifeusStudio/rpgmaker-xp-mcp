/**
 * Map sizing — size is the FIRST design decision. RPG Maker XP's screen is
 * 20x15 tiles (640x480 / 32px), so a map is really N *screens*, and most map
 * craft rules ("one focal point + a path", "no bare patch > 5x5", "frame the
 * edges") are per-screen rules. This module turns a map *purpose* into a
 * sensible default size and a tile-budget advisory (screens, focal-point
 * target, scatter density, oversize warning) so authoring starts from size.
 */

export const SCREEN_W = 20; // tiles visible horizontally (640 / 32)
export const SCREEN_H = 15; // tiles visible vertically  (480 / 32)
export const ENGINE_MIN_W = 20, ENGINE_MIN_H = 15; // editor won't go below one screen
export const ENGINE_MAX_W = 500, ENGINE_MAX_H = 500;

export type MapPurpose = 'interior' | 'room' | 'town' | 'dungeon' | 'overworld' | 'region';

interface PurposeSpec {
  /** default [w,h] when the author omits size */
  default: [number, number];
  /** soft "sweet spot" range [minW,minH]..[maxW,maxH]; outside -> advisory warns */
  range: [[number, number], [number, number]];
  blurb: string;
}

/** Purpose taxonomy. Sizes are tile counts; ranges are soft (warn, never block). */
export const PURPOSE: Record<MapPurpose, PurposeSpec> = {
  interior: { default: [20, 15], range: [[20, 15], [25, 20]], blurb: 'Shop/house/small cave — one screen, no scroll, 1 focal point.' },
  room:     { default: [25, 20], range: [[20, 15], [30, 25]], blurb: 'Big room / house cluster — 1-2 screens.' },
  town:     { default: [40, 35], range: [[30, 25], [55, 45]], blurb: 'Town — plaza focal point + a street network.' },
  dungeon:  { default: [45, 40], range: [[30, 25], [70, 60]], blurb: 'Dungeon floor — rooms and corridors; a focal point per room.' },
  overworld:{ default: [100, 90], range: [[70, 60], [130, 110]], blurb: 'Overworld region segment — landmarks + a path network. Stitch segments with transfer events.' },
  region:   { default: [60, 50], range: [[40, 35], [100, 90]], blurb: 'Field / wilderness region — a few focal points joined by trails.' },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Resolve final [w,h]: explicit values win; else the purpose default; else 20x15.
 *  Always clamped to engine limits (a sub-20x15 or >500 map won't open). */
export function resolveSize(
  purpose: MapPurpose | undefined,
  width?: number,
  height?: number
): { width: number; height: number; clamped: boolean; defaulted: boolean } {
  const spec = purpose ? PURPOSE[purpose] : undefined;
  const defaulted = (width == null || height == null);
  let w = width ?? spec?.default[0] ?? SCREEN_W;
  let h = height ?? spec?.default[1] ?? SCREEN_H;
  const cw = clamp(Math.round(w), ENGINE_MIN_W, ENGINE_MAX_W);
  const ch = clamp(Math.round(h), ENGINE_MIN_H, ENGINE_MAX_H);
  const clamped = cw !== Math.round(w) || ch !== Math.round(h);
  return { width: cw, height: ch, clamped, defaulted };
}

/**
 * Tile-budget advisory for a w×h map. screens = ceil(w/20)*ceil(h/15); the craft
 * targets scale per screen so big maps don't end up mostly empty.
 */
export function sizeAdvisory(width: number, height: number, purpose?: MapPurpose) {
  const tiles = width * height;
  const screensW = Math.ceil(width / SCREEN_W);
  const screensH = Math.ceil(height / SCREEN_H);
  const screens = screensW * screensH;
  // ~1 focal point and ~1 path junction per screen-region; at least 1.
  const focalPoints = Math.max(1, Math.round(screens));
  const pathJunctions = Math.max(0, screens - 1);
  const scatterDensity = '0.04-0.08'; // per-area, constant; total clutter scales with tiles
  const approxClutter = Math.round(tiles * 0.06);

  const warnings: string[] = [];
  if (purpose) {
    const spec = PURPOSE[purpose];
    const [[minW, minH], [maxW, maxH]] = spec.range;
    if (width > maxW || height > maxH) {
      warnings.push(`${width}x${height} is large for a ${purpose} (sweet spot up to ${maxW}x${maxH}); expect to fill ~${screens} screens or it will read empty. Consider splitting into segments joined by transfer events.`);
    } else if (width < minW || height < minH) {
      warnings.push(`${width}x${height} is small for a ${purpose} (sweet spot from ${minW}x${minH}).`);
    }
  }
  if (screens >= 9) {
    warnings.push(`${screens} screens (${screensW}x${screensH}) — design a focal point per screen-region and a connecting path network, not one focal point + one trail.`);
  }
  if (width >= 150 || height >= 150) {
    warnings.push(`Very large map: the editor gets sluggish and large empties look unfinished. Prefer several ${SCREEN_W * 5}x${SCREEN_H * 5}-ish segments stitched with transfer events.`);
  }

  return {
    width, height, tiles,
    screens, screens_grid: `${screensW}x${screensH}`,
    target_focal_points: focalPoints,
    target_path_junctions: pathJunctions,
    scatter_density: scatterDensity,
    approx_clutter_tiles: approxClutter,
    purpose: purpose ?? null,
    purpose_note: purpose ? PURPOSE[purpose].blurb : null,
    warnings,
    rule: 'Map size is the first design decision. A map is N screens (20x15 each); scale focal points, paths and clutter per screen.',
  };
}
