# RPG Maker XP / RGSS1 — collected engineering wisdom

Everything learned building and hardening the `rpgmaker-xp` MCP server
(June 2026). Sources: the official RGSS1 reference from `RPGXP.chm`, the
default engine scripts decompressed from a local install's template
`Scripts.rxdata`, byte-level inspection of the template database, and a
survey of 22 existing tools and references. How each finding was established
is set out in [`research/REPORT.md`](research/REPORT.md).

---

## 1. The Marshal layer (.rxdata)

RPG Maker XP data files are single Ruby **1.8** Marshal dumps (format
version 4.8). This drives everything below.

### The string-encoding trap
Ruby 1.9+ marshals strings with an `:E` (encoding) instance variable.
Ruby 1.8 has no string encodings — loading a 1.9-style string into RMXP's
RGSS104E **fails or corrupts**. Rule: **always dump strings as raw byte
strings** (in JS: `Uint8Array` of UTF-8 bytes, never JS `string`, which
`@hyrious/marshal` dumps with the `:E` ivar). XP data content is UTF-8 in
practice, so decoding with UTF-8 on load is safe — except Scripts (see §6).

### The negative-Fixnum bug (found here, byte-verified)
`@hyrious/marshal` ≤ 0.3.3 mis-decodes Marshal's negative multibyte
integer form: `[0xff, 0x6a]` means −150 (unsigned LE bytes minus 2^(8n)),
but upstream sign-extends from the top bit of the read bytes and returns
+106. **Every value in −57086..−124 loads wrong.** In XP data that's every
healing skill (negative `power`: Heal −150, Greater/Mass Heal −300) — a
save after loading would silently flip heals into damage skills. Fixed in
the vendored copy `src/vendor/marshal/load.ts`. Single-byte negatives
(−123..−1) were never affected, which is why it hid so well.

Detection story worth remembering: the only symptom was Skills.rxdata
round-tripping **one byte shorter** (re-encoding 106 takes 1 byte; −150
takes 2). A byte-identical round-trip test catches whole bug classes that
semantic JSON comparison cannot — both sides of a JSON compare pass
through the same buggy decoder.

### Binary `_dump` class formats (verified vs rvpacker source + round-trip)
- **Table**: 5 × uint32 LE — `dim, xsize, ysize, zsize, items` (items must
  equal x·y·z) — then `items` × **int16 LE**. Read signed: animation
  `cell_data` uses −1 for empty cells. Index layout is x-major:
  `data[x + y*xsize + z*xsize*ysize]`.
- **Color / Tone**: exactly 32 bytes — 4 × float64 LE (r, g, b, a/gray).

### File inventory (`Data/`)
| File | Root object |
|---|---|
| Actors/Classes/Skills/Items/Weapons/Armors/Enemies/Troops/States/Animations/Tilesets/CommonEvents.rxdata | Array, index 0 = nil, entries are `RPG::*` objects |
| MapInfos.rxdata | Hash int→`RPG::MapInfo` |
| Map001.rxdata … | `RPG::Map` (events = Hash int→`RPG::Event`) |
| System.rxdata | `RPG::System` |
| Scripts.rxdata | Array of `[magic_int, title, zlib-deflated source]` |

Other format notes: Ruby Marshal interns symbols and back-references
objects (symlink/link records); independent JS objects re-dump without
shared links, which is fine. Hash keys in XP data are always integers.

---

## 2. Data-model facts that aren't obvious

- The **game title is in `Game.ini`** (`Title=`), not System.rxdata.
  `Game.ini` is ANSI — read/write latin1 to avoid mangling.
- `System.magic_number` is a **save-revision marker**, not a checksum. The
  editor regenerates it on every save; the runtime compares it against the
  copy stored in save files to decide whether to reload map data. A tool
  that edits maps should bump it, or players' existing saves keep the
  stale map.
- `System.edit_map_id` is editor-internal (map currently open). Preserve
  it; don't expose.
- Actor `parameters` is `Table[6,100]`: kind 0..5 = MaxHP, MaxSP, STR,
  DEX, AGI, INT; index `[kind, level]`. Editor default curve:
  HP/SP = `500 + level*50`, stats = `50 + level*5`.
- `exp_basis` / `exp_inflation` are both clamped to **10..50** by the
  editor (defaults 30/30).
- Skill defaults are **asymmetric**: `int_f=100`, `mdef_f=100`, all other
  F-ratings 0; `hit=100`, `variance=15`, `occasion=1`, `menu_se` volume 80.
  Zero-filling all F-ratings does not match the editor.
- Equipment slots are fixed: weapon + armor1 (shield), armor2 (helmet),
  armor3 (body), armor4 (accessory). Armor `kind`: 0=shield, 1=helmet,
  2=body, 3=accessory.
- Scope enum (skills/items): 0 none, 1 one enemy, 2 all enemies, 3 one
  ally, 4 all allies, 5 one ally HP0, 6 all allies HP0, 7 user.
  Occasion: 0 always, 1 battle only, 2 menu only, 3 never.
- Official RGSS class definitions with all defaults:
  `research/rgss-definitions.md`.

---

## 3. Battle math (from `Game_Battler 3#skill_effect`, the actual engine)

```
power_eff = skill.power + user.atk * atk_f/100
if power_eff > 0:
    power_eff -= target.pdef * pdef_f/200 + target.mdef * mdef_f/200
    power_eff = max(power_eff, 0)
rate   = 20 + str*str_f/100 + dex*dex_f/100 + agi*agi_f/100 + int*int_f/100
damage = power_eff * rate / 20
damage = damage * elements_correct / 100        # weakest rank among element_set
damage /= 2 if target guarding (damage > 0)
damage ±= variance (two rand rolls, amp = |damage|*variance/100, min 1)
```

