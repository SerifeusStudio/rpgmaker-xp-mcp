# Worked examples

You do not call these tools by hand. You describe what you want in plain
language, and the model picks the tool and fills in the arguments. The JSON
below is shown so you can see what it produced — and so you can correct it when
it gets something wrong.

Every argument in this document is taken from the server's actual tool schemas.
If a call here fails, that is a bug worth [reporting](https://github.com/SerifeusStudio/rpgmaker-xp-mcp/issues).

> **Before your first write:** close the RPG Maker XP editor and back up
> `Data/`. See the warnings at the top of [README.md](README.md).

**Contents** · [First session](#first-session) · [Actors](#actors) ·
[Skills](#skills) · [Items](#items-and-equipment) · [Events](#events-and-dialogue) ·
[Connecting maps](#connecting-maps) · [Building a map](#building-a-map-from-scratch) ·
[Seeing your work](#seeing-what-you-built) · [Validation](#validation-before-you-ship) ·
[XP is not MZ](#xp-is-not-mz) · [Troubleshooting](#troubleshooting)

---

## First session

Start with something read-only, to confirm the server is connected and pointed
at the right project:

> *"List the actors in my project."*

You should get names and IDs back. If you get an error, see
[Troubleshooting](#troubleshooting).

Then get your bearings:

> *"How many maps does this project have, and what are they called?"*
> — `get_map_infos`
>
> *"Show me the game title and where the player starts."*
> — `get_game_title`, `get_system`

---

## Actors

### Look one up

> *"Show me actor 1."*

`get_actor` returns the full RPG::Actor: name, class, level range, the EXP
curve, graphics, starting equipment, and the `parameters` Table.

### Create one

> *"Create an actor called Rowan, class 1, starting at level 5, using the
> Fighter01 character graphic."*

```json
{
  "name": "Rowan",
  "class_id": 1,
  "initial_level": 5,
  "final_level": 99,
  "character_name": "001-Fighter01",
  "battler_name": "001-Fighter01"
}
```

Only `name` is required — everything else takes an RMXP editor default, and the
six stat growth curves are generated linearly unless you supply a `parameters`
Table.

Equipment slots use XP's names: `weapon_id`, and `armor1_id` through
`armor4_id` for shield, helmet, body and accessory.

### Change one

> *"Give actor 2 a starting shield — armor 3 — and rename them to Vale."*

```json
{
  "actorId": 2,
  "updates": { "name": "Vale", "armor1_id": 3 }
}
```

`updates` takes raw XP field names: `name`, `class_id`, `initial_level`,
`final_level`, `exp_basis`, `exp_inflation`, `character_name`, `character_hue`,
`battler_name`, `battler_hue`, `weapon_id`, `armor1_id`–`armor4_id`, the
matching `_fix` flags, and `parameters`.

### Find one

> *"Which actors have 'knight' in the name?"* — `search_actors`

---

## Skills

XP has **no damage formulas**. A skill has a `power` number, and the engine
scales it by stat-influence rates. The helpers below wrap that so you can think
in intent rather than in `int_f`.

### A damage skill

> *"Make a fire spell called Ember — 140 power, 75 SP, one enemy."*

```json
{
  "name": "Ember",
  "power": 140,
  "spCost": 75,
  "scope": 1,
  "elementId": 1,
  "physical": false
}
```

`physical: false` (the default) means the damage scales off INT and is reduced
by the target's MDEF; `true` uses ATK against PDEF. For calibration, the
default database's Fire is power 140 at 75 SP.

### A healing skill

> *"A heal that restores about 150, costs 80 SP, targets one ally."*

```json
{
  "name": "Mend",
  "power": 150,
  "spCost": 80,
  "scope": 3
}
```

Pass `power` as a **positive** number — the tool writes XP's negative-power
convention for you. Healing scales with the caster's INT, so the number is a
baseline, not a fixed amount. Default-database Heal is power 150 at 80 SP.

### A status skill

> *"A poison dart — 80% hit chance, 20 SP, one enemy."*

```json
{
  "name": "Poison Dart",
  "stateId": 3,
  "hit": 80,
  "spCost": 20,
  "scope": 1
}
```

XP default states: 3 poison, 5 blind, 6 silence, 7 confuse, 8 sleep,
9 paralyze. Confirm against your own `States.rxdata` — most projects change them.

**Scope values**, used by all skill tools: 0 none, 1 one enemy, 2 all enemies,
3 one ally, 4 all allies, 5 one ally (HP 0), 6 all allies (HP 0), 7 user.

---

## Items and equipment

> *"Change the Potion's price to 100 gold."* — `update_item`
>
> *"Create an iron shield, armor kind 0."* — `create_armor`
> Armor `kind`: 0 shield, 1 helmet, 2 body, 3 accessory.
>
> *"Raise the price of everything with 'Potion' in the name by half."*
> — `search_items`, then `update_item` per result.

---

## Events and dialogue

### Dialogue is the common case

> *"Add dialogue to event 4 on map 1: 'The bridge washed out last spring.
> You'll want the ferry.'"*

```json
{
  "mapId": 1,
  "eventId": 4,
  "pageIndex": 0,
  "text": "The bridge washed out last spring.\nYou'll want the ferry."
}
```

Use `add_show_text` rather than assembling commands yourself. XP splits a
message into a code 101 for the first line of each box and 401 for each
continuation, four lines per box — this tool handles the split, the box
boundaries and the terminator.

### A new event

> *"Put a signpost at (12, 8) on map 1."*

```json
{ "mapId": 1, "name": "Signpost", "x": 12, "y": 8 }
```

Omit `pages` and you get one empty page to build on — usually you then call
`add_show_text` against `pageIndex: 0`.

### Finding events

> *"Which events on map 3 mention the ferry?"* — `search_map_events`

```json
{ "mapId": 3, "searchTerm": "ferry" }
```

### Raw commands

`add_event_command` takes a raw `{code, indent, parameters}` when no helper
exists. The **canonical XP command table is
[`research/event-commands.md`](research/event-commands.md)** — 110 codes,
extracted from the default Interpreter scripts. Use it rather than a table you
remember from MV or MZ; see [XP is not MZ](#xp-is-not-mz).

---

## Connecting maps

> *"Put a door at (10, 2) on map 1 that leads to map 2 at (10, 13), facing down."*

```json
{
  "mapId": 1,
  "x": 10, "y": 2,
  "targetMapId": 2,
  "targetX": 10, "targetY": 13,
  "direction": 2,
  "trigger": 0,
  "graphic": { "characterName": "!Door1", "direction": 2 }
}
```

`trigger: 0` is action-button — a door you press against, so give it a graphic.
`trigger: 1` is player-touch, for an invisible edge teleport; omit `graphic`
there. Both endpoints are validated as existing and in-bounds before anything
is written.

---

## Building a map from scratch

This is the workflow the server is really built around.

**1. Read the design rules first.**

> *"Load the map design guide."* — `get_map_design_guide`

**2. Create the map.** Size follows purpose:

```json
{ "name": "Willow Marsh", "purpose": "region", "tilesetId": 1 }
```

Omit `width`/`height` and the purpose picks them — `interior` 20×15,
`town` ~40×35, `dungeon` ~45×40, `overworld` ~100×90.

**3. Lay the ground.** `fill_region` with no `rect` fills the whole layer:

```json
{ "mapId": 12, "layer": 0, "tileId": 48 }
```

Layers by role: **0** ground/terrain, **1** detail and clutter, **2** overhead
(canopies and roofs the player walks *behind*).

**4. Shape the terrain.** This is where maps stop looking programmer-made.
For anything natural, use `blob` — never `region`:

```json
{
  "mapId": 12,
  "layer": 0,
  "autotileSlot": 1,
  "blob": { "cx": 30, "cy": 20, "rx": 9, "ry": 6, "irregularity": 0.5 }
}
```

For a river or a trail, use `path` with waypoints — it stays orthogonal, which
autotiles require:

```json
{
  "mapId": 12,
  "layer": 0,
  "autotileSlot": 3,
  "path": { "points": [[4, 30], [18, 26], [30, 27], [46, 22]], "width": 2 }
}
```

`region` exists, but it is for genuinely rectangular things — a stone floor, a
plaza. A rectangular pond is the classic tell of a generated map.

**5. Scatter detail.** `scatter_tiles` spreads clutter at a target density
across the whole map, with an optional focal gradient — rather than clumping it
in one corner.

**6. Look at it.** See below.

---

## Seeing what you built

> *"Render map 12 at 2× so I can see it."*

```json
{ "mapId": 12, "scale": 2 }
```

Writes `Data/.mcp-preview/map012.png` and returns the path — the model can then
open the image and check its own work, which is the point.

**Debug overlays:**

```json
{ "mapId": 12, "drawEvents": true, "passability": true, "scale": 2 }
```

`passability` tints blocked cells red and partially-blocked cells orange.
`drawEvents` draws each event's page-0 sprite and returns a legend.

**A crop, with the grid on:**

```json
{ "mapId": 12, "region": { "x": 0, "y": 0, "w": 12, "h": 12 }, "drawGrid": true }
```

This is a **layout preview, not a screenshot**: no overhead draw order, no fog,
panorama or weather, and autotile animation uses frame 0. Missing graphics are
reported in the result's `notes` and are never fatal.

---

## Validation before you ship

Two checks that catch things play-testing misses for hours:

> *"Check every asset reference in the project."* — `validate_assets`

Scans all data for referenced graphic and audio filenames and reports any with
no file on disk. A missing character graphic is silent until the moment that
event appears.

> *"Is every map reachable?"* — `validate_connectivity`

Builds the transfer graph and reports maps unreachable from the start map,
transfers pointing at a missing map or an out-of-bounds tile, and dead ends.

---

## XP is not MZ

Most RPG Maker material online is written for MV or MZ. If you or your model
carry those habits over, these are the ones that produce broken data:

| MV / MZ | RPG Maker XP |
|---|---|
| `MP` | **`SP`** — including command `312 = Change SP` |
| Actors have `traits`, `equips`, `nickname`, `profile`, `faceName` | None of these exist. XP uses a `parameters` Table, `weapon_id`, `armor1_id`–`armor4_id` |
| `maxLevel` | `final_level` |
| camelCase fields (`classId`, `initialLevel`) | snake_case (`class_id`, `initial_level`) |
| Damage formula strings | No formulas — `power` plus stat-influence rates; **negative power = healing** |
| Buff system | None. Use states |
| Plugin Command (`356`) | **Does not exist.** The command list ends at `355 = Script` |
| Vehicles (`202 = Set Vehicle Location`) | No vehicles. `202 = Set Event Location` |
| `205 = Set Movement Route` | `209 = Set Move Route`; `205` is Change Fog Color Tone |
| `104 = Select Item` | `104 = Change Text Options` |
| `249 = Play SE` | `249 = Play ME`; `250 = Play SE` |
| Game title in System data | Game title lives in `Game.ini` |
| Data as JSON | Data as Ruby 1.8 Marshal `.rxdata` |

When in doubt, check [`research/event-commands.md`](research/event-commands.md)
— it was extracted from XP's own Interpreter scripts, not transcribed from
another engine.

---

## Troubleshooting

**"Invalid project path" / no tools appear**
`RPGMAKER_PROJECT_PATH` must point at the folder containing `Game.rxproj` and
`Data/`, not at `Data/` itself and not at the `.rxproj` file. Restart the client
after changing it.

**File permission errors on write**
The RPG Maker XP editor is open. Close it.

**Changes vanished**
The editor was open and re-saved over them. Recover from
`Data/.mcp-backup/` — remembering that it holds only the state before the
current session's first write.

**Map renders but tiles are missing or wrong**
The tileset graphic was not found. Check the result's `notes`, and set
`RPGMAKER_RTP_PATH` if your RTP is not at the Steam default.

**A healing skill deals damage**
That was the upstream Marshal decoder bug this project vendors a fix for. If
you see it, you are running a build without the fix — see
[`research/REPORT.md`](research/REPORT.md).

**The model keeps inventing MZ field names**
Point it at the [XP is not MZ](#xp-is-not-mz) table above, or ask it to read
the tool schema before calling.
