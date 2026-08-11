import { readFile, writeFile } from 'fs/promises';
import { load, dump, RubyObject } from '../vendor/marshal/index.js';

/**
 * Ruby Marshal <-> plain JSON conversion layer for RPG Maker XP (.rxdata).
 *
 * RPG Maker XP data files are Ruby 1.8 Marshal dumps of RGSS objects
 * (RPG::Actor, RPG::Map, etc.). This module converts them to plain JSON
 * structures and back:
 *
 *   - Ruby objects become `{ "_class": "RPG::Actor", "<ivar>": ... }`
 *     (instance variables with the leading `@` stripped)
 *   - The RGSS binary classes Table, Color and Tone get dedicated codecs
 *   - Ruby Hashes (always integer-keyed in XP data: map events, MapInfos)
 *     become plain objects with numeric string keys
 *   - Strings are decoded as UTF-8; on save they are dumped as raw byte
 *     strings (no encoding ivar) so files stay loadable by XP's Ruby 1.8
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Table / Color / Tone codecs (classes serialized via _dump/_load)
// ---------------------------------------------------------------------------

export interface PlainTable {
  _class: 'Table';
  dim: number;
  xsize: number;
  ysize: number;
  zsize: number;
  data: number[];
}

function decodeTable(bytes: Uint8Array): PlainTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dim = view.getUint32(0, true);
  const xsize = view.getUint32(4, true);
  const ysize = view.getUint32(8, true);
  const zsize = view.getUint32(12, true);
  const items = view.getUint32(16, true);
  const data: number[] = new Array(items);
  for (let i = 0; i < items; i++) {
    data[i] = view.getInt16(20 + i * 2, true);
  }
  return { _class: 'Table', dim, xsize, ysize, zsize, data };
}

function encodeTable(table: PlainTable): RubyObject {
  const items = table.xsize * table.ysize * table.zsize;
  if (table.data.length !== items) {
    throw new Error(
      `Table data length ${table.data.length} does not match xsize*ysize*zsize=${items}`
    );
  }
  const buf = new Uint8Array(20 + items * 2);
  const view = new DataView(buf.buffer);
  view.setUint32(0, table.dim, true);
  view.setUint32(4, table.xsize, true);
  view.setUint32(8, table.ysize, true);
  view.setUint32(12, table.zsize, true);
  view.setUint32(16, items, true);
  for (let i = 0; i < items; i++) {
    view.setInt16(20 + i * 2, table.data[i], true);
  }
  const obj = new RubyObject(Symbol.for('Table'));
  obj.userDefined = buf;
  return obj;
}

interface PlainColorTone {
  _class: 'Color' | 'Tone';
  red: number;
  green: number;
  blue: number;
  alpha: number; // "gray" for Tone
}

function decodeColorTone(className: 'Color' | 'Tone', bytes: Uint8Array): PlainColorTone {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    _class: className,
    red: view.getFloat64(0, true),
    green: view.getFloat64(8, true),
    blue: view.getFloat64(16, true),
    alpha: view.getFloat64(24, true),
  };
}

function encodeColorTone(value: PlainColorTone): RubyObject {
  const buf = new Uint8Array(32);
  const view = new DataView(buf.buffer);
  view.setFloat64(0, value.red, true);
  view.setFloat64(8, value.green, true);
  view.setFloat64(16, value.blue, true);
  view.setFloat64(24, value.alpha, true);
  const obj = new RubyObject(Symbol.for(value._class));
  obj.userDefined = buf;
  return obj;
}

// ---------------------------------------------------------------------------
// Generic conversion
// ---------------------------------------------------------------------------

export function toPlain(value: unknown): any {
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (value instanceof Uint8Array) {
    // String that had no encoding info; XP data is UTF-8 in practice
    return textDecoder.decode(value);
  }
  if (typeof value === 'symbol') {
    return Symbol.keyFor(value);
  }
  if (Array.isArray(value)) {
    return value.map(toPlain);
  }
  if (value instanceof Map) {
    // Ruby Hash — integer-keyed in XP data (map events, MapInfos)
    const obj: any = {};
    for (const [k, v] of value) {
      const key = k instanceof Uint8Array ? textDecoder.decode(k) : String(k);
      obj[key] = toPlain(v);
    }
    return obj;
  }
  if (value instanceof RubyObject) {
    const className = Symbol.keyFor(value.class) ?? '?';
    if (value.userDefined) {
      if (className === 'Table') return decodeTable(value.userDefined);
      if (className === 'Color' || className === 'Tone') {
        return decodeColorTone(className, value.userDefined);
      }
      throw new Error(`Unsupported user-defined class: ${className}`);
    }
    const obj: any = { _class: className };
    for (const sym of Object.getOwnPropertySymbols(value)) {
      const key = Symbol.keyFor(sym);
      if (!key || !key.startsWith('@')) continue;
      obj[key.slice(1)] = toPlain((value as any)[sym]);
    }
    return obj;
  }
  throw new Error(`Cannot convert Ruby value to JSON: ${String(value)}`);
}

export function toRuby(value: any): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    // Dump as raw byte string (Ruby 1.8 compatible — no encoding ivar)
    return textEncoder.encode(value);
  }
  if (Array.isArray(value)) {
    return value.map(toRuby);
  }
  if (typeof value === 'object') {
    if (value._class === 'Table') {
      return encodeTable(value as PlainTable);
    }
    if (value._class === 'Color' || value._class === 'Tone') {
      return encodeColorTone(value as PlainColorTone);
    }
    if (typeof value._class === 'string') {
      const obj = new RubyObject(Symbol.for(value._class));
      for (const key of Object.keys(value)) {
        if (key === '_class') continue;
        (obj as any)[Symbol.for('@' + key)] = toRuby(value[key]);
      }
      return obj;
    }
    // Plain object without _class — a Ruby Hash with integer keys
    const map = new Map<unknown, unknown>();
    for (const key of Object.keys(value)) {
      const num = Number(key);
      map.set(Number.isInteger(num) ? num : textEncoder.encode(key), toRuby(value[key]));
    }
    return map;
  }
  throw new Error(`Cannot convert JSON value to Ruby: ${String(value)}`);
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Read and parse an .rxdata file into plain JSON structures
 */
