# Writing for RPG Maker XP — particularities & using the MCP as governance

RPG Maker XP (RGSS1, 2004) authors very differently from later RPG Makers (VX/MV/MZ)
and from general game engines. The same properties that make XP compact and moddable
also make a project easy to **drift** — into structural inconsistency, silent
corruption, or non-canonical data — when many hands (designers *and* LLMs) edit it
over time.

This document does two things:
1. Captures the particularities of authoring for XP — the things you must get right.
2. Shows how the `rpgmaker-xp` MCP acts as a **governance layer**: a single,
   invariant-enforcing path for changes, so the project stays canonical no matter
   who or what is editing.

> Scope/provenance: this is original engineering documentation derived from our own
> byte-level round-trip testing, the engine's own damage math, and the official
> reference — **summarized, not reproduced**. The RPG Maker XP engine, its RTP
> assets, default scripts, and help file are © Enterbrain / Gotcha Gotcha Games and
> are not included here.

---

## The governance idea in one paragraph

XP stores data as opaque binary that the editor rewrites wholesale on save. There is
no schema validation, no referential integrity, and no merge story. Left alone, edits
accumulate small deviations from "what the editor would have produced," and those
deviations surface later as corruption or runtime bugs. The MCP fixes this by being
the **only sanctioned mutation path**: every write goes through one correct codec,
gets normalized to the editor's invariants, mirrors the editor's save side-effects,
and can be validated and visually verified. Treat the MCP's tools as the project's
contract — drift becomes something the system prevents, not something you police.

---

## 1. The substrate is Ruby Marshal, not JSON

XP data files (`Data/*.rxdata`) are **Ruby 1.8 Marshal** dumps — binary, with
class-tagged objects, interned symbols, `Table`/`Color`/`Tone` packed via custom
`_dump`, and **byte-oriented strings with no encoding metadata** (Ruby 1.8 predates
string encodings). This is unlike MV/MZ, which use plain JSON.

- **Drift risk:** any tool that mishandles the binary corrupts it. A real example we
  found and fixed: a Marshal decoder that mis-signed negative multibyte integers
  silently flipped every healing skill (power −150) into damage on save. Writing a
  Ruby-1.9-style string (with an encoding ivar) can make the data fail to load.
- **MCP governance:** the MCP owns a single, **byte-verified** codec (vendored, with
  the decoder bug fixed and a byte-identical round-trip regression test over real
  editor files). All strings are written as raw UTF-8 bytes. You never hand-edit
  `.rxdata`; every change is re-serialized correctly by one component.

## 2. The editor is authoritative-on-save (the coexistence rule)

The editor reads data only when it opens a project, holds everything in memory, and
**rewrites every data file from memory on save** — clobbering any external change.

- **Drift risk:** edit while the editor is open → your change is overwritten on the
  next save. Edit map data without updating the save-revision marker → players' existing
  save files keep the *stale* map.
- **MCP governance:** one human discipline — **close the editor while the MCP writes** —
  plus two automatic behaviors: a one-time-per-session backup to `Data/.mcp-backup/`
  before the first write to each file, and a bump of `System.magic_number` on map
  edits so existing saves reload the changed map (mirroring the editor's own save
  side-effect). Single-writer, side-effect-faithful.

## 3. Events: command-list invariants (the largest drift surface)

Event logic is a flat list of command records (`code`, `indent`, `parameters`). It is
the most structurally demanding thing to author, and where LLM/hand authoring drifts
most. The rules:

- Every command list **ends with a terminator** `{code: 0, indent: 0, parameters: []}`.
- `indent` starts at 0 and **increases by exactly 1** inside each branch block.
- **XP-specific quirk:** Show Text code `101` carries the *first* line of a message box
  in `parameters[0]`; codes `401` carry continuation lines (later engines put *all*
  text in `401`s — XP differs). A box shows 4 lines.
- Choices are stored **redundantly**: code `102` holds `[[choice texts…], cancel_type]`,
  and each `402` branch repeats its own choice text — the two must stay in sync.
- Move routes use code `209` with `509` continuations (renumbered in VX/Ace).
- **Drift risk:** a missing terminator, wrong indentation, or desynced choice text
  corrupts the event in the editor or breaks it at runtime — and it's invisible until
  then.
- **MCP governance:** the MCP **normalizes every command list on save** — guarantees the
  terminator, defaults `code`/`indent`/`parameters`. Higher-level helpers emit correct
  structure (e.g. message text is auto-split into 101/401 groups, 4 lines per box). The
  malformed states are not representable through the sanctioned path.

## 4. Battle math is power + influence-rates, not formulas

XP has **no damage-formula strings** (unlike MZ's `a.atk * 4 - b.def`). A skill has a
numeric `power` plus per-stat influence rates (`atk_f`, `str_f`, `int_f`, `pdef_f`,
`mdef_f`…); the engine computes damage. Consequences that trip up authors coming from
later engines:

- **Negative `power` = healing** (it skips defense reduction and cannot miss).
- `atk_f > 0` is the "physical" marker (multiplies the hit roll by the user's hit-rate,
  triggers shock-state removal).
- **There is no buff system** — temporary stat changes are done with **states** that
  carry `*_rate` multipliers.
- `power` is *not* final damage: stat influence multiplies it (with the default INT and
  `int_f`, real damage is several× the stated power).
- **Drift risk:** importing MZ habits (formulas, MP, buff skills) yields content that is
  wrong or inert; zero-filling influence rates produces skills that don't behave like the
  editor's.
- **MCP governance:** the skill creators encode the correct model — they mirror the
  editor's **asymmetric defaults** (`int_f`/`mdef_f` = 100, others 0; `hit` 100;
  `variance` 15), express healing as negative power, and there is deliberately **no
  `create_buff`** tool (states only). The tool surface teaches the correct mental model.

