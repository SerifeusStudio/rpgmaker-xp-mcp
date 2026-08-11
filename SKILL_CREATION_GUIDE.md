# Skill Creation Guide (RPG Maker XP)

Create and edit skills in your XP project from natural language. **XP skills work
very differently from MZ** — there are no damage-formula strings. A skill has a
numeric `power` plus stat-influence rates (`*_f`), and the engine computes
damage. This guide covers the model and the tools.

> If you're coming from MZ: there is no `damageFormula`, no `mat`/`mdf`, no MP
> (XP uses **SP**), and **no buff system** — temporary stat changes are done with
> states. Negative `power` = healing.

## The XP damage model (from the real engine)

```
power_eff = skill.power + user.atk * atk_f/100
if power_eff > 0:                       # only damaging skills get reduced
    power_eff -= target.pdef*pdef_f/200 + target.mdef*mdef_f/200
rate   = 20 + str*str_f/100 + dex*dex_f/100 + agi*agi_f/100 + int*int_f/100
damage = power_eff * rate / 20          # then element/guard/variance applied
```

Consequences worth knowing:
- **`power` is not final damage.** With the default DB's INT 50 and `int_f` 100,
  real damage is roughly **3.5× power**. Tune `power`, not a formula.
- **Negative `power` = healing.** Heals skip defense reduction and can't miss.
- **`atk_f > 0` makes a skill "physical"**: it multiplies the first hit roll by
  the user's hit rate and triggers shock-state removal.
- **No buffs.** To raise/lower stats temporarily, apply a state with `*_rate`
  multipliers (see `create_state_skill`).

Scope: 0 none, 1 one enemy, 2 all enemies, 3 one ally, 4 all allies, 5 one ally
(HP 0), 6 all allies (HP 0), 7 user.
Occasion: 0 always, 1 battle only, 2 menu only, 3 never.

## Tools

### `create_damage_skill`
A damaging skill. Parameters: `name`, `power`, `spCost`, `scope`, `elementId`,
`description`, `physical` (true → sets `atk_f`/`str_f`/`pdef_f` like a weapon
skill; false → magical, `int_f`/`mdef_f`).

> "Create a fire attack spell called **Fireball**: SP 15, one enemy, ~140 power,
> fire element."

Produces a magical nuke in the shape of the default Fire skill (power 140,
sp 75, int_f 100, mdef_f 100, variance 15).

### `create_healing_skill`
A heal (stored internally as **negative power**). Parameters: `name`, `power`
(give a positive heal amount; stored negative), `spCost`, `scope`, `description`.

> "Create **Group Heal**: SP 20, all allies, heals about 150 HP."

### `create_state_skill`
Applies/removes states (the XP stand-in for buffs, debuffs, and status effects
like poison/sleep). Parameters include `name`, the state id(s) to add/remove,
`spCost`, `scope`, `description`.

> "Create **Poison Touch**: SP 5, one enemy, inflicts the Poison state."
> "Create **Protect**: SP 8, one ally, applies a Defense-up state." (define the
> state's `pdef_rate` first, since XP has no buff command.)

### `create_skill` (generic) / `update_skill`
`create_skill` exposes every `RPG::Skill` field for full control;
`update_skill(skillId, updates)` edits an existing one. Use these for hybrid
skills (damage + state), custom F-rate tuning, animations, or a
`common_event_id` trigger.

## Reference stat profiles (match the default DB)

| Kind | power | sp | key rates | notes |
|---|---|---|---|---|
| Magic nuke (Fire) | 140 | 75 | int_f 100, mdef_f 100 | variance 15 |
| Physical (Cross Cut) | 20 | — | atk_f 100, str_f 100, pdef_f 100, mdef_f 0, int_f 0 | |
| Heal | −150 | 80 | int_f 50 | occasion 0, scope 3 |

Defaults are asymmetric (`int_f`/`mdef_f` = 100, other F-rates 0; `hit` 100,
`variance` 15, `occasion` 1) — the creators mirror the editor so skills look
native. Skill icons come from `Graphics/Icons`; `animation1_id`/`animation2_id`
reference the Animations database.

## Tips

- Think in **power + rates**, not formulas. Start from a reference profile above
  and adjust `power` for damage and `*_f` for how much stats matter.
- For "buffs/debuffs," create the **state** first (with `*_rate` multipliers),
  then a `create_state_skill` that applies it.
- After creating skills, review them in the RPG Maker XP editor (open it only
  when the MCP server isn't writing).
