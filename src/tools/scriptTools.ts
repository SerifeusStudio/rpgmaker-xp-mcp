import { inflateSync, deflateSync } from 'zlib';
import { readRxdataRaw, writeRxdataRaw } from '../utils/rxdata.js';
import { getDataPath } from '../utils/fileHandler.js';

/**
 * Scripts.rxdata is an array of [magic_int, title, zlib-deflated source]
 * triples. Per-script magic numbers are disregarded by the editor, so we
 * preserve them on update and assign sequential ones on create. Strings
 * are handled as raw bytes end-to-end — the compressed source must never
 * go through UTF-8 decoding.
 */

type RawScript = [number, Uint8Array, Uint8Array];

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function scriptsPath(projectPath: string): string {
  return getDataPath(projectPath, 'Scripts.rxdata');
}

async function loadScripts(projectPath: string): Promise<RawScript[]> {
  const raw = (await readRxdataRaw(scriptsPath(projectPath))) as RawScript[];
  if (!Array.isArray(raw)) {
    throw new Error('Scripts.rxdata did not contain an array');
  }
  return raw;
}

function decodeSource(deflated: Uint8Array): string {
  return inflateSync(Buffer.from(deflated)).toString('utf8');
}

function encodeSource(code: string): Uint8Array {
  return new Uint8Array(deflateSync(Buffer.from(code, 'utf8'), { level: 9 }));
}

/**
 * List all scripts (index, name, source size) without their source code
 */
export async function getScripts(
  projectPath: string
): Promise<{ index: number; name: string; sourceLength: number }[]> {
  const scripts = await loadScripts(projectPath);
  return scripts.map(([, title, code], index) => ({
    index,
    name: textDecoder.decode(title),
    sourceLength: inflateSync(Buffer.from(code)).length,
  }));
}

/**
 * Get a script's source code by index
 */
export async function getScript(
  projectPath: string,
  index: number
): Promise<{ index: number; name: string; code: string }> {
  const scripts = await loadScripts(projectPath);
  const script = scripts[index];
  if (!script) {
    throw new Error(`Script index ${index} not found (0-${scripts.length - 1})`);
  }
  return { index, name: textDecoder.decode(script[1]), code: decodeSource(script[2]) };
}

/**
 * Replace a script's source code (and optionally its name)
 */
export async function updateScript(
  projectPath: string,
  index: number,
  code?: string,
  name?: string
): Promise<{ index: number; name: string }> {
  const scripts = await loadScripts(projectPath);
  const script = scripts[index];
  if (!script) {
    throw new Error(`Script index ${index} not found (0-${scripts.length - 1})`);
  }
  if (name !== undefined) script[1] = textEncoder.encode(name);
  if (code !== undefined) script[2] = encodeSource(code);
  await writeRxdataRaw(scriptsPath(projectPath), scripts);
  return { index, name: textDecoder.decode(script[1]) };
}

/**
 * Create a new script. By default it is inserted just above "Main"
 * (the conventional slot for custom scripts); pass position to override.
 */
export async function createScript(
  projectPath: string,
  name: string,
  code: string,
  position?: number
): Promise<{ index: number; name: string }> {
  const scripts = await loadScripts(projectPath);
  let insertAt = position;
  if (insertAt === undefined) {
    const mainIndex = scripts.findIndex(([, title]) => textDecoder.decode(title) === 'Main');
    insertAt = mainIndex >= 0 ? mainIndex : scripts.length;
  }
  insertAt = Math.max(0, Math.min(insertAt, scripts.length));
  const magic = scripts.length > 0 ? Math.max(...scripts.map(([m]) => m)) + 1 : 1;
  scripts.splice(insertAt, 0, [magic, textEncoder.encode(name), encodeSource(code)]);
  await writeRxdataRaw(scriptsPath(projectPath), scripts);
  return { index: insertAt, name };
}

/**
 * Search script sources for a string or regex pattern
 */
export async function searchScripts(
  projectPath: string,
  pattern: string
): Promise<{ index: number; name: string; line: number; text: string }[]> {
  const scripts = await loadScripts(projectPath);
  const regex = new RegExp(pattern);
  const matches: { index: number; name: string; line: number; text: string }[] = [];
  scripts.forEach(([, title, code], index) => {
    const lines = decodeSource(code).split('\n');
    lines.forEach((text, i) => {
      if (regex.test(text)) {
        matches.push({ index, name: textDecoder.decode(title), line: i + 1, text: text.trimEnd() });
      }
    });
  });
  return matches;
}
