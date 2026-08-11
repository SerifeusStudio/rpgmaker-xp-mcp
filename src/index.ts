#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SERVER_INSTRUCTIONS, listResources, readResource } from './resources.js';

import { validateProjectPath } from './utils/fileHandler.js';
import * as actorTools from './tools/actorTools.js';
import * as itemTools from './tools/itemTools.js';
import * as mapTools from './tools/mapTools.js';
import * as systemTools from './tools/systemTools.js';
import * as skillTools from './tools/skillTools.js';
import * as scriptTools from './tools/scriptTools.js';
import * as databaseTools from './tools/databaseTools.js';
import * as renderTools from './tools/renderTools.js';
import * as tilesetCatalogTools from './tools/tilesetCatalogTools.js';
import * as assetTools from './tools/assetTools.js';
import * as importVerifyTools from './tools/importVerifyTools.js';
import * as guideTools from './tools/guideTools.js';

/**
 * RPG Maker XP MCP Server
 *
 * A Model Context Protocol server for RPG Maker XP integration.
 * Reads and writes the project's Ruby Marshal .rxdata files directly,
 * providing tools for managing game data, maps, events, and system settings.
 */

// Global project path - should be set via environment variable
const PROJECT_PATH = process.env.RPGMAKER_PROJECT_PATH || '';

class RPGMakerXPServer {
  private server: Server;
  private projectPath: string;

