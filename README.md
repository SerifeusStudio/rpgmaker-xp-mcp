# RPG Maker XP MCP Server

**Build RPG Maker XP games by describing what you want.**

> *"Make a healing potion that restores 200 HP and costs 150 gold."*
> *"Create a 40×30 forest map with a pond in the north-east, then show it to me."*
> *"Find every NPC on map 3 whose dialogue mentions the king."*

This is an [MCP](#what-is-mcp) server that reads and writes an RPG Maker XP
project's `.rxdata` files directly — actors, skills, items, maps, events,
scripts and system data — and renders map previews to PNG so you can see what
was built without opening the editor.

It talks to XP's native Ruby 1.8 Marshal format. Nothing is exported,
converted, or kept in a side file: it edits your real project, and the editor
opens the result normally.

---

## ⚠️ Read this before your first run

**1. Close the RPG Maker XP editor while the server is running.**
The editor holds all data files in memory and rewrites every one of them when
you save. If it is open, it will overwrite anything this server changed. This
is the single most common way to lose work.

**2. Back up your project first.** Copy the whole `Data/` folder somewhere
safe. Do this even though the server takes its own backups, because:

**3. The automatic backup is not version history.** Before its first write to a
file in a session, the server copies the original to `Data/.mcp-backup/`. That
is **one `.bak` per file per session** — the next session overwrites it. It
protects you from the last thing you did, not from something you broke a week
ago. If your project matters, put it in git.

**4. Test your game after changes.** A file can be structurally valid and still
be wrong for your game.

---

## What is MCP?

The Model Context Protocol is a standard way for AI assistants to use external
tools. This server is not a chat program and has no interface of its own — it
is a backend that an **MCP client** connects to.

You need one of those clients. Common choices:

- **[Claude Code](https://claude.com/claude-code)** — terminal-based
- **[Claude Desktop](https://claude.ai/download)** — desktop app
- **Open WebUI, Cursor, Windsurf, or any other MCP-capable client** — including
  local models through Ollama ([see below](#using-a-local-model-via-ollama))

If you have never used an MCP client, start with Claude Desktop; the
[Configuration](#configuration) section has a copy-paste config.

---

## Requirements

| | |
|---|---|
| **Node.js** | 18 or newer |
| **An MCP client** | Claude Desktop, Claude Code, or any MCP-capable app |
| **An RPG Maker XP project** | a folder containing `Game.rxproj` and `Data/` |
| **RPG Maker XP itself** | required if your project uses RTP assets |

The RTP (the default tiles, autotiles, character sprites and audio) is read
from **your own installation** at runtime. This project does not bundle or
redistribute any Enterbrain assets.

### Does it work with Pokémon Essentials?

Structurally, yes — Essentials games are RPG Maker XP projects, and every tool
here operates on standard `.rxdata`. Two honest caveats: Essentials layers its
own conventions on top of the engine (its own data files, a very large
`Scripts.rxdata`, PBS text files) which this server knows nothing about, and
its projects are big enough that you should be especially sure about backup
point 2 above. Reading, map work and database edits behave normally.

---

## Installation

The published package ships prebuilt, so there is no build step. Most clients
can launch it on demand with `npx`.

```bash
npm install -g rpgmaker-xp-mcp
```

<details>
<summary><b>From source</b></summary>

```bash
git clone https://github.com/SerifeusStudio/rpgmaker-xp-mcp.git
cd rpgmaker-xp-mcp
npm install
npm run build
```

Then use `node` with the path to `dist/index.js` as the command in the configs
below.
</details>

---

## Configuration

Point the server at your project with `RPGMAKER_PROJECT_PATH` — the folder
containing `Game.rxproj` and `Data/`. If your RTP lives somewhere unusual, also
set `RPGMAKER_RTP_PATH`; it defaults to the Steam RPG Maker XP install.

### Claude Code

```bash
claude mcp add --scope user rpgmaker-xp \
  --env "RPGMAKER_PROJECT_PATH=C:\path\to\your\project" \
  -- npx -y rpgmaker-xp-mcp
```

### Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json`:

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

Restart the client, then check it connected by asking for something read-only:

> *"List the actors in my project."*

If you get names back, you are set up. See **[SETUP.md](SETUP.md)** for
troubleshooting.

### Using a local model via Ollama

The server speaks standard MCP over stdio, so it works with any MCP client, not
only Claude. Ollama has no MCP client of its own yet, so a local model reaches
it through a bridge.

**Open WebUI** has native MCP support via
[`mcpo`](https://github.com/open-webui/mcpo), an OpenAPI proxy. Save the same
`mcpServers` block as `mcpo.json`, then:

```bash
uvx mcpo --port 8000 --config mcpo.json
```

Register `http://localhost:8000/rpgmaker-xp` in Open WebUI as a tool server.

**Terminal:** [`ollmcp`](https://github.com/jonigl/mcp-client-for-ollama)
connects MCP servers straight to a local Ollama model.

Pick a model with solid tool calling (a recent Qwen or Llama instruct model).
Smaller models struggle to chain several calls reliably, which matters here —
map authoring is inherently multi-step.

---

## What it will *not* do

Worth knowing before you install:

- **XP only.** It does not read VX, VX Ace, MV or MZ projects. Their data
  formats are different (`.rvdata`, `.rvdata2`, JSON).
- **It does not generate art or audio.** It can import, classify and validate
  graphics you already have; it cannot draw them.
- **It does not write RGSS scripts for you** beyond storing what it is given —
  it manages `Scripts.rxdata` as data, and correctness is on you and your model.
- **It cannot run your game or test it.** `render_map` shows a static layout
  preview, not gameplay.
- **It does not know about Pokémon Essentials' own systems** (PBS files, its
  plugin conventions, its data classes).

---

## Available tools (65)

<details open>
<summary><b>Actors</b></summary>

`get_actors` · `get_actor` · `update_actor` · `create_actor` · `search_actors`

XP actors use a `parameters` Table (6×100 — MaxHP, MaxSP, STR, DEX, AGI, INT
per level) rather than MZ-style traits. `create_actor` generates linear growth
curves by default. Equipment slots are `weapon_id` and `armor1_id`–`armor4_id`
(shield / helmet / body / accessory).
</details>

<details>
<summary><b>Items & equipment</b></summary>

`get_items` · `get_weapons` · `get_armors` · `get_skills` · `update_item` ·
`search_items` · `create_weapon` · `create_armor`

`create_weapon`/`create_armor` append to `Weapons.rxdata`/`Armors.rxdata` with
editor-default fields (override any). Armor `kind`: 0=shield, 1=helmet, 2=body,
3=accessory.
</details>

<details>
<summary><b>Skills</b></summary>

`get_skill` · `create_skill` · `create_damage_skill` · `create_healing_skill` ·
`create_state_skill` · `update_skill` · `search_skills`

XP has no damage formulas. Damage is `power` scaled by stat-influence rates
(`atk_f`/`str_f` physical, `int_f` magical) and reduced by the target's
`pdef_f`/`mdef_f`. **Negative power = healing.** There is no `create_buff_skill`
— XP has no buff system, use states.

Scope: 0=none, 1=one enemy, 2=all enemies, 3=one ally, 4=all allies,
5=one ally (HP 0), 6=all allies (HP 0), 7=user.
</details>

<details>
<summary><b>Maps & events</b></summary>

`get_map` · `get_map_infos` · `get_map_events` · `get_map_event` ·
`update_map_event` · `create_map_event` · `create_transfer_event` ·
`search_map_events` · `add_event_command` · `add_show_text`

Maps live in `Data/MapXXX.rxdata`. `get_map` summarises the tile Table unless
`includeTiles: true`. Events are a hash keyed by event ID.

`add_show_text` handles XP's message structure (first line = code 101,
continuations = 401, 4 lines per box). XP specifics: code 101 carries text
directly (unlike VX+); choice text is stored redundantly in both the 102 array
and the 402 branches and must stay in sync; move routes are 209/509.

`create_transfer_event` wires two maps together and validates both endpoints
exist and are in bounds before writing. Run `validate_connectivity` afterwards.
The full 110-code table is in [`research/event-commands.md`](research/event-commands.md).
</details>

<details>
<summary><b>Map authoring (tile painting)</b></summary>

`get_map_design_guide` · `get_map_size_advisory` · `create_map` ·
`get_map_tiles` · `set_map_tiles` · `fill_region` · `apply_autotile` ·
`scatter_tiles`

`apply_autotile` paints an autotile and computes seamless edge variants per
cell from 8-neighbour connectivity — give it an organic **`blob`** (ponds,
lakes, forest), a **`cells`** list (rivers, curved paths), or a **`region`**
rect (rectangular floors only). `scatter_tiles` distributes clutter at a target
density with an optional focal gradient. Together these avoid the blocky ponds
and corner-clustered detail that make maps look programmer-generated. See
[MAP-DESIGN.md](MAP-DESIGN.md) §5b.

Layers (`Map.data` z, drawn z0→z1→z2 = editor Layer 1/2/3) are assigned by
**role**: z0 terrain (autotiles), z1 ground clutter (priority 0), z2 overhead
(priority > 0 — canopies and roofs the player walks behind).

Tile ids: 0 = empty; 48–383 = autotiles (`slot=id/48-1`, `variant=id%48`);
≥384 = regular tiles (`col=(id-384)%8`, `row=(id-384)/8`).

Load `get_map_design_guide` before authoring — `create_map` also returns its
core rules inline. `get_map_size_advisory` reports screen count, target focal
points, recommended scatter density and oversize warnings for an existing map.
</details>

<details>
<summary><b>Validation</b></summary>

`validate_assets` · `validate_connectivity`

`validate_assets` scans every data file for referenced graphic and audio
filenames — tilesets, autotiles, panoramas, fogs, battlebacks, character,
battler and icon graphics, animations, windowskin, title, gameover, transition,
BGM/BGS/ME and map event sprites — and reports any with no file on disk. Broken
references are otherwise silent until runtime. Checks the project's `Graphics/`
and `Audio/` first, then the RTP, matching base name regardless of extension.

`validate_connectivity` builds the world transfer graph and reports maps
unreachable from the start map, transfers pointing at a missing map or an
out-of-bounds tile, and dead ends.
</details>

<details>
<summary><b>Tileset identification & preview</b></summary>

`create_tileset_identification_harness` · `get_tileset_catalog` ·
`save_tileset_catalog` · `validate_tileset_catalog` · `render_tileset_atlas` ·
`render_map`

**`create_tileset_identification_harness`** builds an evidence-first review
bundle: the source sheet, a labelled copy with burned-in tile IDs, isolated
transparent tile images, source rows, autotile sources, engine metadata, a
catalog template and an interactive browser page. Reviewed labels, intended
uses, object grids, layers and confidence live in a **separate catalog**, so
passability or visual resemblance cannot silently become a semantic claim. See
[TILESET-CATALOG.md](TILESET-CATALOG.md).

**`render_tileset_atlas`** renders a tileset to a labelled PNG — scaled with a
grid, each tile's id burned in, passability dots (red = blocked, orange =
partial) and a legend of the 7 autotile slots.

**`render_map`** renders a map's tile layers to a flat top-down **PNG preview**
outside the editor, so you can *see* what you built. Composites all three
layers using the tileset graphic (ids ≥ 384) and its autotiles (ids 48–383, via
a cross-verified 48-variant quadrant table). Options: `layers`, `scale`,
`region`, `drawGrid`, `drawEvents`, `passability`. Writes to
`Data/.mcp-preview/map<NNN>.png` and returns the path.

*Layout preview only* — no priority/overhead draw order, no fog, panorama or
weather, and autotile animation uses frame 0.
</details>

<details>
<summary><b>Asset import verification</b></summary>

`classify_asset` · `verify_tileset` · `register_tileset`

Sorting a sheet by canvas dimensions alone silently mis-imports assets authored
for other engines, so these detect the true **content** tile size
(edge-periodicity, where a candidate must evenly divide the canvas, biased
toward native 32px) and fingerprint the filename: a `$`/`!` prefix means a
single-object sprite belonging in `Characters`, not a tileset; `A1`–`A5` means
an MV/MZ autotile sheet *only* when content is not 32px, otherwise it is a
battler variant.

`verify_tileset` writes a grid-overlay preview so scale problems are visible
before import. `register_tileset` adds a guarded `Tilesets.rxdata` entry with
passages/priorities/terrain Tables sized to the sheet, and declines non-native
assets unless explicitly forced.
</details>

<details>
<summary><b>Database, scripts & system</b></summary>

**Database** — `get_database` · `get_database_entry` · `update_database_entry`

Generic access to every database file, including those without dedicated tools
(Classes, States, Enemies, Troops, CommonEvents, Tilesets…). Tileset passability
lives in the `passages` Table: 0 = passable; 1/2/4/8 = down/left/right/up
blocked; 15 = impassable; +64 bush; +128 counter.

**Scripts** — `get_scripts` · `get_script` · `update_script` · `create_script` ·
`search_scripts`

Full RGSS script access with zlib handling. Sources are stored as
`[magic, name, zlib-deflated code]` triples; per-script magic numbers are not
meaningful to the editor. `create_script` inserts above `Main` by convention.
Binary-safe — script data never passes through UTF-8 conversion.

**System** — `get_system` · `get_variables` · `set_variable_name` ·
`get_switches` · `set_switch_name` · `get_game_title` · `update_game_title` ·
`update_starting_position`
</details>

---

## How it works

<details>
<summary><b>The Marshal layer</b></summary>

`.rxdata` files are parsed with a vendored, bug-fixed copy of
[@hyrious/marshal](https://github.com/hyrious/marshal) (`src/vendor/marshal/`)
and converted to plain JSON. Ruby objects become
`{ "_class": "RPG::Actor", ... }` with instance variables as fields (no leading
`@`).

**Why vendored:** upstream ≤0.3.3 mis-decodes negative multibyte Marshal
integers — −150 decodes as +106. In XP, healing is negative power, so that bug
silently converted every healing skill into a damage skill on save. Details in
[`research/REPORT.md`](research/REPORT.md).

The RGSS binary classes `Table` (tile and parameter grids), `Color` and `Tone`
have dedicated codecs. On save, strings are written as **raw byte strings** with
no Ruby 1.9 encoding ivars, or XP's Ruby 1.8 / RGSS104E refuses to load them.
The game title lives in `Game.ini`, not in System data — unlike MZ.

Round-trips of 15 of the 16 template `.rxdata` files from the RMXP install are
byte-identical. The exception is `Scripts.rxdata`, which the round-trip test
excludes rather than fails: it stores zlib-compressed source as *binary*
strings, so it needs the raw path (`readRxdataRaw`) instead of the UTF-8 one
the rest of the database uses. The script tools handle it correctly; only the
round-trip test skips it.
</details>

<details>
<summary><b>Behaviour that protects your project</b></summary>

- **Automatic backups** — before the first write to any file in a session, the
  original is copied to `Data/.mcp-backup/<name>.bak` (project root for
  `Game.ini`). See the warning at the top: one per file per session.
- **Save-revision marker** — map and event writes regenerate
  `System.magic_number`, mirroring the editor, so existing save files reload the
  changed map instead of keeping a stale copy.
- **Event list invariants** — command lists are normalised on save: every
  command gets code/indent/parameters, and the trailing
  `{code: 0, indent: 0, parameters: []}` terminator is guaranteed.
- **Verified engine math** — skill tools document XP's real damage algorithm,
  extracted from `Game_Battler 3`, and the helpers are calibrated to
  default-database conventions (heals are negative power with `int_f` 50).
</details>

<details>
<summary><b>How conventions reach any client</b></summary>

The server surfaces its own guidance, so **any** MCP client gets the
conventions — not just one that can read this repository:

- **Server instructions** are sent on connect (governance + map-design rules)
  and injected into context by most clients.
- The guides are exposed as **MCP resources** (`rpgmaker-xp://docs/…`):
  `map-design`, `tileset-catalog`, `authoring`, `wisdom`.
- `get_map_design_guide` returns the full guide; `create_map` returns its core
  rules inline.
</details>

---

## Testing

```bash
npm run build
node test/roundtrip.mjs        # Marshal round-trip against real RMXP data
node test/tools.mjs            # end-to-end tool tests on a scratch project
node test/server-smoke.mjs     # MCP stdio handshake + tool calls
node test/render.mjs           # renderer: autotile table + PNG renders
node test/tileset-catalog.mjs  # catalog validation
node test/authoring.mjs        # map authoring primitives
node test/connectivity.mjs     # transfer-graph validation
node test/validate.mjs         # asset reference checking
node test/extract-scripts.mjs  # Scripts.rxdata extraction
```

The round-trip test loads every `.rxdata` file from the RMXP install's
new-project template, converts to JSON and back, and verifies byte-identical
output. Render tests need local RMXP graphics (the Steam RTP install and the
`library/Valentine90-ABS` fixture) and **skip** rather than fail when those are
absent; the autotile-table integrity check always runs.

---

## Documentation

| Document | What it covers |
|---|---|
| **[SETUP.md](SETUP.md)** | Install and configuration walkthrough, troubleshooting |
| **[EXAMPLES.md](EXAMPLES.md)** | Worked examples — what to ask for, and the tool calls it produces |
| **[AUTHORING-XP.md](AUTHORING-XP.md)** | Writing for XP, and how this server acts as a governance layer to keep a project canonical as humans and models both edit it |
| **[MAP-DESIGN.md](MAP-DESIGN.md)** | Level design: the three-layer model, priority and passability, multi-tile object rules, composition |
| **[SKILL_CREATION_GUIDE.md](SKILL_CREATION_GUIDE.md)** | XP's damage model in depth, and the skill creation tools |
| **[TILESET-CATALOG.md](TILESET-CATALOG.md)** | Evidence-first tile identification, object grouping, confidence rules |
| **[CONTENT-SOURCES.md](CONTENT-SOURCES.md)** | Licence-vetted catalogue of RGSS1 script libraries you can install with `create_script` |
| **[WISDOM.md](WISDOM.md)** | Collected engineering notes: Marshal layer, battle math, event system, coexisting with the editor |
| **[research/](research/)** | Event command table, RGSS class definitions, the decoder bug report |

---

## Credits

Forked from **[k4zuki0539/-rpgmaker-mz-mcp](https://github.com/k4zuki0539/-rpgmaker-mz-mcp)**
(RPG Maker MZ MCP Server, MIT), then re-authored for RPG Maker XP. The MZ
version targets MZ's JSON data; this fork reads and writes XP's Ruby 1.8
Marshal `.rxdata` directly, and adds skills, scripts, database and render
tooling, a byte-verified Marshal codec, map authoring and map rendering.
Upstream authorship and the MIT licence are preserved — see [`LICENSE`](LICENSE).

Maintained by **[SerifeusStudios](https://github.com/SerifeusStudio)**.
Third-party components and their licences are listed in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

RPG Maker XP is a product of Enterbrain / Gotcha Gotcha Games. This project is
unaffiliated, and bundles no engine assets.

## License

MIT — © 2025 k4zuki0539 (original MZ MCP) and © 2026 SerifeusStudios (XP fork).
See [`LICENSE`](LICENSE) and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
