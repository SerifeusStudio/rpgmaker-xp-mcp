/**
 * RPG Maker XP / RGSS1 autotile quadrant table.
 *
 * In XP, tile ids 48..383 are autotiles: `slot = id/48 - 1` (0..6, into the
 * tileset's `autotile_names`), `variant = id % 48`. Each 32x32 autotile variant
 * is assembled from FOUR 16x16 sub-tiles taken from the 96x128 source autotile
 * bitmap, which is a 6-col x 8-row grid of 16px cells (indices 0..47).
 *
 * `AUTOTILE_INDEX[4*variant + q]` = the source sub-tile index for quadrant `q`,
 * where q: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right (destination
 * pixel offsets are `QUAD_X`/`QUAD_Y` * 16). Source pixel of a sub-tile index:
 *   sx = (idx % AUTOTILE_COLS) * 16,  sy = floor(idx / AUTOTILE_COLS) * 16.
 *
 * Cross-verified from two independent community implementations that agree
 * exactly (ForeverZer0's 1-based table == this 0-based table + 1, same quadrant
 * order). No external/MKXP-Z extraction needed:
 *   - rescued-rgss1-scripts-batch2/13_MinimapAndCustomMenu_Slipknot.rb:526-587
 *     (this 0-based `INDEX` + a working reference renderer)
 *   - rescued-rgss1-scripts-batch3/14_CustomResolution_ForeverZer0.rb:103-146
 *     (1-based `AUTO_INDEX` + `format_autotiles`)
 *
 * Animated autotiles (e.g. water) are N*96 wide = N frames; this static
 * renderer uses frame 0 (first 96 columns).
 */

/** Sub-tile columns in the 96px-wide source autotile bitmap (96 / 16). */
export const AUTOTILE_COLS = 6;

/** Destination quadrant offsets (in 16px units): TL, TR, BL, BR. */
export const QUAD_X = [0, 1, 0, 1] as const;
export const QUAD_Y = [0, 0, 1, 1] as const;

/**
 * Autotile PLACEMENT table (the inverse of AUTOTILE_INDEX): 8-neighbour mask ->
 * variant 0..47. Use when painting an autotile region — given which of the 8
 * surrounding cells hold the SAME autotile, this picks the variant to store
 * (`id = 48*(slot+1) + variant`) so it renders with correct edges.
 *
 * Bit convention (load-bearing): a set bit means that neighbour is the same autotile.
 *   bit0 0x01=N  bit1 0x02=E  bit2 0x04=S  bit3 0x08=W
 *   bit4 0x10=NE bit5 0x20=SE bit6 0x40=SW bit7 0x80=NW
 * A diagonal only matters when both its adjacent cardinals are present; this table
 * already encodes that (no pre-filtering of the mask needed).
 *
 * Derivation/verification: this is the mathematical inverse of AUTOTILE_INDEX above
 * (so it is guaranteed to render correctly through it), cross-checked against the
 * canonical RMXP "Chipset" autotile algorithm (FilterNeighbors + 4-corner classify)
 * documented at thepowertobringlight.blogspot.com. Anchors verified: full(255)->0,
 * isolated(0)->47, all-cardinals masks 0..15 select fill/inner per the 4 diagonal
 * bits, diagonal-irrelevance holds for all 256 masks. Variant 46 ([12,17,42,47]) is
 * the documented "47 unique + 1 duplicate" tile and is never emitted (47 is used for
 * the isolated tile).
 */
export const MASK_TO_VARIANT: readonly number[] = [
  47, 44, 43, 41, 42, 32, 35, 19, 45, 39, 33, 31, 37, 27, 23, 15, 47, 44, 43, 40, 42, 32, 35, 18, 45, 39, 33, 29, 37, 27, 23, 13,
  47, 44, 43, 41, 42, 32, 34, 17, 45, 39, 33, 31, 37, 27, 22, 11, 47, 44, 43, 40, 42, 32, 34, 16, 45, 39, 33, 29, 37, 27, 22, 9,
  47, 44, 43, 41, 42, 32, 35, 19, 45, 39, 33, 31, 36, 26, 21, 7, 47, 44, 43, 40, 42, 32, 35, 18, 45, 39, 33, 29, 36, 26, 21, 5,
  47, 44, 43, 41, 42, 32, 34, 17, 45, 39, 33, 31, 36, 26, 20, 3, 47, 44, 43, 40, 42, 32, 34, 16, 45, 39, 33, 29, 36, 26, 20, 1,
  47, 44, 43, 41, 42, 32, 35, 19, 45, 38, 33, 30, 37, 25, 23, 14, 47, 44, 43, 40, 42, 32, 35, 18, 45, 38, 33, 28, 37, 25, 23, 12,
  47, 44, 43, 41, 42, 32, 34, 17, 45, 38, 33, 30, 37, 25, 22, 10, 47, 44, 43, 40, 42, 32, 34, 16, 45, 38, 33, 28, 37, 25, 22, 8,
  47, 44, 43, 41, 42, 32, 35, 19, 45, 38, 33, 30, 36, 24, 21, 6, 47, 44, 43, 40, 42, 32, 35, 18, 45, 38, 33, 28, 36, 24, 21, 4,
  47, 44, 43, 41, 42, 32, 34, 17, 45, 38, 33, 30, 36, 24, 20, 2, 47, 44, 43, 40, 42, 32, 34, 16, 45, 38, 33, 28, 36, 24, 20, 0,
];

/** Neighbour offsets matching the MASK_TO_VARIANT bit order [dx, dy, bit]. */
export const NEIGHBOR_BITS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, 0x01], [1, 0, 0x02], [0, 1, 0x04], [-1, 0, 0x08],
  [1, -1, 0x10], [1, 1, 0x20], [-1, 1, 0x40], [-1, -1, 0x80],
];

/** 48 variants x 4 quadrants = 192 sub-tile indices (0-based into the 6x8 grid). */
export const AUTOTILE_INDEX: readonly number[] = [
  26, 27, 32, 33,  4, 27, 32, 33, 26,  5, 32, 33,  4,  5, 32, 33,
  26, 27, 32, 11,  4, 27, 32, 11, 26,  5, 32, 11,  4,  5, 32, 11,
  26, 27, 10, 33,  4, 27, 10, 33, 26,  5, 10, 33,  4,  5, 10, 33,
  26, 27, 10, 11,  4, 27, 10, 11, 26,  5, 10, 11,  4,  5, 10, 11,
  24, 25, 30, 31, 24,  5, 30, 31, 24, 25, 30, 11, 24,  5, 30, 11,
  14, 15, 20, 21, 14, 15, 20, 11, 14, 15, 10, 21, 14, 15, 10, 11,
  28, 29, 34, 35, 28, 29, 10, 35,  4, 29, 34, 35,  4, 29, 10, 35,
  38, 39, 44, 45,  4, 39, 44, 45, 38,  5, 44, 45,  4,  5, 44, 45,
  24, 29, 30, 35, 14, 15, 44, 45, 12, 13, 18, 19, 12, 13, 18, 11,
  16, 17, 22, 23, 16, 17, 10, 23, 40, 41, 46, 47,  4, 41, 46, 47,
  36, 37, 42, 43, 36,  5, 42, 43, 12, 17, 18, 23, 12, 13, 42, 43,
  36, 41, 42, 47, 16, 17, 46, 47, 12, 17, 42, 47,  0,  1,  6,  7,
];
