// End-to-end tool test: copy the RMXP new-project template Data folder into
// a scratch project, then exercise every tool module against it.
import { mkdir, rm, cp, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import * as actorTools from '../dist/tools/actorTools.js';
import * as itemTools from '../dist/tools/itemTools.js';
import * as skillTools from '../dist/tools/skillTools.js';
import * as mapTools from '../dist/tools/mapTools.js';
import * as systemTools from '../dist/tools/systemTools.js';
import * as scriptTools from '../dist/tools/scriptTools.js';
import * as databaseTools from '../dist/tools/databaseTools.js';
import { validateProjectPath } from '../dist/utils/fileHandler.js';

const TEMPLATE = 'C:/Program Files (x86)/Steam/steamapps/common/RPGXP/System/Data';
const PROJECT = new URL('./scratch-project', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

let passed = 0, failed = 0;
async function check(label, fn) {
  try {
    const result = await fn();
    passed++;
    console.log(`PASS ${label}${result !== undefined ? ': ' + JSON.stringify(result).slice(0, 120) : ''}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}: ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// --- set up scratch project ---
await rm(PROJECT, { recursive: true, force: true });
await mkdir(join(PROJECT, 'Data'), { recursive: true });
await cp(TEMPLATE, join(PROJECT, 'Data'), { recursive: true });
await writeFile(join(PROJECT, 'Game.ini'),
  '[Game]\r\nLibrary=RGSS104E.dll\r\nScripts=Data\\Scripts.rxdata\r\nTitle=Scratch Test\r\nRTP1=Standard\r\nRTP2=\r\nRTP3=\r\n',
  'latin1');

await check('validateProjectPath', async () => {
  assert(await validateProjectPath(PROJECT), 'should be valid');
});

// --- actors ---
await check('getActors', async () => {
  const actors = await actorTools.getActors(PROJECT);
  assert(actors.length === 8, `expected 8 template actors, got ${actors.length}`);
  assert(actors[0].name === 'Aluxes' || actors[0].name.length > 0, 'first actor has a name');
  return actors.map(a => a.name);
});
await check('getActor includes parameters table', async () => {
  const actor = await actorTools.getActor(PROJECT, 1);
  assert(actor.parameters._class === 'Table', 'parameters is a Table');
  assert(actor.parameters.xsize === 6, '6 params');
  return { name: actor.name, hpAtLv1: actor.parameters.data[0 + 1 * 6] };
});
await check('createActor + searchActors', async () => {
  const actor = await actorTools.createActor(PROJECT, { name: 'Testy McTestface', class_id: 2 });
  const found = await actorTools.searchActors(PROJECT, 'mctest');
  assert(found.length === 1 && found[0].id === actor.id, 'created actor is searchable');
  return { id: actor.id };
});
await check('updateActor', async () => {
  const updated = await actorTools.updateActor(PROJECT, 1, { initial_level: 5 });
  assert(updated.initial_level === 5, 'level updated');
});

// --- items / weapons / armors / skills lists ---
await check('getItems/getWeapons/getArmors/getSkills', async () => {
  const [items, weapons, armors, skills] = await Promise.all([
    itemTools.getItems(PROJECT), itemTools.getWeapons(PROJECT),
    itemTools.getArmors(PROJECT), itemTools.getSkills(PROJECT),
  ]);
  assert(items.length > 0 && weapons.length > 0 && armors.length > 0 && skills.length > 0, 'all non-empty');
  return { items: items.length, weapons: weapons.length, armors: armors.length, skills: skills.length };
});
await check('updateItem + searchItems', async () => {
  await itemTools.updateItem(PROJECT, 1, { price: 123 });
  const results = await itemTools.searchItems(PROJECT, 'potion');
  assert(results.length > 0, 'found potions');
  const item1 = (await itemTools.getItems(PROJECT)).find(i => i.id === 1);
  assert(item1.price === 123, 'price persisted');
});

// --- skills ---
await check('createDamageSkill (magical)', async () => {
  const skill = await skillTools.createDamageSkill(PROJECT, 'Mega Fireball', 250, 15, 1, 1, 'Big fire', false);
  assert(skill.power === 250 && skill.int_f === 100 && skill.atk_f === 0, 'magical profile');
  return { id: skill.id };
});
await check('createHealingSkill', async () => {
  const skill = await skillTools.createHealingSkill(PROJECT, 'Mass Heal', 300, 30, 4, 'Heals party');
  assert(skill.power === -300, 'healing is negative power');
});
await check('createStateSkill', async () => {
  const skill = await skillTools.createStateSkill(PROJECT, 'Venom Strike', 3, 80, 10, 1);
  assert(skill.plus_state_set.includes(3), 'state set');
});
await check('updateSkill + searchSkills + getSkill', async () => {
  const found = await skillTools.searchSkills(PROJECT, 'mega fireball');
  assert(found.length === 1, 'found created skill');
  await skillTools.updateSkill(PROJECT, found[0].id, { sp_cost: 20 });
  const skill = await skillTools.getSkill(PROJECT, found[0].id);
  assert(skill.sp_cost === 20, 'sp_cost updated');
});

// --- maps ---
await check('getMapInfos', async () => {
  const infos = await mapTools.getMapInfos(PROJECT);
  assert(infos['1'], 'map 1 exists');
  return infos['1'].name;
});
await check('getMap (summarized + full tiles)', async () => {
  const map = await mapTools.getMap(PROJECT, 1);
  assert(typeof map.data.data === 'string', 'tiles omitted by default');
  const full = await mapTools.getMap(PROJECT, 1, true);
  assert(Array.isArray(full.data.data), 'tiles included on request');
  assert(full.data.data.length === full.width * full.height * 3, 'tile count = w*h*3');
  return { width: map.width, height: map.height, tileset: map.tileset_id };
});
await check('createMapEvent + getMapEvents + searchMapEvents', async () => {
  const event = await mapTools.createMapEvent(PROJECT, 1, { name: 'Treasure Chest', x: 5, y: 7 });
  assert(event.pages.length === 1, 'default page created');
  const events = await mapTools.getMapEvents(PROJECT, 1);
  assert(events.some(e => e.id === event.id), 'event listed');
  const found = await mapTools.searchMapEvents(PROJECT, 1, 'treasure');
  assert(found.length === 1, 'event searchable');
  return { id: event.id };
});
await check('addEventCommand (Show Text)', async () => {
  const events = await mapTools.searchMapEvents(PROJECT, 1, 'treasure');
  const id = events[0].id;
  const list = await mapTools.addEventCommand(PROJECT, 1, id, 0, { code: 101, parameters: ['You found a treasure!'] });
  assert(list[0].code === 101, 'command inserted at start');
  assert(list[list.length - 1].code === 0, 'terminator preserved at end');
});
await check('updateMapEvent', async () => {
  const events = await mapTools.searchMapEvents(PROJECT, 1, 'treasure');
  const updated = await mapTools.updateMapEvent(PROJECT, 1, events[0].id, { x: 10, y: 12 });
  assert(updated.x === 10 && updated.y === 12, 'moved');
});

// --- system ---
await check('getSystem', async () => {
  const system = await systemTools.getSystem(PROJECT);
  assert(system._class === 'RPG::System', 'is RPG::System');
  assert(Array.isArray(system.variables), 'has variables');
  return { start_map: system.start_map_id, magic: system.magic_number };
});
await check('set/get variable + switch names', async () => {
  await systemTools.setVariableName(PROJECT, 1, 'Quest Progress');
  await systemTools.setSwitchName(PROJECT, 2, 'Door Opened');
  const vars = await systemTools.getVariables(PROJECT);
  const switches = await systemTools.getSwitches(PROJECT);
  assert(vars[1] === 'Quest Progress' && switches[2] === 'Door Opened', 'names persisted');
});
await check('get/update game title', async () => {
  assert((await systemTools.getGameTitle(PROJECT)) === 'Scratch Test', 'initial title');
  await systemTools.updateGameTitle(PROJECT, 'My Epic Adventure');
  assert((await systemTools.getGameTitle(PROJECT)) === 'My Epic Adventure', 'title updated');
  const ini = await readFile(join(PROJECT, 'Game.ini'), 'latin1');
  assert(ini.includes('Library=RGSS104E.dll'), 'rest of ini intact');
});
await check('updateStartingPosition', async () => {
  await systemTools.updateStartingPosition(PROJECT, 1, 3, 4);
  const system = await systemTools.getSystem(PROJECT);
  assert(system.start_map_id === 1 && system.start_x === 3 && system.start_y === 4, 'persisted');
});

// --- QoL: show text helper ---
await check('addShowText splits 101/401 and boxes of 4', async () => {
  const events = await mapTools.searchMapEvents(PROJECT, 1, 'treasure');
  const id = events[0].id;
  const before = (await mapTools.getMapEvent(PROJECT, 1, id)).pages[0].list.length;
  const list = await mapTools.addShowText(PROJECT, 1, id, 0, 'L1\nL2\nL3\nL4\nL5');
  const added = list.slice(before - 1, before - 1 + 5);
  assert(added[0].code === 101 && added[0].parameters[0] === 'L1', 'first line is 101');
  assert(added[1].code === 401 && added[2].code === 401 && added[3].code === 401, 'lines 2-4 are 401');
  assert(added[4].code === 101 && added[4].parameters[0] === 'L5', 'line 5 starts a new box');
  assert(list[list.length - 1].code === 0, 'terminator preserved');
});

// --- QoL: magic_number bump on map writes ---
await check('saveMap bumps System.magic_number', async () => {
  const before = (await systemTools.getSystem(PROJECT)).magic_number;
  await mapTools.updateMapEvent(PROJECT, 1, 1, { x: 11 });
  const after = (await systemTools.getSystem(PROJECT)).magic_number;
  assert(before !== after, 'magic_number changed');
});

// --- QoL: backups ---
await check('backups created in Data/.mcp-backup', async () => {
  const bak = join(PROJECT, 'Data', '.mcp-backup');
  const files = (await import('fs/promises')).readdir(bak);
  const names = await files;
  assert(names.includes('Actors.rxdata.bak'), 'Actors backup exists');
  assert(names.includes('System.rxdata.bak'), 'System backup exists');
  return { backups: names.length };
});

// --- database tools ---
await check('getDatabase classes/states/tilesets (summarized)', async () => {
  const classes = await databaseTools.getDatabase(PROJECT, 'classes');
  const tilesets = await databaseTools.getDatabase(PROJECT, 'tilesets');
  assert(classes.length > 0 && classes[0]._class === 'RPG::Class', 'classes load');
  assert(tilesets[0].passages.data === '<omitted>', 'tileset Tables summarized');
  return { classes: classes.length, tilesets: tilesets.length };
});
await check('getDatabaseEntry + updateDatabaseEntry (state)', async () => {
  const state = await databaseTools.getDatabaseEntry(PROJECT, 'states', 3);
  assert(state._class === 'RPG::State', 'full state entry');
  await databaseTools.updateDatabaseEntry(PROJECT, 'states', 3, { hold_turn: 7 });
  const after = await databaseTools.getDatabaseEntry(PROJECT, 'states', 3);
  assert(after.hold_turn === 7, 'update persisted');
  return { name: state.name };
});
await check('updateDatabaseEntry tileset passages Table round-trips', async () => {
  const tileset = await databaseTools.getDatabaseEntry(PROJECT, 'tilesets', 1);
  const passages = tileset.passages;
  passages.data[384 - 1] = 15;
  await databaseTools.updateDatabaseEntry(PROJECT, 'tilesets', 1, { passages });
  const after = await databaseTools.getDatabaseEntry(PROJECT, 'tilesets', 1);
  assert(after.passages.data[384 - 1] === 15, 'Table edit persisted');
});

// --- script tools ---
await check('getScripts lists default scripts', async () => {
  const scripts = await scriptTools.getScripts(PROJECT);
  assert(scripts.length > 50, 'has default scripts');
  assert(scripts.some(s => s.name === 'Main'), 'Main present');
  return { count: scripts.length };
});
await check('getScript returns Ruby source', async () => {
  const scripts = await scriptTools.getScripts(PROJECT);
  const battler = scripts.find(s => s.name === 'Game_Battler 3');
  const { code } = await scriptTools.getScript(PROJECT, battler.index);
  assert(code.includes('def skill_effect'), 'source decoded');
});
await check('createScript inserts above Main + updateScript + searchScripts', async () => {
  const created = await scriptTools.createScript(PROJECT, 'MCP_Test', '# hello from mcp\nmodule MCPTest\nend');
  const scripts = await scriptTools.getScripts(PROJECT);
  const main = scripts.find(s => s.name === 'Main');
  assert(created.index === main.index - 1, 'inserted just above Main');
  await scriptTools.updateScript(PROJECT, created.index, '# updated\nmodule MCPTest\n  VERSION = 2\nend');
  const found = await scriptTools.searchScripts(PROJECT, 'VERSION = 2');
  assert(found.length === 1 && found[0].name === 'MCP_Test', 'search finds updated code');
});
await check('Scripts.rxdata still loads raw after edits (binary-safe)', async () => {
  const { readRxdataRaw } = await import('../dist/utils/rxdata.js');
  const raw = await readRxdataRaw(join(PROJECT, 'Data', 'Scripts.rxdata'));
  assert(Array.isArray(raw) && raw.every(s => Array.isArray(s) && s.length === 3), 'structure intact');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
