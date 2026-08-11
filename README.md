# RPG Maker XP MCP Server

**Author RPG Maker XP games in natural language.**

A Model Context Protocol (MCP) server that reads and writes an RPG Maker XP
project's Ruby 1.8 Marshal `.rxdata` files directly — actors, skills, items,
maps, events, scripts, and system data — and renders map previews to PNG. Point
an MCP client (Claude Desktop, Claude Code, …) at your project and create or
edit game content by describing it.

Built on a byte-verified Marshal codec (with a vendored decoder fix) and
defaults that mirror the RMXP editor exactly, so edits round-trip cleanly.

## How it works

- `.rxdata` files are parsed with a vendored, bug-fixed copy of
  [@hyrious/marshal](https://github.com/hyrious/marshal) (`src/vendor/marshal/`)
  and converted to plain JSON. Ruby objects become `{ "_class": "RPG::Actor", ... }`
  with instance variables as fields (no leading `@`).
  The vendored fix: upstream ≤0.3.3 mis-decodes negative multibyte Marshal
  integers (−150 → +106), which silently corrupted every healing skill
  (negative power) on save. See `research/REPORT.md`.
- The RGSS binary classes `Table` (tile/parameter grids), `Color` and `Tone`
  have dedicated codecs (`{ "_class": "Table", dim, xsize, ysize, zsize, data }`).
- On save, strings are written as raw byte strings (no Ruby 1.9 encoding ivars)
  so files stay loadable by XP's Ruby 1.8 / RGSS104E.
- The game title lives in `Game.ini` (not in System data, unlike MZ).
- Round-trips of all 15 template `.rxdata` files from the RMXP install are
  byte-identical.

## Quality-of-life behavior (research-driven)

- **Automatic backups**: before the first write to any file in a session,
  the original is copied to `Data/.mcp-backup/<name>.bak` (and the project
  root for `Game.ini`).
- **Save-revision marker**: map/event writes regenerate `System.magic_number`,
  mirroring the editor, so existing save files reload the changed map
  instead of keeping a stale copy.
- **Event list invariants enforced**: command lists are normalized on save —
  every command gets code/indent/parameters and the trailing
  `{code: 0, indent: 0, parameters: []}` terminator is guaranteed.
- **Verified engine math in the schemas**: skill tools document XP's actual
  damage algorithm (extracted from `Game_Battler 3`), and the simplified
  helpers are calibrated to the default-database conventions
  (e.g. heals are negative power with `int_f` 50).

## Requirements

- Node.js 18 or newer.
- An RPG Maker XP project (a folder containing `Game.rxproj` and `Data/`).
- To use the RTP assets (the default tiles, autotiles, characters, and audio),
  you must own RPG Maker XP. The server reads them from your own installation at
  runtime; it does not bundle or redistribute any engine assets.

## Installation

The published package ships a prebuilt server, so no build step is required.
Most MCP clients can launch it on demand with `npx` (see Configuration), or you
can install it explicitly:

```bash
npm install -g rpgmaker-xp-mcp
```

### From source

```bash
git clone https://github.com/SerifeusStudio/rpgmaker-xp-mcp.git
cd rpgmaker-xp-mcp
npm install
npm run build
```

## Configuration

Point the server at an RPG Maker XP project (the folder containing `Game.rxproj`
and `Data/`) via the `RPGMAKER_PROJECT_PATH` environment variable. If your project
relies on RTP assets in a non-default location, also set `RPGMAKER_RTP_PATH`; it
defaults to the Steam RPG Maker XP install.

### Claude Code

```bash
claude mcp add --scope user rpgmaker-xp \
  --env "RPGMAKER_PROJECT_PATH=C:\path\to\your\project" \
  -- npx -y rpgmaker-xp-mcp
```

### Claude Desktop (`%APPDATA%\Claude\claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "rpgmaker-xp": {
      "command": "npx",
      "args": ["-y", "rpgmaker-xp-mcp"],
      "env": {
        "RPGMAKER_PROJECT_PATH": "C:/path/to/your/xp/project"
      }
    }
  }
}
```

To run a local build instead of the published package, use `node` with the path
to `dist/index.js` as the command.

### Using with Ollama and other local models

The server speaks standard MCP over stdio, so it is natively compatible with any
MCP client, not only Claude. Ollama does not yet ship an MCP client of its own, so
a local model reaches the server through a small bridge. Both options below reuse
the same `mcpServers` configuration shape shown above.

**Open WebUI (recommended for a chat UI over Ollama).** Open WebUI has native MCP
support and connects to stdio servers through [`mcpo`](https://github.com/open-webui/mcpo),
an OpenAPI proxy. Save an `mcpo.json`:

```json
{
  "mcpServers": {
    "rpgmaker-xp": {
      "command": "npx",
      "args": ["-y", "rpgmaker-xp-mcp"],
      "env": { "RPGMAKER_PROJECT_PATH": "C:/path/to/your/xp/project" }
    }
  }
}
```

Run the proxy, then register it in Open WebUI:

```bash
uvx mcpo --port 8000 --config mcpo.json
```

In Open WebUI, add the tool server `http://localhost:8000/rpgmaker-xp` (its OpenAPI
docs are at `/rpgmaker-xp/docs`). The tools become available to any Ollama model
you have loaded.

