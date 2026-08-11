import type { PlainTable } from './rxdata.js';

/**
 * Plain-JSON representations of RPG Maker XP (RGSS1) data classes.
 * Every object carries a `_class` discriminator matching its Ruby class.
 * Field names mirror the Ruby instance variables without the leading `@`.
 */

export interface AudioFile {
  _class: 'RPG::AudioFile';
  name: string;
  volume: number;
  pitch: number;
}

export interface Actor {
  _class: 'RPG::Actor';
  id: number;
  name: string;
  class_id: number;
  initial_level: number;
  final_level: number;
  exp_basis: number;
  exp_inflation: number;
  character_name: string;
  character_hue: number;
  battler_name: string;
  battler_hue: number;
  /** Table[6, 100]: rows 0..5 = MaxHP, MaxSP, STR, DEX, AGI, INT per level */
  parameters: PlainTable;
  weapon_id: number;
  armor1_id: number;
  armor2_id: number;
  armor3_id: number;
  armor4_id: number;
  weapon_fix: boolean;
  armor1_fix: boolean;
  armor2_fix: boolean;
  armor3_fix: boolean;
  armor4_fix: boolean;
}

export interface Skill {
  _class: 'RPG::Skill';
  id: number;
  name: string;
  icon_name: string;
  description: string;
  /** 0=none, 1=one enemy, 2=all enemies, 3=one ally, 4=all allies, 5=one ally (HP 0), 6=all allies (HP 0), 7=user */
  scope: number;
  /** 0=always, 1=only battle, 2=only menu, 3=never */
  occasion: number;
  animation1_id: number;
  animation2_id: number;
  menu_se: AudioFile;
  common_event_id: number;
  sp_cost: number;
  /** Positive = damage, negative = healing */
  power: number;
  atk_f: number;
  eva_f: number;
  str_f: number;
  dex_f: number;
  agi_f: number;
  int_f: number;
  hit: number;
  pdef_f: number;
  mdef_f: number;
  variance: number;
  element_set: number[];
  plus_state_set: number[];
  minus_state_set: number[];
}

export interface Item {
  _class: 'RPG::Item';
  id: number;
  name: string;
  icon_name: string;
  description: string;
  scope: number;
  occasion: number;
  animation1_id: number;
  animation2_id: number;
  menu_se: AudioFile;
  common_event_id: number;
  price: number;
  consumable: boolean;
  parameter_type: number;
  parameter_points: number;
  recover_hp_rate: number;
  recover_hp: number;
  recover_sp_rate: number;
  recover_sp: number;
  hit: number;
  pdef_f: number;
  mdef_f: number;
  variance: number;
  element_set: number[];
  plus_state_set: number[];
  minus_state_set: number[];
}

export interface Weapon {
  _class: 'RPG::Weapon';
  id: number;
  name: string;
  icon_name: string;
  description: string;
  animation1_id: number;
  animation2_id: number;
  price: number;
  atk: number;
  pdef: number;
  mdef: number;
  str_plus: number;
  dex_plus: number;
  agi_plus: number;
  int_plus: number;
  element_set: number[];
  plus_state_set: number[];
  minus_state_set: number[];
}

export interface Armor {
  _class: 'RPG::Armor';
  id: number;
  name: string;
  icon_name: string;
  description: string;
  /** 0=shield, 1=helmet, 2=body armor, 3=accessory */
  kind: number;
  auto_state_id: number;
  price: number;
  pdef: number;
  mdef: number;
  eva: number;
  str_plus: number;
  dex_plus: number;
  agi_plus: number;
  int_plus: number;
  guard_element_set: number[];
  guard_state_set: number[];
}

export interface EventCommand {
  _class: 'RPG::EventCommand';
  code: number;
  indent: number;
  parameters: any[];
}

export interface MoveCommand {
  _class: 'RPG::MoveCommand';
  code: number;
  parameters: any[];
}

export interface MoveRoute {
  _class: 'RPG::MoveRoute';
  repeat: boolean;
  skippable: boolean;
  list: MoveCommand[];
}

export interface EventPageCondition {
  _class: 'RPG::Event::Page::Condition';
  switch1_valid: boolean;
  switch2_valid: boolean;
  variable_valid: boolean;
  self_switch_valid: boolean;
  switch1_id: number;
  switch2_id: number;
  variable_id: number;
  variable_value: number;
  self_switch_ch: string;
}

export interface EventPageGraphic {
  _class: 'RPG::Event::Page::Graphic';
  tile_id: number;
  character_name: string;
  character_hue: number;
  direction: number;
  pattern: number;
  opacity: number;
  blend_type: number;
}