  constructor() {
    this.server = new Server(
      {
        name: 'rpgmaker-xp-server',
        version: '1.1.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
        // Surfaced to every client on connect (governance + map-design rules),
        // so any assistant using this server gets the conventions, not just
        // ones that can read the repo docs.
        instructions: SERVER_INSTRUCTIONS,
      }
    );

    this.projectPath = PROJECT_PATH;
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getToolDefinitions(),
      };
    });

    // Expose the docs as readable resources (map-design, authoring, wisdom)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return { resources: listResources() };
    });
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await readResource(request.params.uri);
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!this.projectPath) {
          throw new Error('RPGMAKER_PROJECT_PATH environment variable not set');
        }

        const isValid = await validateProjectPath(this.projectPath);
        if (!isValid) {
          throw new Error(
            'Invalid RPG Maker XP project path (expected a folder containing Data/System.rxdata)'
          );
        }

        return await this.handleToolCall(request.params.name, request.params.arguments || {});
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private getToolDefinitions(): Tool[] {
    return [
      // Actor Tools
      {
        name: 'get_actors',
        description: 'Get all actors from the RPG Maker XP project (parameter tables omitted)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_actor',
        description: 'Get a specific actor by ID, including its 6x100 parameters table (MaxHP, MaxSP, STR, DEX, AGI, INT per level)',
        inputSchema: {
          type: 'object',
          properties: {
            actorId: {
              type: 'number',
              description: 'The ID of the actor to retrieve',
            },
          },
          required: ['actorId'],
        },
      },
      {
        name: 'update_actor',
        description: 'Update an actor\'s properties (XP fields: name, class_id, initial_level, final_level, exp_basis, exp_inflation, character_name, character_hue, battler_name, battler_hue, weapon_id, armor1_id..armor4_id, weapon_fix, armor1_fix..armor4_fix, parameters)',
        inputSchema: {
          type: 'object',
          properties: {
            actorId: {
              type: 'number',
              description: 'The ID of the actor to update',
            },
            updates: {
              type: 'object',
              description: 'Object containing properties to update',
            },
          },
          required: ['actorId', 'updates'],
        },
      },
      {
        name: 'create_actor',
        description: 'Create a new actor with RMXP defaults (linear stat growth curves unless a parameters Table is provided)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            class_id: { type: 'number' },
            initial_level: { type: 'number' },
            final_level: { type: 'number' },
            exp_basis: { type: 'number', description: 'EXP curve basis (valid range 10-50, default 30)' },
            exp_inflation: { type: 'number', description: 'EXP curve inflation (valid range 10-50, default 30)' },
            character_name: { type: 'string', description: 'Character graphic filename (Graphics/Characters)' },
            character_hue: { type: 'number' },
            battler_name: { type: 'string', description: 'Battler graphic filename (Graphics/Battlers)' },
            battler_hue: { type: 'number' },
            weapon_id: { type: 'number' },
            armor1_id: { type: 'number', description: 'Shield ID' },
            armor2_id: { type: 'number', description: 'Helmet ID' },
            armor3_id: { type: 'number', description: 'Body armor ID' },
            armor4_id: { type: 'number', description: 'Accessory ID' },
          },
          required: ['name'],
        },
      },
      {
        name: 'search_actors',
        description: 'Search actors by name',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: {
              type: 'string',
              description: 'The search term to find actors',
            },
          },
          required: ['searchTerm'],
        },
      },

      // Item Tools
      {
        name: 'get_items',
        description: 'Get all items from the project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_weapons',
        description: 'Get all weapons from the project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_armors',
        description: 'Get all armors from the project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_skills',
        description: 'Get all skills from the project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_skill',
        description: 'Get a specific skill by ID',
        inputSchema: {
          type: 'object',
          properties: {
            skillId: { type: 'number', description: 'The ID of the skill to retrieve' },
          },
          required: ['skillId'],
        },
      },
      {
        name: 'create_skill',
        description: 'Create a new skill with full control over RPG::Skill fields. XP has no damage formulas: damage = power scaled by stat influence rates (atk_f/str_f for physical, int_f for magical). Negative power heals.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name' },
            description: { type: 'string', description: 'Skill description' },
            icon_name: { type: 'string', description: 'Icon filename (Graphics/Icons)' },
            sp_cost: { type: 'number', description: 'SP cost' },
            scope: { type: 'number', description: 'Target scope (0=none, 1=one enemy, 2=all enemies, 3=one ally, 4=all allies, 5=one ally HP 0, 6=all allies HP 0, 7=user)' },
            occasion: { type: 'number', description: '0=always, 1=only battle, 2=only menu, 3=never' },
            power: { type: 'number', description: 'Base power (positive=damage, negative=healing)' },
            atk_f: { type: 'number', description: 'ATK influence rate 0-200 (physical)' },
            str_f: { type: 'number', description: 'STR influence rate 0-100' },
            int_f: { type: 'number', description: 'INT influence rate 0-100 (magical)' },
            dex_f: { type: 'number', description: 'DEX influence rate 0-100' },
            agi_f: { type: 'number', description: 'AGI influence rate 0-100' },
            eva_f: { type: 'number', description: 'Evasion influence rate 0-100' },
            hit: { type: 'number', description: 'Hit rate percentage (0-100)' },
            pdef_f: { type: 'number', description: 'Target PDEF influence rate 0-100' },
            mdef_f: { type: 'number', description: 'Target MDEF influence rate 0-100' },
            variance: { type: 'number', description: 'Damage variance percentage' },
            element_set: { type: 'array', description: 'Element IDs (see System elements list)' },
            plus_state_set: { type: 'array', description: 'State IDs to add (see States)' },
            minus_state_set: { type: 'array', description: 'State IDs to remove' },
            animation1_id: { type: 'number', description: 'User animation ID' },
            animation2_id: { type: 'number', description: 'Target animation ID' },
            common_event_id: { type: 'number', description: 'Common event to call' },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_damage_skill',
        description: 'Create a damage-dealing skill (simplified). Set physical=true for ATK/PDEF based damage, otherwise INT/MDEF based (magic). Engine formula: damage = (power + ATK*atk_f/100 - PDEF*pdef_f/200 - MDEF*mdef_f/200) * (20 + STR*str_f/100 + DEX*dex_f/100 + AGI*agi_f/100 + INT*int_f/100) / 20. Reference: default-DB Fire is power 140, sp 75.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name' },
            power: { type: 'number', description: 'Base damage power' },
            spCost: { type: 'number', description: 'SP cost' },
            scope: { type: 'number', description: 'Target scope (1=one enemy, 2=all enemies)' },
            elementId: { type: 'number', description: 'Element ID from the System elements list (0=none)' },
            description: { type: 'string', description: 'Skill description' },
            physical: { type: 'boolean', description: 'true=physical (ATK/PDEF), false=magical (INT/MDEF, default)' },
          },
          required: ['name', 'power', 'spCost', 'scope'],
        },
      },
      {
        name: 'create_healing_skill',
        description: 'Create a healing skill (simplified). In XP healing is negative power. Amount healed = power * (20 + INT*int_f/100) / 20 with int_f=50 (default-DB convention), so it scales with the caster\'s INT. Reference: default-DB Heal is power 150, sp 80.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name' },
            power: { type: 'number', description: 'Base heal power (positive number; actual healing scales up with caster INT)' },
            spCost: { type: 'number', description: 'SP cost' },
            scope: { type: 'number', description: 'Target scope (3=one ally, 4=all allies, 7=user)' },
            description: { type: 'string', description: 'Skill description' },
          },
          required: ['name', 'power', 'spCost', 'scope'],
        },
      },
      {
        name: 'create_state_skill',
        description: 'Create a state-inflicting skill (poison, sleep, etc.). State IDs come from States.rxdata (XP defaults: 3=poison, 5=blind, 6=silence, 7=confuse, 8=sleep, 9=paralyze).',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill name' },
            stateId: { type: 'number', description: 'State ID to inflict' },
            hit: { type: 'number', description: 'Hit/success rate percentage (0-100)' },
            spCost: { type: 'number', description: 'SP cost' },
            scope: { type: 'number', description: 'Target scope (1=one enemy, 2=all enemies)' },
            description: { type: 'string', description: 'Skill description' },
          },
          required: ['name', 'stateId', 'hit', 'spCost', 'scope'],
        },
      },
      {
        name: 'update_skill',
        description: 'Update a skill\'s properties',
        inputSchema: {
          type: 'object',
          properties: {
            skillId: { type: 'number', description: 'The skill ID to update' },
            updates: { type: 'object', description: 'Properties to update' },
          },
          required: ['skillId', 'updates'],
        },
      },
      {
        name: 'search_skills',
        description: 'Search skills by name or description',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: { type: 'string', description: 'Search term' },
          },
          required: ['searchTerm'],
        },
      },
      {
        name: 'update_item',
        description: 'Update an item\'s properties (XP fields: name, icon_name, description, scope, occasion, price, consumable, recover_hp, recover_sp, parameter_type, parameter_points, element_set, plus_state_set, minus_state_set, ...)',
        inputSchema: {
          type: 'object',
          properties: {
            itemId: { type: 'number' },
            updates: { type: 'object' },
          },
          required: ['itemId', 'updates'],
        },
      },
      {
        name: 'search_items',
        description: 'Search items, weapons and armors by name or description',
        inputSchema: {
          type: 'object',
          properties: {
            searchTerm: { type: 'string' },
          },
          required: ['searchTerm'],
        },
      },
      {
        name: 'create_weapon',
        description: 'Create a new weapon (appended to Weapons.rxdata). Defaults match the RMXP editor; override any field. Equippable in the weapon slot.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            icon_name: { type: 'string', description: 'Icon filename (Graphics/Icons)' },
            price: { type: 'number' },
            atk: { type: 'number', description: 'Attack power' },
            pdef: { type: 'number' }, mdef: { type: 'number' },
            str_plus: { type: 'number' }, dex_plus: { type: 'number' }, agi_plus: { type: 'number' }, int_plus: { type: 'number' },
            animation1_id: { type: 'number' }, animation2_id: { type: 'number' },
            element_set: { type: 'array', items: { type: 'number' }, description: 'Element ids this weapon carries' },
            plus_state_set: { type: 'array', items: { type: 'number' } },
            minus_state_set: { type: 'array', items: { type: 'number' } },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_armor',
        description: 'Create a new armor (appended to Armors.rxdata). kind: 0=shield, 1=helmet, 2=body, 3=accessory. Defaults match the RMXP editor; override any field.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            icon_name: { type: 'string', description: 'Icon filename (Graphics/Icons)' },
            kind: { type: 'number', description: '0=shield, 1=helmet, 2=body, 3=accessory' },
            price: { type: 'number' },
            pdef: { type: 'number' }, mdef: { type: 'number' }, eva: { type: 'number' },
            str_plus: { type: 'number' }, dex_plus: { type: 'number' }, agi_plus: { type: 'number' }, int_plus: { type: 'number' },
            auto_state_id: { type: 'number' },
            guard_element_set: { type: 'array', items: { type: 'number' } },
            guard_state_set: { type: 'array', items: { type: 'number' } },
          },
          required: ['name'],
        },
      },

      // Map Tools
      {
        name: 'get_map',
        description: 'Get map data by ID (Data/MapXXX.rxdata). Tile data is summarized unless includeTiles is true.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: {
              type: 'number',
              description: 'The ID of the map to retrieve',
            },
            includeTiles: {
              type: 'boolean',
              description: 'Include the full tile data Table (large!)',
            },
          },
          required: ['mapId'],
        },
      },
      {
        name: 'get_map_infos',
        description: 'Get information about all maps (names, parent, order)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_map_events',
        description: 'Get all events from a specific map',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
          },
          required: ['mapId'],
        },
      },
      {
        name: 'get_map_event',
        description: 'Get a specific event from a map',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            eventId: { type: 'number' },
          },
          required: ['mapId', 'eventId'],
        },
      },
      {
        name: 'update_map_event',
        description: 'Update a map event\'s properties (name, x, y, pages)',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            eventId: { type: 'number' },
            updates: { type: 'object' },
          },
          required: ['mapId', 'eventId', 'updates'],
        },
      },
      {
        name: 'create_map_event',
        description: 'Create a new event on a map. If pages are omitted, a default empty page is created.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            name: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            pages: { type: 'array', description: 'Optional RPG::Event::Page objects' },
          },
          required: ['mapId', 'name', 'x', 'y'],
        },
      },
      {
        name: 'search_map_events',
        description: 'Search events on a map by name',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            searchTerm: { type: 'string' },
          },
          required: ['mapId', 'searchTerm'],
        },
      },
      {
        name: 'add_event_command',
        description: 'Add a single command to an event page (for Show Text prefer add_show_text). Common XP codes: 101=Show Text first line (401=continuation lines), 102=Show Choices [[texts...],cancelType] (each 402 branch repeats its choice text and must stay in sync), 111=Conditional Branch, 121=Control Switches, 122=Control Variables, 123=Control Self Switch [ch,0=on/1=off], 125=Change Gold, 126=Change Items, 201=Transfer Player, 209=Set Move Route (509=continuation), 223=Change Screen Color Tone, 355=Script. indent must increase by 1 inside branch blocks; the trailing code-0 terminator is preserved automatically.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            eventId: { type: 'number' },
            pageIndex: { type: 'number' },
            command: {
              type: 'object',
              properties: {
                code: { type: 'number' },
                indent: { type: 'number' },
                parameters: { type: 'array' },
              },
              required: ['code'],
            },
            position: { type: 'number', description: 'Insert position in the command list (default: end)' },
          },
          required: ['mapId', 'eventId', 'pageIndex', 'command'],
        },
      },

      {
        name: 'add_show_text',
        description: 'Add a Show Text message to an event page. Handles XP\'s 101/401 structure automatically: first line of each box is code 101, continuation lines are 401, and text longer than 4 lines is split into multiple message boxes. Use \\n for line breaks.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            eventId: { type: 'number' },
            pageIndex: { type: 'number' },
            text: { type: 'string', description: 'Message text; newlines split lines (4 per box)' },
            position: { type: 'number', description: 'Insert position in the command list (default: end)' },
          },
          required: ['mapId', 'eventId', 'pageIndex', 'text'],
        },
      },

      // Map Connectivity (transfer graph) — FR-2
      {
        name: 'create_transfer_event',
        description: 'Wire two maps together: create a Transfer Player (command 201) event at (x,y) on a map that warps the player to (targetX,targetY) on targetMapId. trigger 0 = action button (a door — give it a graphic); trigger 1 = player touch (an edge teleport — leave it invisible). Validates both endpoints exist and are in-bounds before writing. Use validate_connectivity afterwards to check the whole world graph.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number', description: 'Map the event is placed on' },
            x: { type: 'number', description: 'Event x (tile) on this map' },
            y: { type: 'number', description: 'Event y (tile) on this map' },
            targetMapId: { type: 'number', description: 'Destination map id' },
            targetX: { type: 'number', description: 'Destination x (tile)' },
            targetY: { type: 'number', description: 'Destination y (tile)' },
            name: { type: 'string', description: 'Event name (default transfer_to_<targetMapId>)' },
            direction: { type: 'number', description: 'Facing after transfer: 0 retain, 2 down, 4 left, 6 right, 8 up (default 0)' },
            fade: { type: 'boolean', description: 'Fade through black during transfer (default true)' },
            trigger: { type: 'number', description: '0 action button (door), 1 player touch (edge teleport, default), 2 event touch' },
            graphic: {
              type: 'object',
              description: 'Optional event appearance (for a visible door). Omit for an invisible touch teleport.',
              properties: {
                tileId: { type: 'number', description: 'Tile id graphic (>=384)' },
                characterName: { type: 'string', description: 'Character spritesheet (Graphics/Characters)' },
                characterHue: { type: 'number' },
                direction: { type: 'number', description: 'Sprite facing 2/4/6/8' },
                pattern: { type: 'number', description: 'Sprite frame 0..3' },
              },
            },
          },
          required: ['mapId', 'x', 'y', 'targetMapId', 'targetX', 'targetY'],
        },
      },
      {
        name: 'validate_connectivity',
        description: 'Build and validate the world transfer graph. Scans every map\'s events for Transfer Player (201) commands, checks each targets a real map at in-bounds coords, computes reachability from System.start_map_id, and flags orphan maps (no inbound transfer) and unreachable maps. Variable-designated transfers are reported as dynamic (runtime destination, unverifiable). Returns nodes, edges, errors, warnings, and a summary; set diagram=true for a Mermaid flowchart.',
        inputSchema: {
          type: 'object',
          properties: {
            diagram: { type: 'boolean', description: 'Also return a Mermaid flowchart of the world graph (default false)' },
          },
        },
      },

      // Map Authoring (tile painting)
      {
        name: 'get_map_design_guide',
        description: 'Return the level/map design guide (MAP-DESIGN.md): layer roles (z0 terrain / z1 ground clutter / z2 overhead), tile priority & passability, the multi-tile-object no-overlap rule, composition principles, and the authoring workflow. Load this before authoring or editing maps.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'create_map',
        description: 'Create a new map. SIZE IS THE FIRST DESIGN DECISION: a map is N screens of 20x15 tiles, so pass a `purpose` (interior/room/town/dungeon/overworld/region) to get a sensible default size, or set width/height explicitly. Returns the new map id and a size_advisory (screens, target focal-point count, scatter density, oversize warnings) plus the design guide. Writes the next-free MapXXX.rxdata (blank Table[w,h,3]) + MapInfos entry. Paint with apply_autotile / scatter_tiles / set_map_tiles, preview with render_map.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Display name in the map tree' },
            purpose: { type: 'string', enum: ['interior', 'room', 'town', 'dungeon', 'overworld', 'region'], description: 'What the map is for. Picks a default size if width/height are omitted, and tunes the size advisory. interior=20x15 one screen; town~40x35; dungeon~45x40; overworld~100x90 (segment).' },
            width: { type: 'number', description: 'Width in tiles. Omit to use the purpose default. Clamped to 20..500.' },
            height: { type: 'number', description: 'Height in tiles. Omit to use the purpose default. Clamped to 15..500.' },
            tilesetId: { type: 'number', description: 'Tileset id (default 1)' },
            parentId: { type: 'number', description: 'Parent map id in the tree (default 0 = root)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_map_size_advisory',
        description: 'Size advisory for an EXISTING map: screens (ceil(w/20)*ceil(h/15)), target focal-point and path-junction counts, recommended scatter density, approx clutter tile budget, and oversize/purpose-mismatch warnings. Use this first when editing a map so size and tile budget guide the design. Optionally pass a purpose to check the size against its sweet spot.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            purpose: { type: 'string', enum: ['interior', 'room', 'town', 'dungeon', 'overworld', 'region'], description: 'Optional: check the map size against this purpose\'s sweet spot.' },
          },
          required: ['mapId'],
        },
      },
      {
        name: 'get_map_tiles',
        description: 'Read a map\'s tile ids as a 2D grid (rows top-to-bottom). Returns one layer if `layer` is given, else all three. Tile id 0 = empty, 48..383 = autotiles, >=384 = regular tiles. Use `region` to crop and avoid large payloads.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            layer: { type: 'number', description: 'Layer 0=ground, 1=detail, 2=overhead (omit for all)' },
            region: {
              type: 'object',
              description: 'Crop in tiles (default whole map)',
              properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
            },
          },
          required: ['mapId'],
        },
      },
      {
        name: 'set_map_tiles',
        description: 'Stamp a 2D block of tile ids into a layer with its top-left at (x, y). `grid` is rows of ids (0 clears a cell). Cells outside the map are skipped. Preview with render_map.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            layer: { type: 'number', description: '0=ground, 1=detail, 2=overhead' },
            x: { type: 'number', description: 'Left tile of the block' },
            y: { type: 'number', description: 'Top tile of the block' },
            grid: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '2D array of tile ids (rows)' },
          },
          required: ['mapId', 'layer', 'x', 'y', 'grid'],
        },
      },
      {
        name: 'fill_region',
        description: 'Fill a rectangle of a layer with one tile id (or the whole layer if `rect` is omitted). Tile id 0 clears. For autotiles this places the base variant (P1) — smart edges come with apply_autotile.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            layer: { type: 'number', description: '0=ground, 1=detail, 2=overhead' },
            tileId: { type: 'number', description: 'Tile id to fill with (0 = clear)' },
            rect: {
              type: 'object',
              description: 'Rectangle in tiles (default whole layer)',
              properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
            },
          },
          required: ['mapId', 'layer', 'tileId'],
        },
      },
      {
        name: 'apply_autotile',
        description: 'Paint an autotile (slot 0..6 = tileset autotile_names index) and compute the correct edge variant per cell from 8-neighbour connectivity (seamless coastlines/paths/cliffs). Supply ONE of: `blob` (organic roundish shape — USE for ponds/lakes/forest patches); `path` (autotile-safe road/trail/river through waypoints, width >=2); `cells` (arbitrary [x,y] list); or `region` (rect — only for rectangular floors). All shapes are auto-sanitized to be autotile-safe (4-connected, no diagonal pinches or 1-cell holes) so they never render broken/pinched. The border ring of existing same-autotile cells is recomputed so it blends. Preview with render_map.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            layer: { type: 'number', description: '0=ground, 1=detail, 2=overhead' },
            autotileSlot: { type: 'number', description: 'Autotile slot 0..6 (index into the tileset autotile_names)' },
            blob: {
              type: 'object',
              description: 'Organic blob: ellipse (rx,ry) around (cx,cy) with wobbly edges. Best for ponds/lakes/forest patches.',
              properties: { cx: { type: 'number' }, cy: { type: 'number' }, rx: { type: 'number' }, ry: { type: 'number' }, irregularity: { type: 'number', description: '0..1 edge wobble (default 0.4)' }, seed: { type: 'number' } },
              required: ['cx', 'cy', 'rx', 'ry'],
            },
            path: {
              type: 'object',
              description: 'Autotile-safe road/trail/river through waypoints (orthogonal, never diagonal). width >= 2 recommended.',
              properties: { points: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Waypoints [[x,y],...]' }, width: { type: 'number', description: 'Path width in tiles (default 2)' } },
              required: ['points'],
            },
            cells: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Explicit [x,y] cells (custom shapes; auto-sanitized)' },
            region: {
              type: 'object', description: 'Rectangle (only for rectangular things; use blob/cells for nature)',
              properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
            },
            edgeMode: { type: 'string', enum: ['same', 'different'], description: 'Map-border connectivity (default same)' },
          },
          required: ['mapId', 'layer', 'autotileSlot'],
        },
      },
      {
        name: 'scatter_tiles',
        description: 'Scatter clutter tile ids over a region with natural random distribution at a target density (fraction of cells), skipping occupied cells. Optional focal point with falloff for a density gradient (denser near a landmark). Use for flowers/bushes/rocks/tall grass instead of hand-placing lone tiles — fixes sparse/corner-clustered decoration. Deterministic given seed.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            layer: { type: 'number', description: 'Usually 1 (ground clutter)' },
            tileIds: { type: 'array', items: { type: 'number' }, description: 'Tile ids to scatter (picked at random per cell)' },
            region: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] },
            density: { type: 'number', description: 'Fraction of cells to fill, 0..1 (default 0.12)' },
            seed: { type: 'number' },
            avoidOccupied: { type: 'boolean', description: 'Skip non-empty cells (default true)' },
            focal: { type: 'object', description: 'Density gradient toward a point', properties: { x: { type: 'number' }, y: { type: 'number' }, falloff: { type: 'number', description: '>0 denser near focal, <0 denser far' } } },
          },
          required: ['mapId', 'layer', 'tileIds', 'region'],
        },
      },

      // Database Tools (Classes, States, Enemies, Troops, CommonEvents, Tilesets, ...)
      {
        name: 'get_database',
        description: 'List all entries of a database file. Kinds: classes, states, enemies, troops, common_events, tilesets, animations (also actors/skills/items/weapons/armors). Tables and command lists are summarized; use get_database_entry for full data.',
        inputSchema: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states', 'animations', 'tilesets', 'common_events'],
            },
          },
          required: ['kind'],
        },
      },
      {
        name: 'get_database_entry',
        description: 'Get one full database entry by ID, including Tables (tileset passages/priorities/terrain_tags, enemy element_ranks, class element_ranks) and event command lists (common events, troop pages)',
        inputSchema: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states', 'animations', 'tilesets', 'common_events'],
            },
            id: { type: 'number' },
          },
          required: ['kind', 'id'],
        },
      },
      {
        name: 'update_database_entry',
        description: 'Update any database entry\'s properties (e.g. a class\'s weapon_set, a state\'s rates, an enemy\'s stats, tileset passability Tables). Tables must be written as { "_class": "Table", dim, xsize, ysize, zsize, data: [...] }. Tileset passages: value 0=passable, 1/2/4/8 = down/left/right/up blocked, 15=impassable, +64 bush, +128 counter.',
        inputSchema: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'troops', 'states', 'animations', 'tilesets', 'common_events'],
            },
            id: { type: 'number' },
            updates: { type: 'object' },
          },
          required: ['kind', 'id', 'updates'],
        },
      },

      // Script Tools (Scripts.rxdata)
      {
        name: 'get_scripts',
        description: 'List all RGSS scripts in Scripts.rxdata (index, name, source length)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_script',
        description: 'Get an RGSS script\'s Ruby source code by index',
        inputSchema: {
          type: 'object',
          properties: {
            index: { type: 'number', description: 'Script index from get_scripts' },
          },
          required: ['index'],
        },
      },
      {
        name: 'update_script',
        description: 'Replace an RGSS script\'s source code and/or name',
        inputSchema: {
          type: 'object',
          properties: {
            index: { type: 'number', description: 'Script index from get_scripts' },
            code: { type: 'string', description: 'New Ruby source code' },
            name: { type: 'string', description: 'New script name' },
          },
          required: ['index'],
        },
      },
      {
        name: 'create_script',
        description: 'Create a new RGSS script. By default it is inserted just above "Main" (the conventional slot for custom scripts).',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Script name' },
            code: { type: 'string', description: 'Ruby source code' },
            position: { type: 'number', description: 'Insert position (default: just above Main)' },
          },
          required: ['name', 'code'],
        },
      },
      {
        name: 'search_scripts',
        description: 'Search all RGSS script sources with a regex pattern; returns matching lines with script name and line number',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regular expression to search for' },
          },
          required: ['pattern'],
        },
      },

      // System Tools
      {
        name: 'get_system',
        description: 'Get system data (System.rxdata: party, elements, switches, variables, vocabulary, start position, audio settings)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_variables',
        description: 'Get all game variable names (index = variable ID)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'set_variable_name',
        description: 'Set a variable name',
        inputSchema: {
          type: 'object',
          properties: {
            variableId: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['variableId', 'name'],
        },
      },
      {
        name: 'get_switches',
        description: 'Get all game switch names (index = switch ID)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'set_switch_name',
        description: 'Set a switch name',
        inputSchema: {
          type: 'object',
          properties: {
            switchId: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['switchId', 'name'],
        },
      },
      {
        name: 'get_game_title',
        description: 'Get the game title (from Game.ini)',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'update_game_title',
        description: 'Update the game title (in Game.ini)',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
        },
      },
      {
        name: 'update_starting_position',
        description: 'Update the party starting position (map ID and coordinates in System.rxdata)',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['mapId', 'x', 'y'],
        },
      },
      {
        name: 'validate_assets',
        description: 'Scan all data files for referenced graphic/audio filenames (tilesets, autotiles, panoramas, fogs, battlebacks, character/battler/icon graphics, animations, windowskin/title/gameover/transition, BGM/BGS/ME, and map event sprites) and report any with no matching file on disk. Checks the project Graphics/ and Audio/ first, then the RTP (RPGMAKER_RTP_PATH). Catches broken references that are otherwise silent until runtime.',
        inputSchema: {
          type: 'object',
          properties: {
            includeMaps: { type: 'boolean', description: 'Also scan every map\'s BGM/BGS and event sprites (default true)' },
          },
        },
      },
      {
        name: 'classify_asset',
        description: 'Inspect a PNG before import and report whether it is a native RMXP asset. Goes beyond canvas dimensions: fingerprints the filename ($/! object sprites, MV/MZ A1-A5 autotile sheets, 48px-divisible MV dimensions) AND detects the true CONTENT tile size via edge-periodicity (16/24/32/48/64px). Catches assets that look fine by size but render 1.5x/2x too large in RMXP\'s 32px grid, and assets that are not tilesets at all. Returns tier, recommended conversion op, target category, and flags. No writes.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute path to the PNG to classify' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'verify_tileset',
        description: 'Render an asset with two overlaid grids — the RMXP 32px grid (red) and the detected content grid (cyan) — and write a preview PNG for multimodal review. If a tile motif fills a 2x2 block of red cells the art is 64px (too big); if red and cyan coincide it is native 32px. Returns the preview path, detected tile size, and an alignment verdict. Read the returned preview_png to confirm visually before registering.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute path to the tileset PNG' },
            scale: { type: 'number', description: 'Integer upscale for legibility (1-4; default 2 for <=256px wide)' },
            outDir: { type: 'string', description: 'Output directory for the preview PNG (default %TEMP%/rmxp-verify)' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'register_tileset',
        description: 'Create a Tilesets.rxdata entry for a graphic already in Graphics/Tilesets, sizing the passability/priority/terrain Tables to the image (384 + height/4). GUARDED: refuses object sprites, MV A-series sheets, non-256px-wide, or non-32px-content assets (pass force:true to override). This is the gate that keeps mis-classified art out of the database.',
        inputSchema: {
          type: 'object',
          properties: {
            graphicName: { type: 'string', description: 'PNG base name in Graphics/Tilesets (with or without .png)' },
            name: { type: 'string', description: 'Database display name (default = graphicName)' },
            autotileNames: { type: 'array', items: { type: 'string' }, description: 'Up to 7 autotile graphic names (optional)' },
            force: { type: 'boolean', description: 'Override the native-asset guard (default false)' },
          },
          required: ['graphicName'],
        },
      },
      {
        name: 'render_tileset_atlas',
        description: 'Render a labeled atlas of a tileset to a PNG: the tileset graphic scaled with a grid, each regular tile\'s id burned in, passability indicators, and the 7 autotile slots. This is a quick numeric reference, not semantic proof; use create_tileset_identification_harness before assigning map-design roles.',
        inputSchema: {
          type: 'object',
          properties: {
            tilesetId: { type: 'number', description: 'Tileset id (a map\'s tileset_id)' },
            scale: { type: 'number', description: 'Integer upscale for legibility (default 2)' },
            outPath: { type: 'string', description: 'Output PNG path (default Data/.mcp-preview/tilesetNNN-atlas.png)' },
          },
          required: ['tilesetId'],
        },
      },
      {
        name: 'create_tileset_identification_harness',
        description: 'Create a review bundle for one tileset that separates engine facts from semantic claims. Produces the exact source sheet, isolated transparent tile images, source-row strips, manifest.json (priority, passage flags, alpha bounds), catalog templates, and an interactive index.html for identifying single tiles and rectangular multi-tile objects. Use this before assigning map-design roles to an uncataloged tileset.',
        inputSchema: {
          type: 'object',
          properties: {
            tilesetId: { type: 'number', description: 'Tileset id to inspect' },
            scale: { type: 'number', description: 'Integer review-image scale (default 4)' },
            outDir: { type: 'string', description: 'Output directory (default Data/.mcp-tilecatalog/<tileset-id>/)' },
          },
          required: ['tilesetId'],
        },
      },
      {
        name: 'get_tileset_catalog',
        description: 'Read the structured semantic catalog for a tileset together with its generated engine-fact manifest and validation summary. Absence from the catalog means unreviewed, not safe to infer.',
        inputSchema: {
          type: 'object',
          properties: {
            tilesetId: { type: 'number', description: 'Tileset id' },
          },
          required: ['tilesetId'],
        },
      },
      {
        name: 'save_tileset_catalog',
        description: 'Validate and save reviewed semantic findings for a tileset. Accepts incremental tile/object/autotile arrays or the complete catalog JSON exported by the review page. Generated engine facts cannot be overwritten by catalog claims.',
        inputSchema: {
          type: 'object',
          properties: {
            tilesetId: { type: 'number', description: 'Tileset id' },
            entries: { type: 'array', items: { type: 'object' }, description: 'Reviewed regular-tile semantic entries' },
            objects: { type: 'array', items: { type: 'object' }, description: 'Reviewed rectangular multi-tile object definitions' },
            autotiles: { type: 'array', items: { type: 'object' }, description: 'Reviewed autotile-slot semantics' },
            catalog: { type: 'object', description: 'Complete catalog JSON exported by the review page; replaces semantic maps while preserving trusted tileset identity' },
            replace: { type: 'boolean', description: 'Replace instead of merge (default false)' },
          },
          required: ['tilesetId'],
        },
      },
      {
        name: 'validate_tileset_catalog',
        description: 'Validate a tileset catalog against its engine manifest. Reports invalid ids, malformed object grids, contradictory layer/priority choices, transparent z0 placement, and unreviewed tiles. strict=true requires every regular tile to have a reviewed entry.',
        inputSchema: {
          type: 'object',
          properties: {
            tilesetId: { type: 'number', description: 'Tileset id' },
            strict: { type: 'boolean', description: 'Require every regular tile to be reviewed (default false)' },
          },
          required: ['tilesetId'],
        },
      },
      {
        name: 'render_map',
        description: 'Render a map\'s tile layers to a flat top-down PNG preview (outside the editor) and return the file path. Composites all 3 tile layers using the tileset graphic and autotiles. Use this to SEE a map you built/edited and self-check it. Layout preview only: no priority/overhead draw-order, fog/panorama/weather, autotile animation (frame 0), or event sprites. Reads project Graphics/ then falls back to the RTP (override base with RPGMAKER_RTP_PATH). Writes to Data/.mcp-preview/ by default; Read the returned path to view it.',
        inputSchema: {
          type: 'object',
          properties: {
            mapId: { type: 'number', description: 'Map ID to render' },
            layers: { type: 'array', items: { type: 'number' }, description: 'Which z-layers (0=ground,1=detail,2=overhead) to draw, in order. Default [0,1,2]' },
            scale: { type: 'number', description: 'Integer nearest-neighbour upscale for legibility (default 1)' },
            region: {
              type: 'object',
              description: 'Crop in tiles (default: whole map)',
              properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
            },
            drawGrid: { type: 'boolean', description: 'Overlay a 32px tile grid (default false)' },
            drawEvents: { type: 'boolean', description: 'Draw events (page-0 sprite/tile, else a marker) and return an event legend (default false)' },
            passability: { type: 'boolean', description: 'Tint cells by passability: red=blocked, orange=partial. Approximate, uses the topmost tile (default false)' },
            outPath: { type: 'string', description: 'Output PNG path (default Data/.mcp-preview/map<NNN>.png)' },
          },
          required: ['mapId'],
        },
      },
    ];
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    const result = await this.executeToolFunction(name, args);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async executeToolFunction(name: string, args: any): Promise<any> {
    switch (name) {
      // Actor Tools
      case 'get_actors':
        return await actorTools.getActors(this.projectPath);
      case 'get_actor':
        return await actorTools.getActor(this.projectPath, args.actorId);
      case 'update_actor':
        return await actorTools.updateActor(this.projectPath, args.actorId, args.updates);
      case 'create_actor':
        return await actorTools.createActor(this.projectPath, args);
      case 'search_actors':
        return await actorTools.searchActors(this.projectPath, args.searchTerm);

      // Item Tools
      case 'get_items':
        return await itemTools.getItems(this.projectPath);
      case 'get_weapons':
        return await itemTools.getWeapons(this.projectPath);
      case 'get_armors':
        return await itemTools.getArmors(this.projectPath);
      case 'get_skills':
        return await itemTools.getSkills(this.projectPath);
      case 'update_item':
        return await itemTools.updateItem(this.projectPath, args.itemId, args.updates);
      case 'search_items':
        return await itemTools.searchItems(this.projectPath, args.searchTerm);
      case 'create_weapon':
        return await itemTools.createWeapon(this.projectPath, args);
      case 'create_armor':
        return await itemTools.createArmor(this.projectPath, args);

      // Skill Tools
      case 'get_skill':
        return await skillTools.getSkill(this.projectPath, args.skillId);
      case 'create_skill':
        return await skillTools.createSkill(this.projectPath, args);
      case 'create_damage_skill':
        return await skillTools.createDamageSkill(
          this.projectPath,
          args.name,
          args.power,
          args.spCost,
          args.scope,
          args.elementId,
          args.description,
          args.physical
        );
      case 'create_healing_skill':
        return await skillTools.createHealingSkill(
          this.projectPath,
          args.name,
          args.power,
          args.spCost,
          args.scope,
          args.description
        );
      case 'create_state_skill':
        return await skillTools.createStateSkill(
          this.projectPath,
          args.name,
          args.stateId,
          args.hit,
          args.spCost,
          args.scope,
          args.description
        );
      case 'update_skill':
        return await skillTools.updateSkill(this.projectPath, args.skillId, args.updates);
      case 'search_skills':
        return await skillTools.searchSkills(this.projectPath, args.searchTerm);

      // Map Tools
      case 'get_map':
        return await mapTools.getMap(this.projectPath, args.mapId, args.includeTiles);
      case 'get_map_infos':
        return await mapTools.getMapInfos(this.projectPath);
      case 'get_map_events':
        return await mapTools.getMapEvents(this.projectPath, args.mapId);
      case 'get_map_event':
        return await mapTools.getMapEvent(this.projectPath, args.mapId, args.eventId);
      case 'update_map_event':
        return await mapTools.updateMapEvent(this.projectPath, args.mapId, args.eventId, args.updates);
      case 'create_map_event':
        return await mapTools.createMapEvent(this.projectPath, args.mapId, args);
      case 'search_map_events':
        return await mapTools.searchMapEvents(this.projectPath, args.mapId, args.searchTerm);
      case 'add_event_command':
        return await mapTools.addEventCommand(
          this.projectPath,
          args.mapId,
          args.eventId,
          args.pageIndex,
          args.command,
          args.position
        );
      case 'add_show_text':
        return await mapTools.addShowText(
          this.projectPath,
          args.mapId,
          args.eventId,
          args.pageIndex,
          args.text,
          args.position
        );

      // Map Connectivity Tools (FR-2)
      case 'create_transfer_event':
        return await mapTools.createTransferEvent(this.projectPath, args.mapId, {
          x: args.x, y: args.y,
          targetMapId: args.targetMapId, targetX: args.targetX, targetY: args.targetY,
          name: args.name, direction: args.direction, fade: args.fade, trigger: args.trigger,
          graphic: args.graphic,
        });
      case 'validate_connectivity':
        return await mapTools.validateWorldGraph(this.projectPath, { diagram: args.diagram });

      // Map Authoring Tools
      case 'get_map_design_guide':
        return await guideTools.getMapDesignGuide();
      case 'create_map':
        return await mapTools.createMap(this.projectPath, args);
      case 'get_map_size_advisory':
        return await mapTools.getMapSizeAdvisory(this.projectPath, args.mapId, args.purpose);
      case 'get_map_tiles':
        return await mapTools.getMapTiles(this.projectPath, args.mapId, args.layer, args.region);
      case 'set_map_tiles':
        return await mapTools.setMapTiles(this.projectPath, args.mapId, args.layer, args.x, args.y, args.grid);
      case 'fill_region':
        return await mapTools.fillRegion(this.projectPath, args.mapId, args.layer, args.tileId, args.rect);
      case 'apply_autotile':
        return await mapTools.applyAutotile(this.projectPath, args.mapId, args.layer, args.autotileSlot, { region: args.region, cells: args.cells, blob: args.blob, path: args.path }, args.edgeMode);
      case 'scatter_tiles':
        return await mapTools.scatterTiles(this.projectPath, args.mapId, args.layer, args.tileIds, args.region, { density: args.density, seed: args.seed, avoidOccupied: args.avoidOccupied, focal: args.focal });

      // Database Tools
      case 'get_database':
        return await databaseTools.getDatabase(this.projectPath, args.kind);
      case 'get_database_entry':
        return await databaseTools.getDatabaseEntry(this.projectPath, args.kind, args.id);
      case 'update_database_entry':
        return await databaseTools.updateDatabaseEntry(this.projectPath, args.kind, args.id, args.updates);

      // Script Tools
      case 'get_scripts':
        return await scriptTools.getScripts(this.projectPath);
      case 'get_script':
        return await scriptTools.getScript(this.projectPath, args.index);
      case 'update_script':
        return await scriptTools.updateScript(this.projectPath, args.index, args.code, args.name);
      case 'create_script':
        return await scriptTools.createScript(this.projectPath, args.name, args.code, args.position);
      case 'search_scripts':
        return await scriptTools.searchScripts(this.projectPath, args.pattern);

      // System Tools
      case 'get_system':
        return await systemTools.getSystem(this.projectPath);
      case 'get_variables':
        return await systemTools.getVariables(this.projectPath);
      case 'set_variable_name':
        await systemTools.setVariableName(this.projectPath, args.variableId, args.name);
        return { success: true };
      case 'get_switches':
        return await systemTools.getSwitches(this.projectPath);
      case 'set_switch_name':
        await systemTools.setSwitchName(this.projectPath, args.switchId, args.name);
        return { success: true };
      case 'get_game_title':
        return await systemTools.getGameTitle(this.projectPath);
      case 'update_game_title':
        await systemTools.updateGameTitle(this.projectPath, args.title);
        return { success: true };
      case 'update_starting_position':
        await systemTools.updateStartingPosition(this.projectPath, args.mapId, args.x, args.y);
        return { success: true };

      // Validation Tools
      case 'validate_assets':
        return await assetTools.validateAssets(this.projectPath, { includeMaps: args.includeMaps });
      case 'classify_asset':
        return await importVerifyTools.classifyAsset(args.filePath);
      case 'verify_tileset':
        return await importVerifyTools.verifyTileset(args.filePath, { scale: args.scale, outDir: args.outDir });
      case 'register_tileset':
        return await importVerifyTools.registerTileset(this.projectPath, {
          graphicName: args.graphicName, name: args.name,
          autotileNames: args.autotileNames, force: args.force,
        });

      // Render Tools
      case 'render_tileset_atlas':
        return await renderTools.renderTilesetAtlas(this.projectPath, args.tilesetId, { scale: args.scale, outPath: args.outPath });
      case 'create_tileset_identification_harness':
        return await tilesetCatalogTools.createTilesetIdentificationHarness(this.projectPath, args.tilesetId, { scale: args.scale, outDir: args.outDir });
      case 'get_tileset_catalog':
        return await tilesetCatalogTools.getTilesetCatalog(this.projectPath, args.tilesetId);
      case 'save_tileset_catalog':
        return await tilesetCatalogTools.saveTilesetCatalog(this.projectPath, args.tilesetId, {
          entries: args.entries,
          objects: args.objects,
          autotiles: args.autotiles,
          catalog: args.catalog,
          replace: args.replace,
        });
      case 'validate_tileset_catalog':
        return await tilesetCatalogTools.validateTilesetCatalog(this.projectPath, args.tilesetId, args.strict);
      case 'render_map':
        return await renderTools.renderMap(this.projectPath, args.mapId, {
          layers: args.layers,
          scale: args.scale,
          region: args.region,
          drawGrid: args.drawGrid,
          drawEvents: args.drawEvents,
          passability: args.passability,
          outPath: args.outPath,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RPG Maker XP MCP server running on stdio');
  }
}

// Start the server
const server = new RPGMakerXPServer();
server.run().catch(console.error);
