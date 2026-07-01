// Data-driven character sheet renderer.
// Every section reads from the character object and degrades gracefully when a
// field is absent, so partially-defined characters still render what they have.
import { parseDiceCount } from "./dice/dice.js";
import { pulledEndCost } from "./dice/hero.js";
import { renderVpp } from "./vpp.js";
import { subscribePhase, getPhase } from "./log.js";

// --- tiny DOM helper -------------------------------------------------------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// Characteristic display order & full names (Hero System 6E primary stats).
const CHAR_ORDER = ["STR", "DEX", "CON", "BODY", "INT", "EGO", "PRE", "SPD"];
const CHAR_NAMES = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution", BODY: "Body",
  INT: "Intelligence", EGO: "Ego", PRE: "Presence", SPD: "Speed"
};
const DERIVED_ORDER = ["OCV", "DCV", "OMCV", "DMCV", "PD", "ED", "rPD", "rED", "MD"];
const DERIVED_NAMES = {
  OCV: "Offensive Combat Value", DCV: "Defensive Combat Value",
  OMCV: "Offensive Mental CV", DMCV: "Defensive Mental CV",
  PD: "Physical Defense", ED: "Energy Defense",
  rPD: "Resistant PD", rED: "Resistant ED", MD: "Mental Defense"
};

// Characteristic Roll = 9 + round(CHAR/5). Made for these stats; BODY and SPD
// don't use a characteristic roll. PER Roll uses the same formula on INT.
const ROLLABLE_CHARS = ["STR", "DEX", "CON", "INT", "EGO", "PRE"];
export function charRoll(value) {
  return 9 + Math.round(value / 5);
}

// 6E standard movement (meters) every character has without spending points.
const STANDARD_MOVEMENT = { Running: 12, Leaping: 4, Swimming: 4 };
const MOVEMENT_ORDER = ["Running", "Leaping", "Swimming"];

// `rolls` (optional) maps a key to its characteristic roll, shown as "13-".
// `onRoll(key, target)` (optional) makes cells that have a roll clickable.
// `boosts` (optional) maps a key to a temporary boost amount; the cell then
// shows the boosted value with the base in a sub-note.
function statGrid(values, order, names, className, rolls, onRoll, boosts) {
  const cells = order
    .filter((key) => values[key] !== undefined)
    .map((key) => {
      const target = rolls ? rolls[key] : null;
      const boost = boosts ? (boosts[key] || 0) : 0;
      const children = [
        el("span", { class: "stat-label" }, key),
        el("span", { class: "stat-value" }, String(values[key]))
      ];
      if (target != null) children.push(el("span", { class: "stat-roll" }, `${target}-`));
      if (boost) children.push(el("span", { class: "stat-boost" }, `+${boost} (base ${values[key] - boost})`));

      const clickable = target != null && typeof onRoll === "function";
      const attrs = {
        class: "stat" + (clickable ? " stat-actionable" : "") + (boost ? " boosted" : ""),
        title: clickable ? `Roll ${key} ${target}-` : (names[key] || key)
      };
      if (clickable) {
        const fire = () => onRoll(key, target);
        attrs.role = "button";
        attrs.tabindex = "0";
        attrs.onClick = fire;
        attrs.onKeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } };
      }
      return el("div", attrs, children);
    });
  return el("div", { class: className }, cells);
}

function movementGrid(movement, order) {
  return el("div", { class: "stat-grid" },
    order
      .filter((k) => movement[k] != null)
      .map((k) =>
        el("div", { class: "stat", title: `${k} (meters per Phase)` }, [
          el("span", { class: "stat-label" }, k),
          el("span", { class: "stat-value" }, `${movement[k]}m`)
        ])
      ));
}

