/**
 * Extract Ruby script names and source code from RPG Maker XP Scripts.rxdata files.
 * Uses the project's own vendored Marshal decoder (dist/).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { inflateSync } from 'zlib';
import { load } from './dist/vendor/marshal/index.js';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const textDecoder = new TextDecoder('utf8');

async function readScriptsRxdata(filePath) {
  const content = await readFile(filePath);
  const raw = load(content, { string: 'binary', hash: 'map' });
  if (!Array.isArray(raw)) {
    throw new Error('Scripts.rxdata did not contain an array');
  }
  return raw;
}

function decodeSource(deflated) {
  try {
    return inflateSync(Buffer.from(deflated)).toString('utf8');
  } catch (e) {
    return `<decompression error: ${e.message}>`;
  }
}

async function extractScripts(filePath, label) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`EXTRACTING: ${label}`);
  console.log(`FILE: ${filePath}`);
  console.log('='.repeat(80));

  const scripts = await readScriptsRxdata(filePath);
  console.log(`\nTotal scripts: ${scripts.length}\n`);

  const names = [];
  const interestingScripts = [];

  const interestingPatterns = [
    /rtab/i,
    /battler/i,
    /scene_battle/i,
    /animated/i,
    /animat/i,
    /sprite_battler/i,
    /game_battler/i,
    /battle/i,
  ];

  for (let i = 0; i < scripts.length; i++) {
    const [magic, titleBytes, codeBytes] = scripts[i];
    const name = textDecoder.decode(titleBytes);
    const source = decodeSource(codeBytes);
    names.push({ index: i, name, sourceLength: source.length });

    const isInteresting = interestingPatterns.some(p => p.test(name));
    if (isInteresting) {
      interestingScripts.push({ index: i, name, source });
    }
  }

  console.log('--- ALL SCRIPT NAMES ---\n');
  for (const { index, name, sourceLength } of names) {
    const marker = interestingPatterns.some(p => p.test(name)) ? ' *** INTERESTING ***' : '';
    console.log(`[${String(index).padStart(3, '0')}] ${name || '(blank)'}  (${sourceLength} chars)${marker}`);
  }

  console.log(`\n--- INTERESTING SCRIPTS (${interestingScripts.length} found) ---\n`);
  for (const { index, name, source } of interestingScripts) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`SCRIPT [${index}]: ${name}`);
    console.log(`${'─'.repeat(80)}`);
    console.log(source);
  }

  // Also write each interesting script to a file
  const outDir = join(__dirname, 'extracted_scripts', label.replace(/[^a-z0-9_]/gi, '_'));
  await mkdir(outDir, { recursive: true });

  // Write all script names to an index file
  const indexContent = names.map(({ index, name, sourceLength }) =>
    `[${String(index).padStart(3, '0')}] ${name || '(blank)'}  (${sourceLength} chars)`
  ).join('\n');
  await writeFile(join(outDir, '_index.txt'), indexContent, 'utf8');

  // Write all scripts to individual files
  for (let i = 0; i < scripts.length; i++) {
    const [, titleBytes, codeBytes] = scripts[i];
    const name = textDecoder.decode(titleBytes);
    const source = decodeSource(codeBytes);
    const safeName = name.replace(/[^a-z0-9_\-. ]/gi, '_') || 'blank';
    await writeFile(join(outDir, `${String(i).padStart(3, '0')}_${safeName}.rb`), source, 'utf8');
  }

  console.log(`\nAll scripts written to: ${outDir}`);
  return { names, interestingScripts };
}

async function main() {
  // Pass one or more Scripts.rxdata paths as CLI args:
  //   node extract_scripts.mjs <path/to/Scripts.rxdata> [more...]
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node extract_scripts.mjs <Scripts.rxdata> [more Scripts.rxdata ...]');
    process.exit(1);
  }
  const files = args.map((p) => ({ path: p, label: basename(dirname(dirname(p))) || basename(p) }));

  for (const { path, label } of files) {
    try {
      await extractScripts(path, label);
    } catch (e) {
      console.error(`\nERROR processing ${label}: ${e.message}`);
    }
  }
}

main().catch(console.error);