**Terminal / TUI.** [`mcp-client-for-ollama`](https://github.com/jonigl/mcp-client-for-ollama)
(`ollmcp`) connects one or more MCP servers directly to a local Ollama model using
the same configuration shape.

Choose a model with capable tool calling (for example a recent Qwen or Llama
instruct model). Smaller models can struggle to chain several tool calls reliably,
which matters here because map authoring is multi-step.

## Available Tools (65)

### Actors
`get_actors`, `get_actor`, `update_actor`, `create_actor`, `search_actors`

XP actors use a `parameters` Table (6×100: MaxHP, MaxSP, STR, DEX, AGI, INT per
level) instead of MZ traits. `create_actor` generates linear growth curves by
default. Equipment slots are `weapon_id` and `armor1_id`–`armor4_id`
(shield/helmet/body/accessory).

### Items / Equipment
`get_items`, `get_weapons`, `get_armors`, `get_skills`, `update_item`,
`search_items`, `create_weapon`, `create_armor`

`create_weapon`/`create_armor` append to `Weapons.rxdata`/`Armors.rxdata` with
editor-default fields (override any). Armor `kind`: 0=shield, 1=helmet, 2=body,
3=accessory.

### Skills
`get_skill`, `create_skill`, `create_damage_skill`, `create_healing_skill`,
`create_state_skill`, `update_skill`, `search_skills`

XP has no damage formulas. Damage = `power` scaled by stat influence rates
(`atk_f`/`str_f` for physical, `int_f` for magical) and reduced by the target's
`pdef_f`/`mdef_f` rates. **Negative power = healing.** There is no
`create_buff_skill` (XP has no buff system — use states instead).

Scope values: 0=none, 1=one enemy, 2=all enemies, 3=one ally, 4=all allies,
5=one ally (HP 0), 6=all allies (HP 0), 7=user.

### Maps / Events
`get_map`, `get_map_infos`, `get_map_events`, `get_map_event`,
`update_map_event`, `create_map_event`, `create_transfer_event`,
`search_map_events`, `add_event_command`, `add_show_text`

Maps live in `Data/MapXXX.rxdata`. `get_map` summarizes the tile-data Table
unless `includeTiles: true`. Events are stored in a hash keyed by event ID.
`add_show_text` handles XP's message structure (first line = code 101,
continuations = 401, 4 lines per box). XP-specific notes: code 101 carries
text directly (unlike VX+); choice text exists redundantly in both the 102
array and the 402 branches and must stay in sync; move routes are 209/509.

`create_transfer_event` wires two maps together — it writes a Transfer Player
(command 201) event and validates that both endpoints exist and are in bounds
before saving. Use `validate_connectivity` afterward to check the whole world
graph. The complete 110-code command table is in `research/event-commands.md`.

### Map authoring (tile painting)
`get_map_design_guide`, `get_map_size_advisory`, `create_map`, `get_map_tiles`,
`set_map_tiles`, `fill_region`, `apply_autotile`, `scatter_tiles`

`apply_autotile` paints an autotile and computes seamless edges; give it an
organic **`blob`** (ponds/lakes/forest), a **`cells`** list (rivers/curved paths),
or a **`region`** rect (rectangular floors only). `scatter_tiles` distributes
clutter (flowers/bushes/rocks) at a target density with an optional focal
gradient — so maps get organic shapes and whole-map detail instead of blocky
ponds and corner-clustered tiles. See `MAP-DESIGN.md` §5b for the craft rules.

