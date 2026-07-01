# Champions '84 — Character Sheet & Dice Tool

Static, no-build web tool for a Champions 6E (Hero System) campaign. Plain
HTML/CSS/ES-modules — deploys as-is to GitHub Pages.

## Run locally

ES modules require HTTP (not `file://`):

```bash
python3 server.py            # serves this dir at http://127.0.0.1:4321
# then open http://127.0.0.1:4321/#/mike
```

`server.py` is a tiny static server used because the stock `python -m
http.server` trips a sandbox restriction here; it's not needed on GitHub Pages.

## Routes (hash-based, GitHub Pages friendly)

| URL          | View                                   |
|--------------|----------------------------------------|
| `#/` (or no hash) | GM dashboard (all four PCs)        |
| `#/mike`     | Mike — Punchline · Vivian (tabs)       |
| `#/dave`     | Dave — Irie Blaze (day/night toggle)   |
| `#/vlad`     | Vlad — Double Helix (VPP spellbook)    |

Hash routing means every route resolves to `index.html`, so no GitHub Pages
rewrite rules are needed.

## Deploy to GitHub Pages

It's a plain static site — push it to a repo and turn on Pages:

```bash
git init && git add -A && git commit -m "Champions '84 character tool"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Build and deployment → Source: Deploy
from a branch → Branch: `main` / `/ (root)` → Save.** The site appears at
`https://<you>.github.io/<repo>/` within a minute; share each player their URL
(`…/#/mike`, etc.). The live roll log keeps working — it talks to Firebase, not
the host. (`server.py` is only for local dev and is ignored by Pages.)

## Layout

```
index.html            shell: top bar + nav + #app mount
css/styles.css        '84 comic theme (dark, CSS variables)
js/app.js             bootstrap + hash router + tab handling
js/render.js          data-driven sheet renderer (pure, degrades gracefully)
js/data/index.js      character + route registry (register new PCs here)
js/data/punchline.js  validated reference character schema
```

## Adding a character

1. Create `js/data/<id>.js` exporting an object in the Punchline schema shape.
2. Import it in `js/data/index.js`, add to `characters`, and list its id in the
   relevant route's `characterIds` (multiple ids on one route render as tabs).

The renderer omits any section the character object doesn't define, so partial
schemas render what they have. Notable derived/optional fields:

- **Characteristic & PER rolls** are computed, not stored: `9 + round(CHAR/5)`
  (`charRoll` in `js/render.js`), shown under STR/DEX/CON/INT/EGO/PRE and as a
  PER roll off INT. They update automatically if a characteristic changes.
  **Clicking** a characteristic (or the PER line) rolls 3d6 vs that number
  (`rollCheck` in `js/dice/hero.js`) and posts the result to the roll log.
- **`movement`** (meters/Phase) — optional; defaults to 6E standard
  `{ Running: 12, Leaping: 4, Swimming: 4 }`. Override individual modes per
  character (e.g. Vivian's swimming).
- **`xp`** — `{ earned, spent }`; renders Earned/Spent trackers with +/-
  controls and a derived Unspent total (spent is capped at earned).

## Dice engine

Pure, RNG-injectable resolvers live in `js/dice/`:

- `dice.js` — `rollDie`, `rollDice(n, rng)`, `parseDiceCount("20d6")`.
- `hero.js` — `rollToHit`, `rollNormalDamage`, `rollKillingDamage`,
  `rollKnockback`, and `rollPower` (full attack: to-hit + damage + knockback).
- `format.js` — turns a result into roll-log strings.
- `log.js` — shared roll log + pub/sub (Firebase-backed, local fallback).

Tests: open `tests/index.html` (14 deterministic cases via a scripted RNG).

## Shared roll log (Firebase)

`js/log.js` runs in one of two modes behind a single API:

- **Local** (default) — in-memory, scoped to one browser. Used until Firebase
  is configured. The Roll Log header shows a grey **● Local** badge.
- **Firebase** — every roll pushes to a Realtime Database `rolls` node; a single
  `onValue` listener mirrors the shared feed into every player's screen live.
  Header shows a green **● Live** badge.

### One-time setup

1. Create a free Firebase project at <https://console.firebase.google.com>
   (Spark/no-cost tier is plenty for a 5-person game).
2. **Build → Realtime Database → Create Database.** Pick a region; start in
   *locked mode* (rules below replace the defaults).
3. **Project settings → General → Your apps →** add a **Web app** (`</>`),
   then copy the `firebaseConfig` values.
4. Paste them into [`js/firebase-config.js`](js/firebase-config.js) (these web
   config values are **not** secret — safe to commit; security is the rules
   below). Reload — the badge turns green **● Live**.

### Realtime Database rules

No login system (private-link model per the brief), so the `rolls` node is
open read/write. Acceptable for a private game on an unguessable project URL;
the rest of the DB stays locked. Paste under **Realtime Database → Rules**:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rolls": {
      ".read": true,
      ".write": true,
      "$rollId": { ".validate": "newData.hasChildren(['ts','who'])" }
    },
    "phase": { ".read": true, ".write": true },
    "characters": { ".read": true, ".write": true }
  }
}
```

The `phase` node backs the GM phase tracker (shared 1–12 segment); the
`characters` node holds GM-edited stat overrides (characteristics, combat
values, REC, movement) synced to players' sheets. Without each rule, those
writes are rejected (`permission_denied`) and won't sync.

If you later want it tighter, enable Anonymous Auth and gate `.write` on
`auth != null`, or add Firebase App Check — neither requires UI changes here.

### Verifying it's live

Open the same URL in two browser windows; a roll (or **Clear**) in one appears
in the other within a moment, and both show the green **● Live** badge. The
log keeps the last 200 rolls.

## GM mode

The GM dashboard and controls only appear in **GM mode**, opted into with a
`?gm=1` query param — so players' links never reveal them.

- **GM:** `https://…/champions84/?gm=1#/` (GM tab, all-PC dashboard, phase
  slider, the "GM private rolls" switch). The `?gm=1` persists as you navigate.