// XP tracker. Earned and Spent are tracked separately; Unspent is derived
// (earned − spent). Spent can't exceed earned, and lowering earned pulls spent
// down with it. `onChange` (reused from the health trackers) re-renders.
function xpTracker(character, onChange) {
  const xp = character.xp;
  function adjust(field, delta) {
    let { earned, spent } = xp;
    if (field === "earned") earned = Math.max(0, earned + delta);
    else spent = Math.max(0, spent + delta);
    if (spent > earned) spent = earned; // can't spend XP you haven't earned
    if (earned === xp.earned && spent === xp.spent) return;
    xp.earned = earned;
    xp.spent = spent;
    if (typeof onChange === "function") onChange(character, "XP", xp);
  }

  function line(label, field) {
    return el("div", { class: "xp-line" }, [
      el("span", { class: "xp-label" }, label),
      el("span", { class: "xp-num" }, String(xp[field])),
      el("div", { class: "track-controls" }, [
        el("button", { class: "step", type: "button", onClick: () => adjust(field, -5) }, "−5"),
        el("button", { class: "step", type: "button", onClick: () => adjust(field, -1) }, "−1"),
        el("button", { class: "step", type: "button", onClick: () => adjust(field, 1) }, "+1"),
        el("button", { class: "step", type: "button", onClick: () => adjust(field, 5) }, "+5")
      ])
    ]);
  }

  return el("div", { class: "xp-block" }, [
    line("Earned", "earned"),
    line("Spent", "spent"),
    el("div", { class: "xp-line xp-unspent" }, [
      el("span", { class: "xp-label" }, "Unspent"),
      el("span", { class: "xp-value" }, String(xp.earned - xp.spent))
    ])
  ]);
}

// --- health trackers (STUN / BODY / END) with +/- controls -----------------
// `onChange(character, kind, newCurrent)` is called after a clamp-adjusted edit
// so the host can persist / re-render. Pure display otherwise.
function healthTracker(character, kind, pool, onChange) {
  // STUN may go negative down to −max (deeply KO'd); BODY/END floor at 0.
  const floor = kind === "STUN" ? -pool.max : 0;
  const pct = pool.max > 0 ? Math.max(0, Math.min(100, (pool.current / pool.max) * 100)) : 0;
  const valueLabel = el("span", { class: "track-value" + (pool.current < 0 ? " negative" : "") }, `${pool.current} / ${pool.max}`);
  const fill = el("div", { class: `track-fill track-${kind.toLowerCase()}`, style: `width:${pct}%` });

  function setTo(next) {
    next = Math.max(floor, Math.min(pool.max, next));
    if (next === pool.current) return;
    pool.current = next;
    if (typeof onChange === "function") onChange(character, kind, next);
  }
  const adjust = (delta) => setTo(pool.current + delta);

  return el("div", { class: "tracker" }, [
    el("div", { class: "track-head" }, [
      el("span", { class: "track-label" }, kind),
      valueLabel
    ]),
    el("div", { class: "track-bar" }, [fill]),
    el("div", { class: "track-controls" }, [
      el("button", { class: "step", type: "button", "aria-label": `${kind} -5`, onClick: () => adjust(-5) }, "−5"),
      el("button", { class: "step", type: "button", "aria-label": `${kind} -1`, onClick: () => adjust(-1) }, "−1"),
      el("button", { class: "step", type: "button", "aria-label": `${kind} +1`, onClick: () => adjust(1) }, "+1"),
      el("button", { class: "step", type: "button", "aria-label": `${kind} +5`, onClick: () => adjust(5) }, "+5"),
      el("button", { class: "step step-full", type: "button", onClick: () => setTo(pool.max) }, "Full")
    ])
  ]);
}

// --- powers ----------------------------------------------------------------
// `onRoll(character, power)` (when provided) wires a Roll button that resolves
// the attack through the dice engine.
function powerCard(power, character, onRoll) {
  const meta = [];
  if (power.type) meta.push(power.type);
  if (power.totalDice) meta.push(power.totalDice);
  if (power.damageType) meta.push(power.damageType);
  if (power.endCost != null) meta.push(`${power.endCost} END`);
  if (power.cost) meta.push(power.cost);

  const mods = [];
  if (power.ocvMod != null) mods.push(`OCV ${power.ocvMod >= 0 ? "+" : ""}${power.ocvMod}`);
  if (power.knockbackBonus != null) mods.push(`KB +${power.knockbackBonus}`);
  if (power.autofire) mods.push(`Autofire ${power.autofire.shots} (max ${power.autofire.maxHits})`);
  if (power.alwaysOn) mods.push("always on");
  (power.conditions || []).forEach((c) => mods.push(c.replace(/_/g, " ")));

  const isAttack = Boolean(power.damageType) || power.rollType === "attackRoll";
  const canRoll = typeof onRoll === "function" && power.totalDice && (isAttack || power.rollType);

  return el("div", { class: "power-card" }, [
    el("div", { class: "power-top" }, [
      el("span", { class: "power-name" }, power.name),
      el("span", { class: "power-dice" }, power.totalDice || "")
    ]),
    el("div", { class: "power-meta" }, meta.join(" · ")),
    power.description ? el("p", { class: "power-desc" }, power.description) : null,
    mods.length ? el("div", { class: "power-mods" }, mods.map((m) => el("span", { class: "chip" }, m))) : null,
    canRoll ? rollControls(power, character, onRoll, isAttack) : null
  ]);
}

