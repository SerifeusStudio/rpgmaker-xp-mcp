# RPG Maker XP MCP — research report (June 2026)

What XP's `.rxdata` format and engine actually do, and how each finding was
established. Four independent sources: (a) the official RGSS1 reference from
`RPGXP.chm`, (b) the default engine scripts extracted from the install's
template `Scripts.rxdata`, (c) byte-level inspection of the template database,
and (d) a survey of 22 existing tools and references (rvpacker,
rvpacker-txt-rs, rmxp-plugin-system, RGSS reference mirrors, RM community
forums).

Nothing below rests on a single source. Every claim in **Verified facts** was
cross-checked against at least two of the four, and where possible confirmed
by round-tripping real data. Anything that survived only one source is in
**Not confirmed** at the bottom instead.

## Verified facts (high confidence)

### Marshal / binary formats
- **Negative multibyte Fixnum bug (found here, byte-verified):**
  `@hyrious/marshal` ≤ 0.3.3 mis-decodes Ruby Marshal negative multibyte
  integers (`[0xff, 0x6a]` = −150 decoded as +106). Every default-database
  healing skill (power −150/−300) hit this; saves would have silently
  flipped heals into damage. Fixed in our vendored copy
  (`src/vendor/marshal/load.ts`); regression-tested.
- **Table `_dump`**: five uint32 LE (dim, x, y, z, items=x·y·z) then int16
  data. Confirmed by rvpacker source (`unpack('L5 S*')`) and byte-identical
  round-trips of all 15 template files. We read data as *signed* int16
  (animation `cell_data` uses −1 for empty cells).
- **Color/Tone `_dump`**: exactly 32 bytes — four float64 LE (r,g,b,a).
  Confirmed by rvpacker (`pack('D4')`).
- **Scripts.rxdata**: array of `[magic_int, title, zlib-deflated source]`
  triples. Per-script magic numbers are disregarded by the editor (rvpacker
  README); safe to renumber. Inflate per script; deflate (level 9) to save.
  Important: script titles/code must be handled as *binary* strings, not
  put through the generic UTF-8 string path.
- **Ruby 1.8 string compat**: strings must be dumped as raw byte strings
  (no 1.9-style `:E` encoding ivar). We encode all strings to UTF-8 bytes.

### Engine semantics (from the default engine scripts)
- **Skill damage** (`Game_Battler 3#skill_effect`):
  `power_eff = power + ATK·atk_f/100` (if > 0, minus `PDEF·pdef_f/200 + MDEF·mdef_f/200`, floor 0);
  `rate = 20 + STR·str_f/100 + DEX·dex_f/100 + AGI·agi_f/100 + INT·int_f/100`;
  `damage = power_eff · rate / 20`, then element correction, guard halving,
  ± variance (two rand rolls). **Negative power = healing** (skips defense
  reduction; cannot be evaded). `atk_f > 0` additionally multiplies hit by
  user hit-rate and triggers shock state removal — it is the "physical" marker.
- **Default-DB conventions**: magic nuke (Fire): power 140, int_f 100,
  mdef_f 100, variance 15, occasion 1. Physical (Cross Cut): power 20,
  atk_f 100, str_f 100, pdef_f 100, mdef_f 0, int_f 0. Heals: power −150/−300,
  int_f 50, variance 15, occasion 0, scope 3/4.
- **Event command codes**: complete table in `research/event-commands.md`
  (110 codes extracted from the Interpreter dispatch).

### Editor data-model facts (official reference, cross-checked)
- `RPG::Skill` defaults are asymmetric: int_f=100 and mdef_f=100, all other
  F-ratings 0; hit=100, variance=15, occasion=1, scope=0, menu_se volume 80.
- `RPG::Actor`: parameters is Table[6,100] (kind 0..5 = MaxHP, MaxSP, STR,
  DEX, AGI, INT); default curve `500+level*50` / `50+level*5`;
  exp_basis/exp_inflation both default 30, **valid range 10..50**.
- `RPG::System#magic_number` is a save-revision marker the editor
  regenerates on every save; the runtime compares it against the value
  stored in save files to decide whether to refresh map data. Tools that
  modify map data should bump it so stale saves reload the map.
- `RPG::System#edit_map_id` is editor-internal ("map currently being
  edited"); preserve it, don't expose as gameplay data.

### Event list invariants (engine source, cross-checked)
- Every command list ends with terminator `{code: 0, indent: 0, parameters: []}`.
- `indent` starts at 0 and increases by exactly 1 inside each branch
  (conditional 111/411/412-style blocks, choice branches, etc.).
- **XP-specific**: Show Text code 101 carries the *first* text line in
  `parameters[0]`; codes 401 carry continuation lines (later engines put
  all text in 401s — XP differs). Message window shows 4 lines per box.
- Choices: code 102 carries the choices array `[[texts...], cancel_type]`;
  each 402 branch redundantly repeats its choice text and must be kept in
  sync with the 102 array.
- Move routes: code 209 (Set Move Route) with 509 continuation entries
  (XP uses 209; VX/Ace renumbered it).

## Not confirmed
- rvpacker's `12345678`/`87654321` magic-number sentinel behaviour, and some
  of its event-command details, appear in only one source and could not be
  reproduced against the engine scripts or the official reference. Recorded
  here as lore; deliberately not relied on in code.

## QoL features implemented from this research
1. Automatic one-time-per-session backups (`Data/.mcp-backup/`) before any write.
2. `magic_number` bump on map/event writes (mirrors editor save behavior).
3. Event command list normalization (terminator guaranteed, indent/params defaulted).
4. `add_show_text` helper that splits text into 101/401 groups, 4 lines per box.
5. Scripts.rxdata support (list/get/update/create) with zlib + binary-safe strings.
6. Read access to the remaining database files (Classes/States/Enemies/
   Troops/CommonEvents/Tilesets) and a generic `update_database_entry`.
7. Healing/damage helpers calibrated to default-DB conventions with the
   real damage formula documented in the tool schemas.

## Primary sources
- RPGXP.chm (official RGSS1 reference, from a local RMXP install) →
  distilled into `research/rgss-definitions.md`
- The default engine scripts, extracted from a local install's template
  `Scripts.rxdata` with `extract_scripts.mjs`. **Not included in this repo** —
  they are Enterbrain's and are not ours to redistribute. Run the script
  against your own install to reproduce them.
- https://github.com/Solistra/rvpacker (Table/Color/Tone/Scripts formats)
- https://github.com/RPG-Maker-Translation-Tools/rvpacker-txt-rs-lib (XP 101 text, 102/402 sync)
- https://enls.gitbook.io/rgss-reference-manual/ (magic_number, edit_map_id)
- https://www.rpg-maker.fr/dl/monos/aide/xp/ (RGSS1 reference mirror)
