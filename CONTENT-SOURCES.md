# RPG Maker XP content sources — curated catalog (June 2026)

XP "plugins" are **RGSS1 Ruby scripts** (not MV/MZ JS plugins). This catalog
covers where to get scripts and assets, with licensing verdicts. Compiled
from a three-agent web research pass; full details in the conversation that
produced it. Local ready-to-use copies live in `library/`.

> ⚠ **Engine-version trap**: many "RGSS" repos/scripts are RGSS3 (VX Ace)
> and will NOT run in XP. Always confirm RGSS1/XP before installing.

---

## Tier 1 — clean-license scripts (cloned into `library/`)

| Local folder | Source | License | Contents |
|---|---|---|---|
| `library/BerndHagen-Script-Library` | github.com/BerndHagen/RPG-Maker-XP-Script-Library | MIT | 11 drop-in systems: player jump, party HUD, BGM player menu, typewriter messages, enhanced menu windows, visual timer, grid save screen, horizontal title, transparent menus, bestiary, item popups |
| `library/Valentine90-ABS` | github.com/Valentine90/abs-rpg-maker | MIT | Complete real-time action battle system v2.0 (HUD, hotbar, ranged, AoE, status timers); EN+PT manuals |
| `library/FL-FLUtil` | github.com/FL-/RMXP-FLUtil | MIT-0 (no attribution needed) | MACL-style utility library (random helpers, tweener, aliasing helpers, misc utils) |

Install path: read the `.rb` file → `create_script` (inserts above Main).
Multi-file systems (Valentine90 ABS): install files in the repo's listed
order, each as its own script entry.