// Roll affordance for a power. Attacks get the pull-the-punch dice control;
// non-attack effect powers (Aid/Heal/Telepathy/…) get a plain Roll button.
function rollControls(power, character, onRoll, isAttack) {
  if (!isAttack) {
    return el("button", { class: "roll-btn", type: "button", onClick: () => onRoll(character, power) }, "Roll");
  }
  let fullDice;
  try { fullDice = parseDiceCount(power.totalDice); }
  catch { return el("button", { class: "roll-btn", type: "button", onClick: () => onRoll(character, power) }, "Roll Attack"); }

  const clamp = (v) => Math.max(1, Math.min(fullDice, parseInt(v, 10) || 1));
  const input = el("input", { type: "number", class: "num dice-input", min: "1", max: String(fullDice), value: String(fullDice) });
  const preview = el("span", { class: "end-preview" });

  function refresh() {
    const n = clamp(input.value);
    const end = pulledEndCost(power, n);
    preview.textContent = n < fullDice
      ? `${n}/${fullDice}d6 · ${end} END (pulled)`
      : `${end} END`;
  }
  input.addEventListener("input", refresh);
  refresh();

  const btn = el("button", { class: "roll-btn", type: "button",
    onClick: () => onRoll(character, power, clamp(input.value)) }, "Roll Attack");

  return el("div", { class: "power-roll" }, [
    el("label", { class: "field" }, [el("span", {}, "Dice"), input]),
    preview,
    btn
  ]);
}

function section(title, body) {
  return el("section", { class: "sheet-section" }, [
    el("h2", { class: "section-title" }, title),
    body
  ]);
}

// --- GM dashboard ----------------------------------------------------------
// Compact card per PC: name (links to the full sheet), quick combat stats, and
// the STUN/BODY/END trackers (editable, so the GM can track damage live).
// `items` = [{ character, slug }].
// Full GM editor for a dashboard card: characteristics, combat/defense values,
// REC, and movement — all independently editable (6E doesn't figure them) and
// synced to the player's sheet. Any change writes the whole override object.
function gmEditor(character, onSetChar) {
  const inputs = { characteristics: {}, derived: {}, movement: {}, maxima: {}, rec: null };
  const num = (i) => parseInt(i.value, 10) || 0;

  const commit = () => {
    const ov = {};
    const fill = (bucket) => {
      const keys = Object.keys(inputs[bucket]);
      if (!keys.length) return undefined;
      const o = {};
      for (const k of keys) o[k] = num(inputs[bucket][k]);
      return o;
    };
    const ch = fill("characteristics"); if (ch) ov.characteristics = ch;
    const dv = fill("derived"); if (dv) ov.derived = dv;
    const mx = fill("maxima"); if (mx) ov.maxima = mx;
    const mv = fill("movement"); if (mv) ov.movement = mv;
    if (inputs.rec) ov.rec = num(inputs.rec);
    onSetChar(character.id, ov);
  };

  const cell = (label, value, bucket, key) => {
    const input = el("input", { type: "number", class: "num char-edit", value: String(value) });
    input.addEventListener("change", commit);
    if (bucket === "rec") inputs.rec = input; else inputs[bucket][key] = input;
    return el("label", { class: "char-edit-cell" }, [el("span", {}, label), input]);
  };

  const sections = [];
  function group(title, cells) {
    if (cells.length) sections.push(el("div", { class: "char-editor-group" }, [
      el("div", { class: "char-editor-title" }, title),
      el("div", { class: "char-edit-grid" }, cells)
    ]));
  }

  if (character.characteristics) {
    group("Characteristics", CHAR_ORDER.filter((k) => character.characteristics[k] != null)
      .map((k) => cell(k, character.characteristics[k], "characteristics", k)));
  }
  if (character.derived) {
    group("Combat & Defenses", DERIVED_ORDER.filter((k) => character.derived[k] != null)
      .map((k) => cell(k, character.derived[k], "derived", k)));
  }
  if (character.health) {
    group("Totals (max)", ["STUN", "BODY", "END"].filter((k) => character.health[k])
      .map((k) => cell(`${k} max`, character.health[k].max, "maxima", k)));
  }

  // REC + movement (including any character-specific modes, e.g. Vivian's Clinging).
  const movement = { ...STANDARD_MOVEMENT, ...(character.movement || {}) };
  const moveOrder = [...MOVEMENT_ORDER, ...Object.keys(movement).filter((k) => !MOVEMENT_ORDER.includes(k))];
  const recMove = [];
  if (character.rec != null) recMove.push(cell("REC", character.rec, "rec"));
  for (const k of moveOrder) recMove.push(cell(`${k} (m)`, movement[k], "movement", k));
  group("REC & Movement", recMove);

  return el("div", { class: "char-editor" }, [
    el("div", { class: "char-editor-head" }, "GM edit — synced to player"),
    ...sections
  ]);
}