## 5. Database defaults must match the editor's constructors

Across the database, "empty" is not "zero." The editor's object constructors set specific
non-obvious defaults, and arrays are **dense with index 0 = nil** (the id equals the array
index); maps like events and `MapInfos` are hashes keyed by **integer** ids.

- Examples: skill F-ratings are asymmetric (above); actor growth curves and the
  `exp_basis`/`exp_inflation` range are fixed; armor slots are typed
  (shield/helmet/body/accessory).
- **Drift risk:** guessed or zero-filled defaults drift from editor-native and accumulate
  subtle inconsistencies that are hard to trace later.
- **MCP governance:** every `create_*` uses the editor's constructor defaults and allocates
  ids densely. The MCP is the single source of canonical defaults — new content is
  indistinguishable from editor-made content.

## 6. Asset references are unvalidated filename strings

Graphics and audio are referenced by **bare filename** (no extension, no path), resolved
against the project's `Graphics/`/`Audio/` and then the shared RTP. Nothing validates that
the file exists.

- **Drift risk:** a rename, typo, or missing file is **silent until runtime** (a blank
  sprite, a crash, a missing tileset).
- **MCP governance:** `validate_assets` scans every referenced filename across all data
  files (tilesets, autotiles, panoramas, fogs, battlebacks, character/battler/icon
  graphics, animations, UI graphics, BGM/BGS/ME, and map event sprites) against disk and
  reports the broken ones. Referential drift is caught before it ships.

## 7. The tile model: three layers, baked autotiles, encoded ids

A map's tiles are a `Table[width, height, 3]` of tile ids: **0** = empty, **48–383** =
autotiles (`slot = id/48 - 1`, `variant = id % 48`), **≥ 384** = regular tileset tiles
(`col = (id-384) % 8`, `row = (id-384) / 8`). Crucially, **autotile edge shapes are baked
into the stored id at author time** — the runtime does not recompute them.

- **Drift risk:** invalid ids, wrong layer usage, or incorrect autotile variants produce
  broken-looking maps that are **invisible without opening the editor**.
- **MCP governance:** the tile tools enforce correct x-major indexing and dimensions, and
  **`render_map` closes the visual loop** — you (or an LLM) render the map to a PNG and
  *see* the result instead of trusting raw ids. Visual drift is observed, not guessed.

## 8. Scripts are RGSS1 / Ruby 1.8

`Scripts.rxdata` is an array of `[magic_int, title, zlib-deflated source]`. Per-script
magic numbers are ignored by the editor; order is the array order; custom scripts go just
above `Main` by convention. The deflated source is binary and **must not pass through a
UTF-8 string cycle**. The language is Ruby **1.8** (no `require_relative`, no 1.9 hash
syntax, byte-oriented strings, no Fiber).

- **Drift risk:** UTF-8 mangling of script bytes corrupts them; 1.9-only Ruby silently
  won't run under RGSS1; careless insertion clobbers load order.
- **MCP governance:** the MCP handles scripts on a separate **binary-safe** path (never the
  generic UTF-8 conversion) and inserts new scripts above `Main` by convention.

---

## Governance at a glance

| XP particularity | Drift it invites | MCP guardrail |
|---|---|---|
| Marshal binary, byte-strings | Corruption, encoding failure, sign bugs | One byte-verified codec; round-trip tested; raw-UTF-8 strings |
| Editor rewrites on save | Clobbered edits, stale saves | Close-editor rule; auto-backup; `magic_number` bump |
| Event command invariants | Missing terminator / bad indent / desynced choices | Normalize-on-save; structure-correct helpers |
| Power + rates (no formulas) | MZ habits → wrong/inert skills | Canonical creators; healing-as-negative-power; no buff tool |
| Editor-specific defaults | Zero-filled drift from canonical | `create_*` use editor constructors; dense ids |
| Unvalidated asset names | Silent missing graphics/audio | `validate_assets` vs disk + RTP |
| Baked autotiles, 3 layers | Invalid/ugly maps, invisible | Indexing/dimension checks; `render_map` visual loop |
| Ruby 1.8 / zlib scripts | Byte mangling; 1.9-only code | Binary-safe script path; above-`Main` convention |

## The five governance principles

1. **Single writer** — the MCP is the only sanctioned mutation path; hand-edits bypass the
   guarantees.
2. **Canonical defaults** — new content matches the editor's constructors exactly.
3. **Normalize on save** — structural invariants (terminators, indent, ids) are enforced at
   write time, not hoped for.
4. **Validate before ship** — referential and structural checks (`validate_assets`, and the
   project linter as it lands) catch drift early.
5. **Close the loop** — render/preview so visual and behavioral correctness are *observed*,
   not assumed.

## Using it in practice

- Author through the tools, never by hand-editing `.rxdata`. The guarantees above only hold
  on the sanctioned path.
- Keep the RPG Maker XP editor closed while the MCP writes; reopen it to review.
- Before publishing a build, run `validate_assets` (and the project linter once available),
  and render changed maps to verify them visually.
- For teams and for LLM-driven authoring, treat the MCP as the contract: the invariants are
  enforced regardless of who or what is making the change, which is exactly what keeps a
  long-lived, many-hands project from drifting.
