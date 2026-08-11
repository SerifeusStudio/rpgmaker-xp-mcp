# Third-Party Notices

The project's own code and docs are MIT-licensed (see `LICENSE`). The components
below are **not** covered by that license — each retains its own copyright and
terms. This file is the attribution ledger; `CONTENT-SOURCES.md` has fuller
provenance and licensing verdicts for scripts/assets.

## Project lineage

This project is a fork of **k4zuki0539/-rpgmaker-mz-mcp** (RPG Maker MZ MCP
Server), which was released under the MIT license. That MIT grant and the
original author's copyright carry forward into this fork (see `LICENSE`); the
fork re-targets the tool from RPG Maker MZ (JSON) to RPG Maker XP (RGSS1
`.rxdata`) and adds new tooling.

## Bundled in this repository

| Path | Origin | License | Notes |
|---|---|---|---|
| `src/vendor/marshal/` | Derived from [`@hyrious/marshal`](https://github.com/hyrious/marshal) | MIT (© hyrious) | Vendored and bug-fixed (negative-Fixnum decode); fix documented in `load.ts`. MIT notice retained. |

## Referenced but NOT redistributed here

These are used at runtime from the user's own install, or pulled separately —
their bytes are intentionally **not** committed to this repo.

| Component | Origin | Terms | How it's used |
|---|---|---|---|
| RPG Maker XP engine, RTP graphics/audio, default RGSS scripts, `RPGXP.chm` help | © Enterbrain / Gotcha Gotcha Games | Proprietary; licensed to RMXP owners for use *in games made with the engine*, not for standalone redistribution | The MCP reads the **user's own** installed `Data/` and RTP at runtime. Raw engine artifacts (decompiled help, default scripts) are kept only on the author's machine for research and are **excluded from distribution**. Only original summaries (`research/rgss-definitions.md`, `research/event-commands.md`, `research/REPORT.md`) — factual API references, not verbatim text — are included. |
| `library/BerndHagen-Script-Library` | github.com/BerndHagen/RPG-Maker-XP-Script-Library | MIT | Optional QoL scripts; referenced via submodule / re-clone, not vendored. |
| `library/Valentine90-ABS` | github.com/Valentine90/abs-rpg-maker | MIT | Action battle system; referenced, not vendored. |
| `library/FL-FLUtil` | github.com/FL-/RMXP-FLUtil | MIT-0 | Utility library; referenced, not vendored. |
| Community RGSS1 scripts catalogued in `CONTENT-SOURCES.md` | Various authors / forums | Per-author terms (often free non-commercial + credit) | Catalogued for reference; verify each script's terms before bundling into a game. |

## If you redistribute or build a game with this tool

- Keep this file and `LICENSE` with the source.
- You must own RPG Maker XP to legally use its RTP/engine assets, and credit
  any community script/asset authors per their terms (see `CONTENT-SOURCES.md`).
- Do not redistribute Enterbrain's engine, RTP, default scripts, or help file.