export function renderDashboard(items, { onHealthChange, onSetPhase, onSetChar } = {}) {
  const root = el("div", { class: "dashboard" });
  root.appendChild(el("p", { class: "dash-intro" },
    "All four PCs at a glance — adjust trackers as combat unfolds. Use the Dice Tools panel for NPC rolls (flip on “GM private” to keep them off the shared log)."));

  // Phase tracker — GM drives this; players see it live in their roll panel.
  if (typeof onSetPhase === "function") {
    const label = el("span", { class: "phase-seg" });
    const slider = el("input", { type: "range", min: "1", max: "12", step: "1", class: "phase-slider" });
    const pips = el("div", { class: "phase-strip" });
    for (let i = 1; i <= 12; i++) pips.appendChild(el("span", { class: "phase-pip" }));
    function paint(n) {
      slider.value = String(n);
      label.textContent = `Phase ${n} / 12`;
      [...pips.children].forEach((p, idx) => p.classList.toggle("on", idx < n));
    }
    slider.addEventListener("input", () => onSetPhase(parseInt(slider.value, 10)));
    subscribePhase(paint);
    paint(getPhase());
    root.appendChild(el("div", { class: "dash-phase" }, [
      el("div", { class: "phase-head" }, [el("h3", { class: "vpp-subtitle" }, "Phase Tracker"), label]),
      slider, pips
    ]));
  }

  const grid = el("div", { class: "dash-grid" }, items.map(({ character, slug }) => {
    const trackers = ["STUN", "BODY", "END"]
      .filter((k) => character.health && character.health[k])
      .map((k) => healthTracker(character, k, character.health[k], onHealthChange));

    const h = character.health || {};
    const cardDowned = (h.STUN && h.STUN.current <= 0) || (h.BODY && h.BODY.current <= 0);
    return el("div", { class: "dash-card" + (cardDowned ? " dash-card-down" : "") }, [
      el("div", { class: "dash-card-head" }, [
        // Dashboard is GM-only, so keep GM mode when jumping to a sheet.
        el("a", { class: "dash-name", href: `?gm=1#/${slug}` }, character.name),
        cardDowned ? el("span", { class: "down-badge" }, "DOWN") : null,
        character.player ? el("span", { class: "chip" }, character.player) : null
      ]),
      typeof onSetChar === "function" ? gmEditor(character, onSetChar) : null,
      el("div", { class: "trackers" }, trackers)
    ]);
  }));
  root.appendChild(grid);
  return root;
}