- **Players:** `https://…/champions84/#/mike` (etc.) — no GM tab; the root shows
  a neutral chooser, not the dashboard.

## Table tools

- **To-hit** reports the DCV it hits (`hits DCV N` = 11 + OCV − 3d6); no target
  entry — compare to the actual target's DCV at the table.
- **Recovery** button (Status section) restores STUN + END by the character's
  `rec`, capped at max.
- **Downed lock** — at 0 STUN or 0 BODY a character shows a "DOWN" banner and
  its action controls (rolls, powers, VPP, Recover, characteristic checks) lock
  on player screens. The GM (`?gm=1`) keeps full control to roll/heal/Recover
  for them. Health trackers stay usable for tracking, and the lock is
  per-character (one of Mike's two going down doesn't affect the other).
- **Phase tracker** — shared 1–12 segment; GM drives the slider on the
  dashboard, players see it read-only in their roll panel (needs the `phase` DB
  rule above).
- **GM-editable stats** — each dashboard card has number inputs for the eight
  characteristics, the combat/defense values (OCV/DCV/OMCV/DMCV/PD/ED/rPD/rED,
  MD), **STUN/BODY/END totals (max)**, REC, and movement (incl. Vivian's
  Clinging). 6E treats these as independent (not figured), so they're all
  editable — update them when a player spends XP, no code change needed. An edit
  writes the stat keys to `characters/<id>` (via `update`) and syncs live to
  that player's sheet (needs the `characters` DB rule).