Key consequences:
- **Negative power = healing.** Heals skip the defense reduction and
  cannot be evaded (`hit=100` when damage < 0).
- **`atk_f > 0` is the "physical" switch**: it multiplies the first hit
  roll by the user's hit rate and triggers shock-state removal.
- The stat `rate` multiplies stated power: with the template's INT 50 and
  `int_f` 100, real damage ≈ 3.5× power. Don't read `power` as final damage.
- Second hit roll (evasion): `eva = 8*agi_target/dex_user + target.eva`,
  scaled by the skill's `eva_f`.
- Default-DB stat profiles to imitate:
  - Magic nuke (Fire): power 140, sp 75, int_f 100, mdef_f 100, variance 15
  - Physical (Cross Cut): power 20, atk_f 100, str_f 100, pdef_f 100, mdef_f 0, int_f 0
  - Heal: power −150, sp 80, int_f 50, occasion 0, scope 3
- XP has **no buff system** — temporary stat changes are done with states
  (`*_rate` multipliers on `RPG::State`).

---

## 4. Event system invariants

- Every command list **ends with the terminator**
  `{code: 0, indent: 0, parameters: []}` — the default-constructed
  `RPG::EventCommand`. Pages, common events, and troop pages all follow this.
- `indent` starts at 0 and **increases by exactly 1** inside each branch
  block (111 conditional, 102 choices, 112 loop, 301 battle results).
- **XP quirk**: Show Text code **101 carries the first text line** in
  `parameters[0]`; codes 401 carry continuation lines. (VX and later put
  all text in 401s — translation tools special-case XP for this.) Message
  window shows 4 lines per box.
- **Choices are stored redundantly**: code 102 has
  `[[choice texts...], cancel_type]` and each 402 branch repeats its own
  choice text — keep them in sync when editing.
- Move routes: code **209** (Set Move Route) with **509** continuation
  entries (VX+ renumbered to 205). The route itself is an `RPG::MoveRoute`
  whose list ends with a code-0 `RPG::MoveCommand`.
- Battle results: 301 followed by 601 (win) / 602 (escape) / 603 (lose) /
  604 (end) blocks.
- Complete 110-code table extracted from the Interpreter:
  `research/event-commands.md`.
- Page triggers: 0 action button, 1 player touch, 2 event touch,
  3 autorun, 4 parallel. Self switches are "A".."D" per (map, event).

---

## 5. Coexisting with the editor

- **The editor must be closed while writing.** On save it rewrites every
  data file from memory, clobbering external changes; conversely it only
  reads at project-open.
- The editor regenerates `magic_number` and rewrites `edit_map_id` on save
  — never rely on either surviving.
- Tileset passability (`passages` Table, 384 entries per tileset page):
  0 = passable, bits 1/2/4/8 = down/left/right/up blocked, 15 = impassable,
  +64 bush flag, +128 counter flag. `priorities[0]` defaults to 5.
- A minimal valid project = `Game.rxproj` (content `RPGXP 1.04`),
  `Game.ini`, `Data/` (the 15 rxdata files), plus `Game.exe`/`RGSS104E.dll`
  to run. The Steam install's `System\Data\` is the pristine new-project
  template — ideal read-only test fixture.

---

## 6. Scripts.rxdata

- Array of `[magic_int, title, zlib-deflated Ruby source]`.
- **Per-script magic numbers don't matter** — the editor disregards them
  (rvpacker renumbers them wholesale with no ill effect). Order is the
  array order.
- Custom scripts go **just above `Main`** by community convention.
- **Binary-safety rule**: deflated source must never pass through a UTF-8
  string decode/encode cycle — handle Scripts with a raw (binary-string)
  Marshal path, separate from the generic UTF-8 conversion used for the
  other 14 files. Deflate level 9 on save (matches community tools).

---

## 7. Tool-design lessons (transferable)

1. **Byte-identical round-trip is the gold-standard test.** Re-encode real
   editor-produced files and compare bytes, not JSON — it caught a
   data-corrupting decoder bug that semantic comparison was structurally
   blind to.
2. **Mine local ground truth before the web**: the install's CHM held the
   complete official reference; `Scripts.rxdata` held the actual engine
   math. Both beat any forum post.
3. **Vendor small dependencies you've had to fix** (`src/vendor/marshal/`,
   MIT, with the fix documented in-file) rather than patching node_modules.
4. Back up before first write per session (`Data/.mcp-backup/`), normalize
   invariants on save (terminators), and mirror editor side-effects
   (magic_number) so external edits behave like editor saves.
5. Defaults should mirror the editor's constructors exactly — they're all
   in the CHM `Definition` blocks (`research/rgss-definitions.md`).

---

## 8. Artifact map

| Path | Contents |
|---|---|
| `research/REPORT.md` | Verified-claims research report with citations |
| `research/rgss-definitions.md` | Official class defaults (from RPGXP.chm) |
| `research/event-commands.md` | 110 event command codes (from Interpreter) |
| `research/scripts/` | Decompiled default RGSS scripts (damage algorithm: `009-Game_Battler 3.rb`) — **local-only, © Enterbrain, excluded from distribution** (see THIRD-PARTY-NOTICES.md) |
| `research/chm/` | Raw decompiled help file — **local-only, © Enterbrain, excluded from distribution**; derived summaries (`rgss-definitions.md`, `event-commands.md`) are what ship |
| `src/vendor/marshal/` | Bug-fixed Marshal codec (fix in `load.ts` header) |
| `test/roundtrip.mjs` | Byte-identity + negative-Fixnum regression |
| `test/tools.mjs` | 30 end-to-end tool tests on a scratch project |
| `test/server-smoke.mjs` | MCP stdio handshake + live calls |