`get_map_design_guide` returns the level-design guide (layer roles, priority,
the multi-tile no-overlap rule, composition, workflow) — load it before authoring;
`create_map` also returns its core rules inline. When editing an existing map,
`get_map_size_advisory` reports its screen count, target focal-point and
path-junction counts, recommended scatter density, and oversize or
purpose-mismatch warnings, so size and tile budget guide the design.
Layers (`Map.data` z, drawn
z0→z1→z2 = editor Layer 1/2/3) are assigned by **role**: z0 terrain (autotiles),
z1 ground clutter (priority 0), z2 overhead (priority > 0 — tree canopies/roofs
the player walks behind).

Create maps and paint their tile layers directly. `create_map` writes a blank
`MapXXX.rxdata` (`Table[w,h,3]` of tile id 0) + a `MapInfos` entry with editor
defaults. `fill_region` and `set_map_tiles` write tile ids into a layer
(0=ground, 1=detail, 2=overhead); `get_map_tiles` reads them back as a 2D grid.
Tile ids: 0 = empty, 48–383 = autotiles (`slot=id/48-1`, `variant=id%48`), ≥384
= regular tiles (`col=(id-384)%8`, `row=(id-384)/8`). `apply_autotile` paints an
autotile region and computes the correct **edge variant per cell** from
8-neighbour connectivity (seamless coastlines/paths/cliffs, not blocky fills),
recomputing the border ring so it blends. Pair with `render_map` to see results.
Before composing with an unfamiliar tileset, generate and review its semantic
catalog with the identification harness described below.

### Validation
`validate_assets`, `validate_connectivity`

`validate_assets` scans every data file for referenced graphic/audio filenames
(tilesets, autotiles, panoramas, fogs, battlebacks, character/battler/icon
graphics, animations, windowskin/title/gameover/transition, BGM/BGS/ME, and map
event sprites) and reports any with no matching file on disk — broken references
are otherwise silent until runtime. Checks the project's `Graphics/`+`Audio/`
first, then the RTP; matches on base name regardless of extension.

`validate_connectivity` builds the world transfer graph from every map's Transfer
Player events and reports problems that are otherwise hard to spot: maps that are
unreachable from the start map, transfers that point at a missing map or an
out-of-bounds tile, and dead ends.

### Tileset identification and map preview
`create_tileset_identification_harness`, `get_tileset_catalog`,
`save_tileset_catalog`, `validate_tileset_catalog`, `render_tileset_atlas`,
`render_map`

`create_tileset_identification_harness` creates an evidence-first review bundle:
the exact source sheet, a labeled full-sheet copy with burned-in tile IDs,
isolated transparent tile images, source rows, autotile sources, engine metadata,
a catalog template, and an interactive browser page.
Reviewed labels, intended uses, object grids, layers, and confidence live in a
separate catalog so passability or visual resemblance cannot silently become a
semantic claim. See `TILESET-CATALOG.md`.

`render_tileset_atlas` renders a tileset to a labeled PNG — the graphic scaled
with a grid, **each tile's id burned in**, passability dots (red=blocked,
orange=partial), and a legend strip of the 7 autotile slots. It is a quick
numeric reference; use the identification harness to determine what a tile is
and whether it belongs to a larger object.


Renders a map's tile layers to a flat top-down **PNG preview** outside the
editor, so you can *see* a map you built or edited and self-check it. Composites
all three tile layers using the tileset graphic (tile ids ≥ 384) and the
tileset's autotiles (ids 48–383, via a cross-verified 48-variant quadrant
table). Options: `layers`, `scale` (integer upscale), `region` (tile crop),
`drawGrid`, `drawEvents` (page-0 sprite/tile + an event legend), `passability`
(red = blocked, orange = partial). Reads the project's `Graphics/` first, then
falls back to the RTP (set `RPGMAKER_RTP_PATH`; defaults to the Steam install).
Writes to `Data/.mcp-preview/map<NNN>.png` by default and returns the path —
open/Read it to view. Layout preview only: no priority/overhead draw-order,
fog/panorama/weather, or autotile animation (frame 0 used). Full design notes:
`SCOPING-map-renderer.md`.

### Asset import verification
`classify_asset`, `verify_tileset`, `register_tileset`

Tools for bringing outside graphics into a project safely. Sorting a sheet by its
canvas dimensions alone silently mis-imports assets authored for other engines, so
these detect the true content tile size (edge-periodicity, where a candidate size
must evenly divide the canvas, with a bias toward native 32px) and fingerprint the
filename (`$`/`!` prefix = a single-object sprite that belongs in `Characters`,
not a tileset; `A1`–`A5` = an MV/MZ autotile sheet only when the content is not
32px, otherwise a battler variant). `verify_tileset` writes a grid-overlay preview
so scale problems are visible before import. `register_tileset` adds a guarded
`Tilesets.rxdata` entry (with passages/priorities/terrain Tables sized to the
sheet) and declines non-native assets unless explicitly forced.