**Also clean but not cloned**: RyanBernX/RGSS1-Scripts (GPL-3 — fine for
free games, awkward for closed commercial), 20kdc/reimagined-pancake (CC0,
tiny), mkxp-z (GPL engine replacement — doesn't infect game code).

## Tier 2 — usable with per-script checking

- **JaidenAlemni/rmxp-scripts** — good modern XP scripts, but custom per-script
  license tiers (some non-commercial only); `[RUBY3]` tagged ones need mkxp-z.
- **vico93/rmxp_scripts** — archive of lost classics incl. some Moghunter XP;
  third-party redistribution, per-script terms.
- **wachunga/rmxp-multiple-message-windows** — the classic multi-message-window
  script; no license file (historically free-use).
- **Moghunter / mogplugins.com** (XP section) + full mirror at
  archive.org/details/moghunter — **commercial OK with credit**, the most
  generous of the classic authors.

## Classic script archives (forum-era, alive June 2026)

| Archive | URL | Notes |
|---|---|---|
| **Save-Point** | save-point.org | THE living archive: 675+ archived XP scripts index (thread-7400) incl. 800+ rescued from HBGames in 2025. Per-author terms, mostly non-commercial+credit. |
| **Chaos Project** | forum.chaos-project.com | 550-topic XP script database. Blizz-ABS 2.87, Tons of Add-ons 7.71, Stormtronics CMS. Blizzard's terms: free non-commercial + credit; commercial needs permission. |
| **gdu.one** | gdu.one/forums/files/category/45-rgssrmxp-scripts/ | Read-only archive with 35 actual downloadable script/demo files (e.g. Mr.Mo's ABS 4.5). Old gdunlimited.net domain is squatted — don't use it. |
| **rpgmaker.net** | rpgmaker.net/scripts/rmxp/ | ~80 curated XP scripts, license stated per page. |
| **rpg-maker.fr** | rpg-maker.fr (scripts section) | 193 XP scripts (French mirrors of classics). |
| **RMRK** | rmrk.net (board 111) | XAS Hero Edition canon thread, Heretic's Collection. End-of-life announced — archive what you need. |
| **HBGames** | afar.ws (old hbgames.org domain is squatted!) | Original RMXP.org community; corpus largely mirrored to Save-Point. |
| **mogplugins.com** | mogplugins.com | Moghunter's successor site, XP download section. |

### ⚠ Urgent preservation deadlines
- **forums.rpgmakerweb.com closes Dec 11, 2026 — read-only from June 18, 2026
  (days away), NO public archive.** Hosts ccoa's UMS and the Sithjester asset
  mirror. Save anything needed from it immediately.
- RMRK has announced end-of-life; gdu.one is already frozen.

## The canon — essential classic XP scripts and where they live

1. **SDK 2.4** — save-point.org/thread-2361.html (many 2006-era scripts require it)
2. **MACL 2.4** — forum.chaos-project.com topic 14547
3. **Blizz-ABS 2.87** (action battle) — chaos-project topic 106
4. **Tons of Add-ons 7.71** — Chaos Project script database
5. **XAS Hero Edition** (Zelda-style ABS) — rmrk.net topic 40237 + xasabs.wordpress.com
6. **ccoa's UMS** (message system) — forums.rpgmakerweb thread 165943 (**closing!**) / Save-Point
7. **RTAB + Cogwheel bars** (ATB) — save-point.org/thread-2660.html
8. **Mr.Mo's ABS 4.5** — gdu.one file 75 (direct download)
9. **AnimBat Animated Battlers** (side-view) — save-point.org/thread-2566.html
10. **f0tz!baerchen AntiLag 0.71** — gamingroom.net mirror
11. **Heretic's Collection** (curated compatible mega-pack) — rmrk.net topic 48400
12. **Guillaume777 Multi-Slot Equipment** — afar.ws / Save-Point
13. **Near Fantastica's Particle Engine** — Save-Point archive index

**Avoid as a base**: Pokémon Essentials and PSDK — biggest public RMXP
codebases but Nintendo-IP derived (DMCA'd 2023). Read for techniques only.

---

## Assets (graphics / audio)

### Graphics — XP formats: 32×32 tiles (tall single PNG), 4-dir/4-frame charsets, static battlers, 192×128 windowskins, 24×24 icons

| Source | License verdict |
|---|---|
| **Official RTP** (rpgmakerweb.com/run-time-package) | ✅ commercial OK **if you own XP** (Steam copy counts); RM-engines only, never portable elsewhere |
| **Sonetto Commons** XP-style tiles (OpenGameArt, "Exterior 32x32 Town Tileset") | ✅ CC-BY-SA, no engine lock — cleanest XP-style replacement |
| **Pipoya FREE RPG Tileset 32×32** (pipoya.itch.io) | ✅ commercial OK, credit optional, no engine lock; matching charsets |
| **Sithjester's RMXP sprites** (mirror: forums.rpgmakerweb thread 144609 — **closing!**; github.com/thoughtstem/sithjester-assets) | ✅ originals free com/non-com with credit + own RMXP; ❌ skip her fan-art sets commercially |
| **Inquisitor's Medieval tilesets** (rpg-palace.com) | ✅ free, credit optional, 100% original; aging host — back up now |
| **Mack tiles** | ⚠ originals free+credit; "Mack & Blue" sets contain RTP-derived parts (own XP, RM-only) |
| **REFMAP/FSM** (site dead; archives + paid Steam packs) | ✅ free any engine incl. commercial, credit "REFMAP" mandatory; sourcing is via archives |
| **Celianna/Pixanna** | ❌ license is VX/Ace-only — not usable in XP |
| **whtdragon / Avery** | ⚠ MV-RTP edits: need MV ownership + 48→32px rescale; Avery wants a free copy of your game |
| **rpg-maker.fr resources** | ⚠ big XP archive; per-item commercial/credit flags — check each |

### Audio — XP wants OGG (loops) or MIDI

| Source | Terms |
|---|---|
| **Maoudamashii** (maou.audio) | ✅ free com/non-com, no credit required, 5000+ tracks |
| **DOVA-SYNDROME** (dova-s.jp) | ✅ free com/non-com, but per-track composer terms — read each page |
| **PeriTune** (peritune.com) | ✅ RPG-flavored, OGG, free commercial; pre-2026 tracks CC-BY (credit) |
| **incompetech** (Kevin MacLeod) | ✅ CC-BY — credit required |

All four audio sources are engine-agnostic (no RM ownership needed).

---

## Licensing rules of thumb

1. Default for classic forum scripts: **free non-commercial with credit;
   commercial needs author permission** (stated in script headers).
   Many authors are unreachable 15+ years — for commercial work prefer
   explicit licenses (Tier 1, Moghunter, rpgmaker.net entries with terms).
2. **RTP-derived graphics** (most "XP-style" edits): require owning XP and
   staying within RPG Maker engines.
3. GPL scripts: fine for free games; share-alike is awkward for closed
   commercial releases.
4. Anything Pokémon/Essentials-derived: legally radioactive regardless of
   stated license.
