import { readRxdataFile, writeRxdataFile, getDataPath } from '../utils/fileHandler.js';
import { Skill, makeAudioFile } from '../utils/types.js';

const SKILLS_FILE = 'Skills.rxdata';

async function loadSkills(projectPath: string): Promise<(Skill | null)[]> {
  return readRxdataFile<(Skill | null)[]>(getDataPath(projectPath, SKILLS_FILE));
}

async function saveSkills(projectPath: string, skills: (Skill | null)[]): Promise<void> {
  await writeRxdataFile(getDataPath(projectPath, SKILLS_FILE), skills);
}

/**
 * Get a specific skill by ID
 */
export async function getSkill(projectPath: string, skillId: number): Promise<Skill> {
  const skills = await loadSkills(projectPath);
  const skill = skills[skillId];
  if (!skill) {
    throw new Error(`Skill with ID ${skillId} not found`);
  }
  return skill;
}

/**
 * Create a new skill with RMXP defaults; any RPG::Skill field can be
 * overridden via params.
 */
export async function createSkill(projectPath: string, params: any): Promise<Skill> {
  const skills = await loadSkills(projectPath);
  const newId = skills.length;

  const skill: Skill = {
    _class: 'RPG::Skill',
    id: newId,
    name: params.name,
    icon_name: params.icon_name ?? '',
    description: params.description ?? '',
    scope: params.scope ?? 1,
    occasion: params.occasion ?? 1,
    animation1_id: params.animation1_id ?? 0,
    animation2_id: params.animation2_id ?? 0,
    menu_se: params.menu_se ?? makeAudioFile('', 80, 100),
    common_event_id: params.common_event_id ?? 0,
    sp_cost: params.sp_cost ?? 0,
    power: params.power ?? 0,
    atk_f: params.atk_f ?? 0,
    eva_f: params.eva_f ?? 0,
    str_f: params.str_f ?? 0,
    dex_f: params.dex_f ?? 0,
    agi_f: params.agi_f ?? 0,
    int_f: params.int_f ?? 100,
    hit: params.hit ?? 100,
    pdef_f: params.pdef_f ?? 0,
    mdef_f: params.mdef_f ?? 100,
    variance: params.variance ?? 15,
    element_set: params.element_set ?? [],
    plus_state_set: params.plus_state_set ?? [],
    minus_state_set: params.minus_state_set ?? [],
  };

  skills.push(skill);
  await saveSkills(projectPath, skills);
  return skill;
}

/**
 * Create a damage-dealing skill (simplified).
 * XP has no damage formulas — damage comes from power plus stat
 * influence rates (atk_f for physical, int_f for magical).
 */
export async function createDamageSkill(
  projectPath: string,
  name: string,
  power: number,
  spCost: number,
  scope: number,
  elementId?: number,
  description?: string,
  physical?: boolean
): Promise<Skill> {
  return createSkill(projectPath, {
    name,
    power: Math.abs(power),
    sp_cost: spCost,
    scope,
    description,
    element_set: elementId ? [elementId] : [],
    // Physical skills scale with ATK/STR and are reduced by PDEF;
    // magical skills scale with INT and are reduced by MDEF.
    atk_f: physical ? 100 : 0,
    str_f: physical ? 100 : 0,
    int_f: physical ? 0 : 100,
    pdef_f: physical ? 100 : 0,
    mdef_f: physical ? 0 : 100,
  });
}

/**
 * Create a healing skill (simplified). In XP, healing is a negative power.
 * Stat profile follows the default-database healing skills (int_f 50,
 * variance 15, usable in battle and menu). Actual amount healed is
 * |power| * (20 + INT * int_f / 100) / 20, +/- variance.
 */
export async function createHealingSkill(
  projectPath: string,
  name: string,
  power: number,
  spCost: number,
  scope: number,
  description?: string
): Promise<Skill> {
  return createSkill(projectPath, {
    name,
    power: -Math.abs(power),
    sp_cost: spCost,
    scope,
    occasion: 0, // usable in battle and menu
    description,
    int_f: 50,
    hit: 100,
  });
}

/**
 * Create a state-inflicting skill (poison, sleep, etc.)
 */
export async function createStateSkill(
  projectPath: string,
  name: string,
  stateId: number,
  hit: number,
  spCost: number,
  scope: number,
  description?: string
): Promise<Skill> {
  return createSkill(projectPath, {
    name,
    power: 0,
    sp_cost: spCost,
    scope,
    description,
    hit,
    plus_state_set: [stateId],
    int_f: 0,
    mdef_f: 100,
  });
}

/**
 * Update a skill's properties
 */
export async function updateSkill(
  projectPath: string,
  skillId: number,
  updates: Partial<Skill>
): Promise<Skill> {
  const skills = await loadSkills(projectPath);
  const skill = skills[skillId];
  if (!skill) {
    throw new Error(`Skill with ID ${skillId} not found`);
  }
  const { _class, id, ...safeUpdates } = updates as any;
  Object.assign(skill, safeUpdates);
  await saveSkills(projectPath, skills);
  return skill;
}

/**
 * Search skills by name or description
 */
export async function searchSkills(projectPath: string, searchTerm: string): Promise<Skill[]> {
  const skills = await loadSkills(projectPath);
  const term = searchTerm.toLowerCase();
  return skills.filter(
    (s): s is Skill =>
      s !== null &&
      (s.name.toLowerCase().includes(term) || s.description.toLowerCase().includes(term))
  );
}
