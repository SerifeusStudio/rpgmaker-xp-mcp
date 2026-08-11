// Extract RGSS scripts from Scripts.rxdata (array of [magic, title, zlib-deflated code])
import { readFile, writeFile, mkdir } from 'fs/promises';
import { inflateSync } from 'zlib';
import { load } from '../dist/vendor/marshal/index.js';

const src = process.argv[2] ?? 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data/Scripts.rxdata';
const outDir = process.argv[3] ?? new URL('../research/scripts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const scripts = load(await readFile(src), { string: 'binary' });
await mkdir(outDir, { recursive: true });
const dec = new TextDecoder();
let i = 0;
for (const [magic, title, code] of scripts) {
  const name = dec.decode(title).trim() || 'untitled';
  const body = inflateSync(Buffer.from(code)).toString('utf8');
  const safe = String(i).padStart(3, '0') + '-' + name.replace(/[^\w\- ]/g, '_') + '.rb';
  await writeFile(`${outDir}/${safe}`, body);
  i++;
}
console.log(`Extracted ${i} scripts to ${outDir}`);