### Database (Classes, States, Enemies, Troops, CommonEvents, Tilesets, ...)
`get_database`, `get_database_entry`, `update_database_entry`

Generic access to every database file, including the ones without dedicated
tools. Tileset passability lives in the `passages` Table (0 = passable,
1/2/4/8 = down/left/right/up blocked, 15 = impassable, +64 bush, +128 counter).

### Scripts (Scripts.rxdata)
`get_scripts`, `get_script`, `update_script`, `create_script`, `search_scripts`

Full RGSS script access with zlib handling. Sources are stored as
`[magic, name, zlib-deflated code]` triples; per-script magic numbers are
not meaningful to the editor. `create_script` inserts above `Main` by
convention. Binary-safe: script data never passes through UTF-8 string
conversion.

### System
`get_system`, `get_variables`, `set_variable_name`, `get_switches`,
`set_switch_name`, `get_game_title`, `update_game_title`,
`update_starting_position`

## Testing

```bash
npm run build
node test/roundtrip.mjs     # marshal round-trip against real RMXP template data
node test/tools.mjs         # end-to-end tool tests on a scratch project
node test/server-smoke.mjs  # MCP stdio handshake + tool calls
node test/render.mjs        # map renderer: autotile table + PNG renders
```

Render tests need local RMXP graphics (the Steam RTP install and the
`library/Valentine90-ABS` fixture); they SKIP rather than fail when those assets
are absent. The autotile-table integrity check always runs.

The round-trip test loads every `.rxdata` file from the RMXP install's
new-project template, converts to JSON and back, and verifies semantic
equality (output is byte-size identical to the originals).

## Safety and Best Practices

1. **Backup your project** before making changes (the whole `Data/` folder)
2. **Close the RPG Maker XP editor** while using this server — the editor
   rewrites all data files on save and will clobber external changes
3. The server backs up each file to `Data/.mcp-backup/` before its first write
   per session, and bumps `System.magic_number` so existing saves reload edited
   maps
4. Test your game after changes

## How the conventions reach any client

The server surfaces its own guidance so **any** MCP client (not just one that can
read this repo) gets the conventions:
- **Server instructions** are sent on connect (governance + map-design rules) and
  injected into context by most clients.
- The docs below are also exposed as **MCP resources** (`rpgmaker-xp://docs/…`):
  `map-design`, `tileset-catalog`, `authoring`, `wisdom` — readable on demand.
- `get_map_design_guide` returns the full map-design doc, and `create_map` returns
  its core rules inline.

## Further reading

- **[AUTHORING-XP.md](AUTHORING-XP.md)** — Writing for RPG Maker XP: the
  particularities of XP authoring and how this MCP acts as a **governance layer**
  to keep a project canonical and drift-free as humans and LLMs edit it.
- **[MAP-DESIGN.md](MAP-DESIGN.md)** — level/map design guide: the three-layer
  model (terrain / clutter / overhead), tile priority & passability, multi-tile
  object rules, and composition principles. Loaded in context via
  `get_map_design_guide`.
- **[TILESET-CATALOG.md](TILESET-CATALOG.md)** - evidence-first tile
  identification, multi-tile object grouping, confidence rules, and catalog
  validation before automatic map composition.
- **[WISDOM.md](WISDOM.md)** — collected engineering wisdom (Marshal layer, battle
  math, event system, coexisting with the editor).
- **SCOPING-*.md** — design notes for the renderer, map authoring, and graphics
  generation features.

## Credits

Forked from **[k4zuki0539/-rpgmaker-mz-mcp](https://github.com/k4zuki0539/-rpgmaker-mz-mcp)**
(RPG Maker MZ MCP Server, MIT), then re-authored for RPG Maker XP: the MZ
version targeted MZ's JSON data; this fork reads and writes XP's Ruby 1.8
Marshal `.rxdata` directly, adds skills/scripts/database/render tooling, a
byte-verified Marshal codec, and map rendering. Upstream authorship and the MIT
license are preserved — see [`LICENSE`](LICENSE).

Maintained by **[SerifeusStudios](https://github.com/SerifeusStudio)**.
Third-party components and their licenses are listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## License

MIT — © 2025 k4zuki0539 (original MZ MCP) and © 2026 SerifeusStudios (XP fork).
See [`LICENSE`](LICENSE) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