export interface EventPage {
  _class: 'RPG::Event::Page';
  condition: EventPageCondition;
  graphic: EventPageGraphic;
  move_type: number;
  move_speed: number;
  move_frequency: number;
  move_route: MoveRoute;
  walk_anime: boolean;
  step_anime: boolean;
  direction_fix: boolean;
  through: boolean;
  always_on_top: boolean;
  /** 0=action button, 1=player touch, 2=event touch, 3=autorun, 4=parallel */
  trigger: number;
  list: EventCommand[];
}

export interface MapEvent {
  _class: 'RPG::Event';
  id: number;
  name: string;
  x: number;
  y: number;
  pages: EventPage[];
}

export interface GameMap {
  _class: 'RPG::Map';
  tileset_id: number;
  width: number;
  height: number;
  autoplay_bgm: boolean;
  bgm: AudioFile;
  autoplay_bgs: boolean;
  bgs: AudioFile;
  encounter_list: number[];
  encounter_step: number;
  /** Table[width, height, 3] of tile IDs */
  data: PlainTable;
  /** Hash of event id -> event (numeric string keys) */
  events: Record<string, MapEvent>;
}

export interface MapInfo {
  _class: 'RPG::MapInfo';
  name: string;
  parent_id: number;
  order: number;
  expanded: boolean;
  scroll_x: number;
  scroll_y: number;
}

export interface SystemWords {
  _class: 'RPG::System::Words';
  [key: string]: any;
}

export interface SystemData {
  _class: 'RPG::System';
  magic_number: number;
  party_members: number[];
  elements: (string | null)[];
  switches: (string | null)[];
  variables: (string | null)[];
  windowskin_name: string;
  title_name: string;
  gameover_name: string;
  battle_transition: string;
  title_bgm: AudioFile;
  battle_bgm: AudioFile;
  battle_end_me: AudioFile;
  gameover_me: AudioFile;
  words: SystemWords;
  test_troop_id: number;
  start_map_id: number;
  start_x: number;
  start_y: number;
  battleback_name: string;
  battler_name: string;
  battler_hue: number;
  edit_map_id: number;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Default constructors (match RMXP editor defaults)
// ---------------------------------------------------------------------------

export function makeAudioFile(name = '', volume = 100, pitch = 100): AudioFile {
  return { _class: 'RPG::AudioFile', name, volume, pitch };
}

export function makeEventCommand(code = 0, indent = 0, parameters: any[] = []): EventCommand {
  return { _class: 'RPG::EventCommand', code, indent, parameters };
}

export function makeMoveRoute(): MoveRoute {
  return {
    _class: 'RPG::MoveRoute',
    repeat: true,
    skippable: false,
    list: [{ _class: 'RPG::MoveCommand', code: 0, parameters: [] }],
  };
}

/** A zero-filled Table of the given dimensions (x-major). */
export function makeTable(xsize: number, ysize: number, zsize: number): PlainTable {
  const dim = zsize > 1 ? 3 : ysize > 1 ? 2 : 1;
  return { _class: 'Table', dim, xsize, ysize, zsize, data: new Array(xsize * ysize * zsize).fill(0) };
}

/** A blank RPG::Map matching the RMXP editor's `Map.new(width, height)`. */
export function makeMap(width: number, height: number, tilesetId = 1): GameMap {
  return {
    _class: 'RPG::Map',
    tileset_id: tilesetId,
    width,
    height,
    autoplay_bgm: false,
    bgm: makeAudioFile(),
    autoplay_bgs: false,
    bgs: makeAudioFile('', 80),
    encounter_list: [],
    encounter_step: 30,
    data: makeTable(width, height, 3),
    events: {},
  };
}

/** A RPG::MapInfo with editor defaults (scroll centred on a 640x480 screen). */
export function makeMapInfo(name: string, parentId = 0, order = 1): MapInfo {
  return {
    _class: 'RPG::MapInfo',
    name,
    parent_id: parentId,
    order,
    expanded: false,
    scroll_x: 320,
    scroll_y: 240,
  };
}

export function makeEventPage(): EventPage {
  return {
    _class: 'RPG::Event::Page',
    condition: {
      _class: 'RPG::Event::Page::Condition',
      switch1_valid: false,
      switch2_valid: false,
      variable_valid: false,
      self_switch_valid: false,
      switch1_id: 1,
      switch2_id: 1,
      variable_id: 1,
      variable_value: 0,
      self_switch_ch: 'A',
    },
    graphic: {
      _class: 'RPG::Event::Page::Graphic',
      tile_id: 0,
      character_name: '',
      character_hue: 0,
      direction: 2,
      pattern: 0,
      opacity: 255,
      blend_type: 0,
    },
    move_type: 0,
    move_speed: 3,
    move_frequency: 3,
    move_route: makeMoveRoute(),
    walk_anime: true,
    step_anime: false,
    direction_fix: false,
    through: false,
    always_on_top: false,
    trigger: 0,
    list: [makeEventCommand()],
  };
}