- **STUN can go negative** down to −max (deeply KO'd); BODY and END floor at 0.
  Negative STUN shows in red; "Full" always restores to max.
- **Current STUN/BODY/END sync too** — the in-combat +/- trackers, Recovery,
  and END/STUN spend all write `characters/<id>/current` (dual control: GM *or*
  player can adjust, last write wins). So HP is shared and persists across
  reloads, and the downed-lock state stays consistent on every screen.
- **Dice Tools** panel: To-hit (OCV), a generic Nd6 roller (default 3d6),
  Normal/Killing damage, Knockback, and a **HAP** button (2d6 Heroic Action
  Points).

### Table-confirmable conventions (edit `CONVENTIONS` in `js/dice/hero.js`)

These three rules vary by table/edition; defaults follow 6E core as read here.
Confirm with the group, then change in one place:

- **Killing STUN multiplier** — default `"1d3"` (roll 1d6, halve round up:
  1-2→×1, 3-4→×2, 5-6→×3). Set to `"1d6"` for the raw die face. *(The brief
  said "1d6 STUN multiplier roll" — this is the one-die-determines-multiplier
  reading; flip the flag if you meant the raw 1-6 value.)*
- **Knockback distance** — `BODY − 2d6`, each leftover point = `2` meters
  (`knockbackMetersPerPoint`). Set to 1 to report raw points.
- **`knockbackBonus` semantics** — a power's `knockbackBonus: N` currently rolls
  `N` *fewer* knockback dice (more knockback). Confirm this matches how the
  bonus is written on the sheet.
- **Pulling a punch** — each power's `Dice` input lets the player attack with
  fewer dice. END scales proportionally (`fullEnd × usedDice / fullDice`),
  rounded to nearest, **minimum 1** (a 0-END power stays free). To-hit is
  unaffected; knockback follows the reduced BODY. `pulledEndCost()` in
  `js/dice/hero.js` is the one place to change the rounding rule.

## Build status (per project brief)

- [x] **1. Static character sheet display** — renderer + Punchline proven.
      STUN/BODY/END trackers with +/- controls included.
- [x] **2. Dice roller core** — to-hit, normal/killing damage, knockback;
      pure + RNG-injectable, 14 passing tests. Plus clickable characteristic /
      PER rolls (3d6 vs target).
- [x] **3. Power buttons** — `Roll Attack` on each power resolves to-hit +
      damage + knockback, deducts END, and posts to the roll log. Players can
      pull punches (fewer dice → proportional END).
- [x] **4. Double Helix VPP spellbook UI** — `js/vpp.js`: browse the grouped
      library → allocate into the 40-AP pool → **delivery toggle** (Touch /
      Ranged / Area swaps dice + AP + END) → Use/Attack (rolls live, pays END)
      or **Activate** for GM-adjudicated powers (no dice) → Control Roll.
      Roll-live per table decision (not Standard Effect).
- [x] **5. Firebase Realtime Database shared roll log** — `log.js` is
      Firebase-backed with a local-only fallback; fill in
      `js/firebase-config.js` to go live (see *Shared roll log* above).
- [x] **6. GM private/public roll toggle** — a "GM private rolls" switch in the
      roll panel. Private rolls stay local (never pushed to Firebase) and are
      tagged 🔒; public rolls sync as normal. `log.js` keeps `synced` (public,
      from Firebase) and `local` (private) feeds separate and merges them.
- [x] **7. GM summary dashboard** — the `#/` route: a card per PC with quick
      combat stats and live STUN/BODY/END trackers; names link to full sheets.
- [ ] 8. Polish + deploy to GitHub Pages

All four characters are built: Punchline, Vivian (martial arts), Irie Blaze
(day/night power toggle), Double Helix (Genetic Sight + VPP).

Power rolling is unified: a power with a `damageType` (or `rollType:
"attackRoll"`) does to-hit + damage and supports pulling the punch; a power with
any other `rollType` (`addToCharacteristic`, `healBody`, `telepathy`,
`transform`, …) rolls effect dice and reports the summed effect. Powers with no
rollType just display. Vivian's martial maneuvers reuse the attack flow;
Irie's `powerSets` (day / night / shared) drive the day/night toggle.

BODY wasn't on Vivian's or Irie's sheet — both default to 10 (confirm).

VPP power model (`js/data/doubleHelix.js`): each power groups its delivery
variants under `modes` (Touch / Ranged / Area), each with its own dice / AP /
END; the UI toggle picks one and reserves that mode's AP. The "dice
discrepancies" from the PDFs are just these delivery variants (e.g. Suppress:
Touch 8d6 / Ranged 4d6 / Area 2d6).

GM-adjudicated powers (`rollType: "adjudicated"`) — Entangle, Fear, Bio-Plating
(Armor), Invisibility, Predator Mode — allocate and cost AP/END but have no die
roll; "Activate" just logs the use and the GM rules the effect. (Cellular
Necrosis/RKA and Gene-Lock/Transform now roll dice.) AP/END marked "(est.)" in
the data are placeholders from the PDFs — adjust freely.

**Partial allocation:** a power can be allocated at fewer dice than its mode's
max (a dice stepper on each active slot), reserving proportionally less AP — so
several partial powers can share the 40-AP pool. `activeSlots` entries are
`{ id, mode, dice, self }`; AP/END scale with `dice` (see `apAt`/`endAt` in
`js/vpp.js`).

**Self-boosts:** a Boost (Aid) targeting a characteristic shows an "Apply to
me" checkbox (on by default for Self/Touch). When used self-targeted, the rolled
amount adds to `character.boosts[CHAR]` and the Characteristics section shows the
boosted value (and recomputed roll); a "Clear boosts" button resets them (Aid
fades). SPD Aid isn't auto-applied (special conversion); OCV/DCV/defenses aren't
auto-recalculated from boosted characteristics.
