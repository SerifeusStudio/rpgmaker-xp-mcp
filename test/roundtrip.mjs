// Round-trip test: load real RMXP template rxdata, convert to plain JSON,
// convert back to Ruby Marshal, reload, and verify semantic equality.
import { readFile } from 'fs/promises';
import { join } from 'path';
import { load, dump } from '../dist/vendor/marshal/index.js';
import { toPlain, toRuby } from '../dist/utils/rxdata.js';

// Regression: negative multibyte Fixnums (upstream @hyrious/marshal bug).
// -150 encodes as [0xff, 0x6a]; the buggy decoder returned +106.
{
  const cases = [-124, -150, -255, -256, -2000, -32768, -65536, -1073741824, 150, 2000, 1073741823];
  for (const n of cases) {
    const got = load(dump(n));
    if (got !== n) {
      console.log(`FAIL fixnum codec: ${n} round-tripped as ${got}`);
      process.exit(1);
    }
  }
  const raw = load(new Uint8Array([4, 8, 0x69, 0xff, 0x6a]));
  if (raw !== -150) {
    console.log(`FAIL fixnum decode: [ff 6a] should be -150, got ${raw}`);
    process.exit(1);
  }
  console.log('PASS fixnum codec (negative multibyte regression)');
}

const DATA_DIR = process.argv[2] ?? 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data';

const files = [
  'Actors.rxdata',
  'Classes.rxdata',
  'Skills.rxdata',
  'Items.rxdata',
  'Weapons.rxdata',
  'Armors.rxdata',
  'Enemies.rxdata',
  'States.rxdata',
  'Animations.rxdata',
  'Tilesets.rxdata',
  'CommonEvents.rxdata',
  'Troops.rxdata',
  'MapInfos.rxdata',
  'Map001.rxdata',
  'System.rxdata',
];

let failed = 0;
for (const file of files) {
  try {
    const bytes = await readFile(join(DATA_DIR, file));
    const raw = load(bytes, { string: 'utf8', hash: 'map' });
    const plain = toPlain(raw);
    const dumped = dump(toRuby(plain));
    const reloaded = toPlain(load(dumped, { string: 'utf8', hash: 'map' }));
    const a = JSON.stringify(plain);
    const b = JSON.stringify(reloaded);
    if (a === b) {
      const byteIdentical = bytes.length === dumped.length && Buffer.from(dumped).equals(bytes);
      console.log(`PASS ${file} (${bytes.length} bytes in, ${dumped.length} bytes out${byteIdentical ? ', byte-identical' : ''})`);
    } else {
      failed++;
      console.log(`FAIL ${file}: round-trip mismatch`);
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
          console.log(`  first diff at char ${i}:`);
          console.log(`  a: ...${a.slice(Math.max(0, i - 80), i + 80)}...`);
          console.log(`  b: ...${b.slice(Math.max(0, i - 80), i + 80)}...`);
          break;
        }
      }
    }
  } catch (err) {
    failed++;
    console.log(`FAIL ${file}: ${err.message}`);
  }
}
console.log(failed ? `\n${failed} file(s) failed` : '\nAll files round-tripped OK');
process.exit(failed ? 1 : 0);
