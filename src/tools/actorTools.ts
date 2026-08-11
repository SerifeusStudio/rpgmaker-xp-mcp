import { readRxdataFile, writeRxdataFile, getDataPath } from '../utils/fileHandler.js';
import { Actor } from '../utils/types.js';
import type { PlainTable } from '../utils/rxdata.js';

const ACTORS_FILE = 'Actors.rxdata';

async function loadActors(projectPath: string): Promise<(Actor | null)[]> {
  return readRxdataFile<(Actor | null)[]>(getDataPath(projectPath, ACTORS_FILE));
}

async function saveActors(projectPath: string, actors: (Actor | null)[]): Promise<void> {
  await writeRxdataFile(getDataPath(projectPath, ACTORS_FILE), actors);
}

/** Strip the bulky parameters table for list/search output */
function summarize(actor: Actor): any {
  const { parameters, ...rest } = actor;
  return rest;
}

/**
 * Get all actors (parameters table omitted for brevity)
 */
export async function getActors(projectPath: string): Promise<any[]> {
  const actors = await loadActors(projectPath);
  return actors.filter((a): a is Actor => a !== null).map(summarize);
}

/**
 * Get a specific actor by ID, including its full parameters table
 */
export async function getActor(projectPath: string, actorId: number): Promise<Actor> {
  const actors = await loadActors(projectPath);
  const actor = actors[actorId];
  if (!actor) {
    throw new Error(`Actor with ID ${actorId} not found`);
  }
  return actor;
}

/**
 * Update an actor's properties
 */
export async function updateActor(
  projectPath: string,
  actorId: number,
  updates: Partial<Actor>
): Promise<Actor> {
  const actors = await loadActors(projectPath);
  const actor = actors[actorId];
  if (!actor) {
    throw new Error(`Actor with ID ${actorId} not found`);
  }
  const { _class, id, ...safeUpdates } = updates as any;
  Object.assign(actor, safeUpdates);
  await saveActors(projectPath, actors);
  return actor;
}

/**
 * Build a 6x100 parameters table with the official RPG::Actor default
 * growth curves (from the RGSS reference): MaxHP/MaxSP = 500 + level*50,
 * STR/DEX/AGI/INT = 50 + level*5.
 * Table is x-major: index = param + level * 6.
 * Params 0..5 = MaxHP, MaxSP, STR, DEX, AGI, INT.
 */
function makeParametersTable(): PlainTable {
  const xsize = 6;
  const ysize = 100;
  const data = new Array(xsize * ysize).fill(0);
  for (let level = 1; level < ysize; level++) {
    data[0 + level * xsize] = 500 + level * 50;
    data[1 + level * xsize] = 500 + level * 50;
    for (let p = 2; p < xsize; p++) {
      data[p + level * xsize] = 50 + level * 5;
    }
  }
  return { _class: 'Table', dim: 2, xsize, ysize, zsize: 1, data };
}

/**
 * Create a new actor with RMXP defaults
 */
export async function createActor(projectPath: string, params: any): Promise<Actor> {
  const actors = await loadActors(projectPath);
  const newId = actors.length;

  const actor: Actor = {
    _class: 'RPG::Actor',
    id: newId,
    name: params.name,
    class_id: params.class_id ?? 1,
    initial_level: params.initial_level ?? 1,
    final_level: params.final_level ?? 99,
    exp_basis: params.exp_basis ?? 30,
    exp_inflation: params.exp_inflation ?? 30,
    character_name: params.character_name ?? '',
    character_hue: params.character_hue ?? 0,
    battler_name: params.battler_name ?? '',
    battler_hue: params.battler_hue ?? 0,
    parameters: params.parameters ?? makeParametersTable(),
    weapon_id: params.weapon_id ?? 0,
    armor1_id: params.armor1_id ?? 0,
    armor2_id: params.armor2_id ?? 0,
    armor3_id: params.armor3_id ?? 0,
    armor4_id: params.armor4_id ?? 0,
    weapon_fix: params.weapon_fix ?? false,
    armor1_fix: params.armor1_fix ?? false,
    armor2_fix: params.armor2_fix ?? false,
    armor3_fix: params.armor3_fix ?? false,
    armor4_fix: params.armor4_fix ?? false,
  };

  actors.push(actor);
  await saveActors(projectPath, actors);
  return actor;
}

/**
 * Search actors by name
 */
export async function searchActors(projectPath: string, searchTerm: string): Promise<any[]> {
  const actors = await loadActors(projectPath);
  const term = searchTerm.toLowerCase();
  return actors
    .filter((a): a is Actor => a !== null && a.name.toLowerCase().includes(term))
    .map(summarize);
}