// --- public API ------------------------------------------------------------
// --- martial arts maneuvers ------------------------------------------------
// Offensive maneuvers (with totalDice) roll via onRollPower as a power-shaped
// object; defensive ones (Dodge, Block) just display their CV modifiers.
function maneuverRow(m, character, onRollPower) {
  const mods = [];
  mods.push(`Phase ${m.phase || "½"}`);
  if (m.ocvMod != null) mods.push(`OCV ${m.ocvMod >= 0 ? "+" : ""}${m.ocvMod}`);
  if (m.dcvMod != null) mods.push(`DCV ${m.dcvMod >= 0 ? "+" : ""}${m.dcvMod}`);
  if (m.abort) mods.push("Abort");

  const offensive = Boolean(m.totalDice) && !m.defensive;
  return el("div", { class: "maneuver" }, [
    el("div", { class: "maneuver-info" }, [
      el("div", { class: "maneuver-top" }, [
        el("span", { class: "vpp-name" }, m.name),
        m.totalDice ? el("span", { class: "power-dice" }, m.totalDice) : null
      ]),
      el("div", { class: "power-mods" }, mods.map((x) => el("span", { class: "chip" }, x))),
      m.effect ? el("span", { class: "vpp-power-meta" }, m.effect) : null
    ]),
    offensive && typeof onRollPower === "function"
      ? el("button", { class: "roll-btn", type: "button", onClick: () => onRollPower(character, m) }, "Strike")
      : null
  ]);
}

function plainList(items) {
  return el("ul", { class: "plain-list" }, items.map((s) => el("li", {}, s)));
}

