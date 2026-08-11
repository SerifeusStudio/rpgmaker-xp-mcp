import { readFile, writeFile } from 'fs/promises';
import { randomInt } from 'crypto';
import {
  readRxdataFile,
  writeRxdataFile,
  getDataPath,
  getGameIniPath,
  backupBeforeWrite,
} from '../utils/fileHandler.js';
import { SystemData } from '../utils/types.js';

const SYSTEM_FILE = 'System.rxdata';

async function loadSystem(projectPath: string): Promise<SystemData> {
  return readRxdataFile<SystemData>(getDataPath(projectPath, SYSTEM_FILE));
}

async function saveSystem(projectPath: string, system: SystemData): Promise<void> {
  await writeRxdataFile(getDataPath(projectPath, SYSTEM_FILE), system);
}

/**
 * Get system data
 */
export async function getSystem(projectPath: string): Promise<SystemData> {
  return loadSystem(projectPath);
}

/**
 * Regenerate System.magic_number, mirroring what the editor does on every
 * save. The runtime compares this against the value stored in save files
 * to decide whether to reload (refresh) map data, so map edits should
 * bump it or stale saves would keep playing the old map.
 */
export async function touchMagicNumber(projectPath: string): Promise<void> {
  const system = await loadSystem(projectPath);
  system.magic_number = randomInt(0, 0x40000000);
  await saveSystem(projectPath, system);
}

/**
 * Get all game variable names (index = variable ID; index 0 is unused)
 */
export async function getVariables(projectPath: string): Promise<(string | null)[]> {
  const system = await loadSystem(projectPath);
  return system.variables;
}

/**
 * Set a variable name
 */
export async function setVariableName(
  projectPath: string,
  variableId: number,
  name: string
): Promise<void> {
  const system = await loadSystem(projectPath);
  if (variableId < 1 || variableId >= system.variables.length) {
    throw new Error(
      `Variable ID ${variableId} out of range (1-${system.variables.length - 1})`
    );
  }
  system.variables[variableId] = name;
  await saveSystem(projectPath, system);
}

/**
 * Get all game switch names (index = switch ID; index 0 is unused)
 */
export async function getSwitches(projectPath: string): Promise<(string | null)[]> {
  const system = await loadSystem(projectPath);
  return system.switches;
}

/**
 * Set a switch name
 */
export async function setSwitchName(
  projectPath: string,
  switchId: number,
  name: string
): Promise<void> {
  const system = await loadSystem(projectPath);
  if (switchId < 1 || switchId >= system.switches.length) {
    throw new Error(`Switch ID ${switchId} out of range (1-${system.switches.length - 1})`);
  }
  system.switches[switchId] = name;
  await saveSystem(projectPath, system);
}

/**
 * Get the game title. In RPG Maker XP the title lives in Game.ini,
 * not in System.rxdata.
 */
export async function getGameTitle(projectPath: string): Promise<string> {
  const ini = await readFile(getGameIniPath(projectPath), 'latin1');
  const match = ini.match(/^\s*Title\s*=\s*(.*?)\s*$/m);
  if (!match) {
    throw new Error('Title entry not found in Game.ini');
  }
  return match[1];
}

/**
 * Update the game title in Game.ini
 */
export async function updateGameTitle(projectPath: string, title: string): Promise<void> {
  const iniPath = getGameIniPath(projectPath);
  const ini = await readFile(iniPath, 'latin1');
  if (!/^\s*Title\s*=/m.test(ini)) {
    throw new Error('Title entry not found in Game.ini');
  }
  const updated = ini.replace(/^(\s*Title\s*=).*$/m, `$1${title}`);
  await backupBeforeWrite(iniPath);
  await writeFile(iniPath, updated, 'latin1');
}

/**
 * Update the party's starting position (map and coordinates)
 */
export async function updateStartingPosition(
  projectPath: string,
  mapId: number,
  x: number,
  y: number
): Promise<void> {
  const system = await loadSystem(projectPath);
  system.start_map_id = mapId;
  system.start_x = x;
  system.start_y = y;
  await saveSystem(projectPath, system);
}