export async function readRxdataFile<T>(filePath: string): Promise<T> {
  try {
    const content = await readFile(filePath);
    const raw = load(content, { string: 'utf8', hash: 'map' });
    return toPlain(raw) as T;
  } catch (error) {
    throw new Error(`Failed to read rxdata file ${filePath}: ${error}`);
  }
}

/**
 * Serialize plain JSON structures and write an .rxdata file
 * (backs the original up to .mcp-backup/ once per session)
 */
export async function writeRxdataFile(filePath: string, data: any): Promise<void> {
  try {
    const { backupBeforeWrite } = await import('./fileHandler.js');
    await backupBeforeWrite(filePath);
    const bytes = dump(toRuby(data));
    await writeFile(filePath, bytes);
  } catch (error) {
    throw new Error(`Failed to write rxdata file ${filePath}: ${error}`);
  }
}

/**
 * Raw load/save for files containing binary strings (Scripts.rxdata holds
 * zlib-compressed source) — bypasses the UTF-8 string conversion that
 * would corrupt binary data. Strings stay as Uint8Array.
 */
export async function readRxdataRaw(filePath: string): Promise<unknown> {
  try {
    const content = await readFile(filePath);
    return load(content, { string: 'binary', hash: 'map' });
  } catch (error) {
    throw new Error(`Failed to read rxdata file ${filePath}: ${error}`);
  }
}

export async function writeRxdataRaw(filePath: string, value: unknown): Promise<void> {
  try {
    const { backupBeforeWrite } = await import('./fileHandler.js');
    await backupBeforeWrite(filePath);
    await writeFile(filePath, dump(value));
  } catch (error) {
    throw new Error(`Failed to write rxdata file ${filePath}: ${error}`);
  }
}