export function renderCharacter(character, { onHealthChange, onRollPower, onRollCheck, onTogglePowerSet, onClearBoosts, onRecover, vppHandlers, downed, locked } = {}) {
  const root = el("article", { class: "sheet", dataset: { characterId: character.id } });

  // Identity header
  root.appendChild(
    el("div", { class: "sheet-header" }, [
      el("div", {}, [
        el("h2", { class: "char-name" }, character.name),
        character.realName ? el("p", { class: "char-real" }, character.realName) : null
      ]),
      el("div", { class: "char-tags" }, [
        character.player ? el("span", { class: "chip" }, character.player) : null,
        character.phases ? el("span", { class: "chip" }, `Phases ${character.phases.join(", ")}`) : null
      ])
    ])
  );

  if (character.health) {
    const trackers = ["STUN", "BODY", "END"]
      .filter((k) => character.health[k])
      .map((k) => healthTracker(character, k, character.health[k], onHealthChange));
    const body = el("div", {}, [el("div", { class: "trackers" }, trackers)]);
    if (character.rec != null && typeof onRecover === "function") {
      body.appendChild(el("div", { class: "recover-row" }, [
        el("button", { class: "roll-btn recover-btn", type: "button", title: "Recover STUN and END by REC",
          onClick: () => onRecover(character) }, `Recover (REC ${character.rec})`)
      ]));
    }
    root.appendChild(section("Status", body));
  }

  if (character.characteristics) {
    const c = character.characteristics;
    const boosts = character.boosts || {};
    // Effective (boosted) values; rolls recompute on the boosted figure.
    const eff = {};
    for (const k of Object.keys(c)) eff[k] = c[k] + (boosts[k] || 0);
    const rolls = {};
    for (const k of ROLLABLE_CHARS) if (c[k] != null) rolls[k] = charRoll(eff[k]);

    const statRoll = typeof onRollCheck === "function"
      ? (key, target) => onRollCheck(character, key, target)
      : undefined;
    const body = el("div", {}, [statGrid(eff, CHAR_ORDER, CHAR_NAMES, "stat-grid", rolls, statRoll, boosts)]);

    const activeBoosts = Object.keys(boosts).filter((k) => boosts[k]);
    if (activeBoosts.length) {
      const note = el("p", { class: "roll-note" },
        "Active self-boosts shown above (Aid fades over time). OCV/DCV/defenses are not auto-recalculated.");
      if (typeof onClearBoosts === "function") {
        note.appendChild(document.createTextNode("  "));
        note.appendChild(el("button", { class: "ghost-btn", type: "button", onClick: () => onClearBoosts(character) }, "Clear boosts"));
      }
      body.appendChild(note);
    }

    if (c.INT != null) {
      const perTarget = charRoll(eff.INT);
      const perAttrs = { class: "roll-note", title: `Roll PER ${perTarget}-` };
      if (typeof onRollCheck === "function") {
        const fire = () => onRollCheck(character, "PER", perTarget);
        perAttrs.class = "roll-note roll-note-actionable";
        perAttrs.role = "button";
        perAttrs.tabindex = "0";
        perAttrs.onClick = fire;
        perAttrs.onKeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } };
      }
      body.appendChild(el("p", perAttrs, `PER Roll ${perTarget}- (INT-based)`));
    }
    root.appendChild(section("Characteristics", body));
  }

  if (character.derived) {
    root.appendChild(section("Combat & Defenses",
      statGrid(character.derived, DERIVED_ORDER, DERIVED_NAMES, "stat-grid derived-grid")));
  }

  if (character.maneuvers && character.maneuvers.length) {
    root.appendChild(section("Martial Arts",
      el("div", { class: "maneuver-list" },
        character.maneuvers.map((m) => maneuverRow(m, character, onRollPower)))));
  }

  // Movement — 6E standard for everyone, overridable per character.
  const movement = { ...STANDARD_MOVEMENT, ...(character.movement || {}) };
  const moveOrder = [...MOVEMENT_ORDER, ...Object.keys(movement).filter((k) => !MOVEMENT_ORDER.includes(k))];
  root.appendChild(section("Movement", movementGrid(movement, moveOrder)));

  if (character.xp) {
    root.appendChild(section("Experience", xpTracker(character, onHealthChange)));
  }

  if (character.powers && character.powers.length) {
    root.appendChild(section("Powers",
      el("div", { class: "power-list" },
        character.powers.map((p) => powerCard(p, character, onRollPower)))));
  }

  // Day/Night power sets (Irie Blaze): a toggle picks the active set; a shared
  // set (if any) is always shown.
  if (character.powerSets) {
    const ps = character.powerSets;
    const cur = ps.sets[ps.current] ? ps.current : Object.keys(ps.sets)[0];
    const toggle = el("div", { class: "daynight-toggle" }, Object.keys(ps.sets).map((key) => {
      const isCur = key === cur;
      const attrs = { class: "seg" + (isCur ? " active" : ""), type: "button" };
      if (!isCur && typeof onTogglePowerSet === "function") attrs.onClick = () => onTogglePowerSet(character, key);
      return el("button", attrs, ps.sets[key].label);
    }));
    const body = el("div", {}, [
      toggle,
      el("div", { class: "power-list" }, ps.sets[cur].powers.map((p) => powerCard(p, character, onRollPower)))
    ]);
    if (ps.shared && ps.shared.powers.length) {
      body.appendChild(el("h3", { class: "vpp-subtitle" }, ps.shared.label || "Always Available"));
      body.appendChild(el("div", { class: "power-list" }, ps.shared.powers.map((p) => powerCard(p, character, onRollPower))));
    }
    root.appendChild(section("Powers", body));
  }

  if (character.vpp) {
    root.appendChild(section("Variable Power Pool", renderVpp(character, vppHandlers)));
  }

  if (character.skills && character.skills.length) {
    root.appendChild(section("Skills", plainList(character.skills)));
  }
  if (character.complications && character.complications.length) {
    root.appendChild(section("Complications", plainList(character.complications)));
  }

  // Downed banner + control lock. `downed` = 0 STUN/BODY (shown to everyone);
  // `locked` = downed on a player screen (GM keeps control). Health trackers
  // stay usable for tracking; only action/roll controls lock.
  if (downed) {
    const at0 = [];
    if (character.health?.STUN && character.health.STUN.current <= 0) at0.push("STUN");
    if (character.health?.BODY && character.health.BODY.current <= 0) at0.push("BODY");
    root.prepend(el("div", { class: "downed-banner" },
      `⚠ DOWN — 0 ${at0.join(" & ")}${locked ? " · actions locked (GM can still act)" : ""}`));
  }
  if (locked) {
    root.classList.add("sheet-locked");
    const SEL = ".roll-btn, .chip-btn, .ghost-btn, .stat-actionable, .roll-note-actionable, .seg, .self-check, .vpp-dice .step";
    root.querySelectorAll(SEL).forEach((elm) => {
      if (elm.tagName === "BUTTON" || elm.tagName === "INPUT") elm.disabled = true;
      elm.classList.add("locked-ctrl");
    });
  }

  return root;
}
