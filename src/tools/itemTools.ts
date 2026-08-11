import { readRxdataFile, writeRxdataFile, getDataPath } from '../utils/fileHandler.js';
import { Item, Weapon, Armor, Skill } from '../utils/types.js';

async function loadList<T>(projectPath: string, fileName: string): Promise<(T | null)[]> {
  return readRxdataFile<(T | null)[]>(getDataPath(projectPath, fileName));
}

function compact<T>(list: (T | null)[]): T[] {
  return list.filter((x): x is T => x !== null);
}

/**
 * Get all items from the project
 */
export async function getItems(projectPath: string): Promise<Item[]> {
  return compact(await loadList<Item>(projectPath, 'Items.rxdata'));
}

/**
 * Get all weapons from the project
 */
export async function getWeapons(projectPath: string): Promise<Weapon[]> {
  return compact(await loadList<Weapon>(projectPath, 'Weapons.rxdata'));
}

/**
 * Get all armors from the project
 */
export async function getArmors(projectPath: string): Promise<Armor[]> {
  return compact(await loadList<Armor>(projectPath, 'Armors.rxdata'));
}

/**
 * Get all skills from the project
 */
export async function getSkills(projectPath: string): Promise<Skill[]> {
  return compact(await loadList<Skill>(projectPath, 'Skills.rxdata'));
}

/**
 * Update an item's properties
 */
export async function updateItem(
  projectPath: string,
  itemId: number,
  updates: Partial<Item>
): Promise<Item> {
  const filePath = getDataPath(projectPath, 'Items.rxdata');
  const items = await readRxdataFile<(Item | null)[]>(filePath);
  const item = items[itemId];
  if (!item) {
    throw new Error(`Item with ID ${itemId} not found`);
  }
  const { _class, id, ...safeUpdates } = updates as any;
  Object.assign(item, safeUpdates);
  await writeRxdataFile(filePath, items);
  return item;
}

/**
 * Search items, weapons and armors by name or description
 */
export async function searchItems(projectPath: string, searchTerm: string): Promise<any[]> {
  const term = searchTerm.toLowerCase();
  const matches = (entry: { name: string; description: string }) =>
    entry.name.toLowerCase().includes(term) || entry.description.toLowerCase().includes(term);

  const [items, weapons, armors] = await Promise.all([
    getItems(projectPath),
    getWeapons(projectPath),
    getArmors(projectPath),
  ]);

  return [
    ...items.filter(matches).map(e => ({ type: 'item', ...e })),
    ...weapons.filter(matches).map(e => ({ type: 'weapon', ...e })),
    ...armors.filter(matches).map(e => ({ type: 'armor', ...e })),
  ];
}

/**
 * Create a new weapon. Appends to Weapons.rxdata at the next id (array index =
 * id, slot 0 = nil). Fields default to the RMXP editor's `RPG::Weapon.new`.
 */
export async function createWeapon(
  projectPath: string,
  params: Partial<Weapon> & { name: string }
): Promise<Weapon> {
  const filePath = getDataPath(projectPath, 'Weapons.rxdata');
  const list = await loadList<Weapon>(projectPath, 'Weapons.rxdata');
  const id = list.length;
  const defaults: Weapon = {
    _class: 'RPG::Weapon', id,
    name: params.name, icon_name: '', description: '',
    animation1_id: 0, animation2_id: 0, price: 0,
    atk: 0, pdef: 0, mdef: 0,
    str_plus: 0, dex_plus: 0, agi_plus: 0, int_plus: 0,
    element_set: [], plus_state_set: [], minus_state_set: [],
  };
  const weapon: Weapon = { ...defaults, ...params, id, _class: 'RPG::Weapon' };
  list[id] = weapon;
  await writeRxdataFile(filePath, list);
  return weapon;
}

/**
 * Create a new armor. `kind`: 0=shield, 1=helmet, 2=body, 3=accessory. Fields
 * default to the RMXP editor's `RPG::Armor.new`.
 */
export async function createArmor(
  projectPath: string,
  params: Partial<Armor> & { name: string }
): Promise<Armor> {
  const filePath = getDataPath(projectPath, 'Armors.rxdata');
  const list = await loadList<Armor>(projectPath, 'Armors.rxdata');
  const id = list.length;
  const defaults: Armor = {
    _class: 'RPG::Armor', id,
    name: params.name, icon_name: '', description: '',
    kind: 0, auto_state_id: 0, price: 0,
    pdef: 0, mdef: 0, eva: 0,
    str_plus: 0, dex_plus: 0, agi_plus: 0, int_plus: 0,
    guard_element_set: [], guard_state_set: [],
  };
  const armor: Armor = { ...defaults, ...params, id, _class: 'RPG::Armor' };
  list[id] = armor;
  await writeRxdataFile(filePath, list);
  return armor;
}
