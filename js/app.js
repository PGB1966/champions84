// Bootstrap + hash router.
// Hash routing (#/mike) keeps deployment to GitHub Pages trivial — no server
// rewrite rules needed, every route resolves to this one index.html.
import { characters, routes, routeOrder } from "./data/index.js";
import { renderCharacter, renderDashboard } from "./render.js";
import { buildRollPanel } from "./rollpanel.js";
import { DELIVERY_LABEL, getMode, modeMaxDice, apAt, endAt, slotAP } from "./vpp.js";
import { rollPower, pulledEndCost, rollCheck, rollEffectDice } from "./dice/hero.js";
import { describePower, describeCheck, describeVpp } from "./dice/format.js";
import { addRoll, initLog, setPhase, setCharacterOverride, setCharacterCurrent, subscribeCharacters } from "./log.js";

const appEl = document.getElementById("app");
const navEl = document.getElementById("route-nav");

// GM mode is opt-in via ?gm in the URL, so players' links never reveal the GM
// dashboard or controls. The GM bookmarks  …/champions84/?gm=1#/
const IS_GM = new URLSearchParams(location.search).has("gm");

// Manual dice-tool rolls are attributed to whoever's screen it is: the current
// player route, or "GM" on the dashboard.
function currentRoller() {
  const slug = currentRoute();
  if (slug && routes[slug]) return routes[slug].player;
  return "GM";
}

// Roll panel is built once and persists across route changes.
const rollPanel = buildRollPanel({ isGM: IS_GM, getRoller: currentRoller });
document.querySelector(".layout").appendChild(rollPanel.element);

// Connect the shared roll log (no-op / local-only until Firebase is configured).
initLog();

// Apply GM-edited characteristic overrides (synced) onto the in-memory
// characters, then re-render so players see the GM's changes live.
function applyCharOverrides(data) {
  for (const [id, ov] of Object.entries(data || {})) {
    const c = characters[id];
    if (!c || !ov) continue;
    if (ov.characteristics && c.characteristics) Object.assign(c.characteristics, ov.characteristics);
    if (ov.derived && c.derived) Object.assign(c.derived, ov.derived);
    if (typeof ov.rec === "number") c.rec = ov.rec;
    if (ov.movement) c.movement = { ...(c.movement || {}), ...ov.movement };
    if (ov.maxima && c.health) {
      for (const k of Object.keys(ov.maxima)) {
        if (!c.health[k]) continue;
        c.health[k].max = ov.maxima[k];
        if (c.health[k].current > c.health[k].max) c.health[k].current = c.health[k].max; // clamp on decrease
      }
    }
    if (ov.current && c.health) {
      for (const k of Object.keys(ov.current)) {
        if (c.health[k] && typeof ov.current[k] === "number") {
          c.health[k].current = Math.max(0, Math.min(c.health[k].max, ov.current[k]));
        }
      }
    }
  }
  route();
}
subscribeCharacters(applyCharOverrides);

// Push a character's current STUN/BODY/END to the shared state (dual control).
function syncHealth(character) {
  const h = character.health;
  if (!h) return;
  const current = {};
  for (const k of ["STUN", "BODY", "END"]) if (h[k]) current[k] = h[k].current;
  setCharacterCurrent(character.id, current);
}

// GM writes a character's full stat override from the dashboard.
function onSetChar(id, override) {
  setCharacterOverride(id, override);
}

// Recovery: restore STUN and END by REC (capped at max). Logs the actual gain.
function onRecover(character) {
  const rec = character.rec || 0;
  const lines = [];
  for (const k of ["STUN", "END"]) {
    const pool = character.health?.[k];
    if (!pool) continue;
    const before = pool.current;
    pool.current = Math.min(pool.max, before + rec);
    lines.push(`${k}: +${pool.current - before} (${before} → ${pool.current})`);
  }
  addRoll({ who: whoLabel(character), label: `Recovery (REC ${rec})`, lines });
  syncHealth(character);
  route();
}

function whoLabel(character) {
  return `${character.player ? character.player + " · " : ""}${character.name}`;
}

// STUN spent per 1 END of shortfall when a character runs out of END (6E:
// 1 STUN = 1 END). Table-confirmable — change here if your group differs.
const STUN_PER_END = 1;

// Pay an END cost from the character's END pool; once END hits 0, pay the
// remainder from STUN automatically (Hero "using STUN for END"). Appends a log
// line and returns true if anything was spent (caller re-renders the bars).
function deductEnd(character, endCost, lines) {
  const pool = character.health?.END;
  if (!(endCost > 0 && pool)) return false;

  const endBefore = pool.current;
  pool.current = Math.max(0, endBefore - endCost);
  const endSpent = endBefore - pool.current;
  const shortfall = endCost - endSpent;

  if (shortfall <= 0) {
    lines.push(`END: −${endCost} (${endBefore} → ${pool.current})`);
    return true;
  }

  // Out of END — cover the rest with STUN.
  const stun = character.health?.STUN;
  if (!stun) {
    lines.push(`END: −${endSpent} (${endBefore} → 0) — short ${shortfall} END`);
    return true;
  }
  const stunNeed = shortfall * STUN_PER_END;
  const stunBefore = stun.current;
  stun.current = Math.max(0, stunBefore - stunNeed);
  const stunTaken = stunBefore - stun.current;

  const endPart = endSpent > 0 ? `END: −${endSpent} (${endBefore} → 0); ` : "out of END; ";
  let line = `${endPart}took ${stunTaken} STUN for ${shortfall} END (STUN ${stunBefore} → ${stun.current})`;
  if (stunTaken < stunNeed) line += ` — also out of STUN, short ${stunNeed - stunTaken}`;
  lines.push(line);
  return true;
}

// Resolve a power through the dice engine, pay its END, and post to the log.
// Attacks (damageType / rollType "attackRoll") do to-hit + damage and accept
// `chosenDice` to pull the punch. Other powers with a rollType (Aid, Heal,
// Telepathy, Transform, …) roll effect dice and report the summed effect.
function onRollPower(character, power, chosenDice) {
  const isAttack = Boolean(power.damageType) || power.rollType === "attackRoll";
  let lines, label, endCost;

  if (isAttack) {
    const result = rollPower({
      power: { type: "Blast", ...power },
      ocv: character.derived?.OCV ?? 0,
      dice: chosenDice,
      rng: Math.random
    });
    lines = describePower(result);
    endCost = pulledEndCost(power, result.dice);
    label = `${power.name} — ${result.dice}d6 (${endCost} END${result.pulled ? ", pulled" : ""})`;
  } else {
    lines = [describeVpp({ ...power, dice: power.totalDice }, rollEffectDice({ dice: power.totalDice, rng: Math.random }))];
    if (power.note) lines.push(power.note);
    endCost = power.endCost || 0;
    label = `${power.name} (${endCost} END)`;
  }

  deductEnd(character, endCost, lines);
  addRoll({ who: whoLabel(character), label, lines });
  syncHealth(character); // END/STUN spend is shared
  route(); // reflect END spend / keep tab state consistent
}

function onTogglePowerSet(character, key) {
  if (character.powerSets && character.powerSets.sets[key]) {
    character.powerSets.current = key;
    route();
  }
}

// Roll a 3d6 characteristic / PER check (no END, no re-render needed).
function onRollCheck(character, label, target) {
  const r = rollCheck({ target, rng: Math.random });
  addRoll({ who: whoLabel(character), label: `${label} Roll (${target}-)`, lines: [describeCheck(r)] });
}

// --- VPP (Double Helix) ----------------------------------------------------
const vppEntry = (vpp, id) => vpp.library.find((e) => e.id === id);

function vppUsedAP(vpp) {
  return (vpp.activeSlots || []).reduce((s, slot) => {
    const e = vppEntry(vpp, slot.id);
    return s + (e ? slotAP(e, slot) : 0);
  }, 0);
}

// Allocate at the strongest delivery, and the most dice, that fit the pool now.
function onAllocateVpp(character, id) {
  const vpp = character.vpp;
  if (vpp.activeSlots.some((s) => s.id === id)) return;
  const entry = vppEntry(vpp, id);
  if (!entry) return;
  const remaining = vpp.poolSize - vppUsedAP(vpp);
  for (const mode of entry.modes) {
    const max = modeMaxDice(mode);
    if (!max) {
      if (mode.activeCost <= remaining) {
        vpp.activeSlots.push({ id, mode: mode.deliveryMode });
        return route();
      }
      continue;
    }
    const fitDice = Math.min(max, Math.floor(remaining / (mode.activeCost / max)));
    if (fitDice >= 1) {
      vpp.activeSlots.push({ id, mode: mode.deliveryMode, dice: fitDice, self: mode.deliveryMode === "self_or_touch" });
      return route();
    }
  }
}

// Change an allocated power's dice (partial allocation), if it still fits.
function onSetVppDice(character, id, dice) {
  const vpp = character.vpp;
  const slot = vpp.activeSlots.find((s) => s.id === id);
  const entry = vppEntry(vpp, id);
  if (!slot || !entry) return;
  const mode = getMode(entry, slot.mode);
  const max = modeMaxDice(mode);
  const next = Math.max(1, Math.min(max, dice));
  const usedOthers = vppUsedAP(vpp) - slotAP(entry, slot);
  if (apAt(mode, next) > vpp.poolSize - usedOthers) return; // wouldn't fit
  slot.dice = next;
  route();
}

function onSetVppMode(character, id, modeKey) {
  const vpp = character.vpp;
  const slot = vpp.activeSlots.find((s) => s.id === id);
  const entry = vppEntry(vpp, id);
  if (!slot || !entry) return;
  const next = entry.modes.find((m) => m.deliveryMode === modeKey);
  if (!next) return;
  const usedOthers = vppUsedAP(vpp) - slotAP(entry, slot);
  if (apAt(next, slot.dice) > vpp.poolSize - usedOthers) return; // wouldn't fit
  slot.mode = modeKey;
  slot.dice = Math.min(slot.dice || modeMaxDice(next), modeMaxDice(next)) || undefined;
  route();
}

function onRemoveVpp(character, id) {
  const vpp = character.vpp;
  vpp.activeSlots = vpp.activeSlots.filter((s) => s.id !== id);
  route();
}

function onControlRollVpp(character) {
  const target = character.vpp.controlRoll || 11;
  const r = rollCheck({ target, rng: Math.random });
  addRoll({ who: whoLabel(character), label: `VPP Control Roll (${target}-)`, lines: [describeCheck(r)] });
}

function onClearBoosts(character) {
  character.boosts = {};
  route();
}

// Use an allocated VPP power in its selected delivery mode at its allocated
// dice: roll live (attack / effect) or, for adjudicated powers, log the
// activation. Self-targeted boosts update the character's Characteristics.
function onRollVpp(character, entry, modeKey) {
  const mode = getMode(entry, modeKey);
  const slot = (character.vpp.activeSlots || []).find((s) => s.id === entry.id) || {};
  const max = modeMaxDice(mode);
  const dice = max ? Math.max(1, Math.min(max, slot.dice || max)) : 0;
  const diceExpr = `${dice}d6`;
  let lines;

  if (entry.rollType === "adjudicated") {
    lines = ["Activated — effect adjudicated by GM (no die roll)"];
  } else if (entry.rollType === "attackRoll") {
    const power = { name: entry.name, type: "Blast", totalDice: diceExpr, damageType: entry.damageType || "normal" };
    lines = describePower(rollPower({
      power, ocv: character.derived?.OCV ?? 0, rng: Math.random
    }));
  } else {
    const r = rollEffectDice({ dice: diceExpr, rng: Math.random });
    lines = [describeVpp({ ...entry, dice: diceExpr }, r)];
    // Self-targeted Aid to a characteristic updates the sheet.
    if (entry.rollType === "addToCharacteristic" && slot.self !== false) {
      const t = entry.target;
      if (t === "SPD") {
        lines.push("SPD Aid: apply per the SPD conversion table (not auto-applied).");
      } else if (t && character.characteristics && character.characteristics[t] != null) {
        character.boosts = character.boosts || {};
        character.boosts[t] = (character.boosts[t] || 0) + r.total;
        const base = character.characteristics[t];
        lines.push(`Applied to self: ${t} ${base} → ${base + character.boosts[t]} (boost +${character.boosts[t]})`);
      }
    }
  }
  if (entry.note) lines.push(entry.note);
  if (mode.note) lines.push(mode.note);

  const endCost = endAt(mode, dice);
  deductEnd(character, endCost, lines);

  const delivery = DELIVERY_LABEL[modeKey] || modeKey;
  const diceLabel = max ? ` ${diceExpr}` : "";
  addRoll({ who: whoLabel(character), label: `${entry.name} — ${delivery}${diceLabel} (${endCost} END)`, lines });
  syncHealth(character); // END/STUN spend is shared
  route();
}

const vppHandlers = {
  onAllocate: onAllocateVpp,
  onRemove: onRemoveVpp,
  onSetMode: onSetVppMode,
  onSetDice: onSetVppDice,
  onRollVpp,
  onControlRoll: onControlRollVpp
};

function currentRoute() {
  const slug = (location.hash.replace(/^#\/?/, "") || "").trim();
  return slug; // "" => GM dashboard
}

// A character is "down" at 0 STUN (KO) or 0 BODY (dying) — can't act.
function isDowned(c) {
  const h = c.health || {};
  return (h.STUN && h.STUN.current <= 0) || (h.BODY && h.BODY.current <= 0);
}

// Shared render options; a downed character's controls lock on player screens
// (locked), but the GM can always act (IS_GM).
function sheetOptions(character) {
  const downed = isDowned(character);
  return {
    onHealthChange, onRollPower, onRollCheck, onTogglePowerSet, onClearBoosts, onRecover, vppHandlers,
    downed, locked: downed && !IS_GM
  };
}

// Which player route shows a given character (for dashboard sheet links).
function slugForCharacter(id) {
  for (const slug of routeOrder) {
    if ((routes[slug].characterIds || []).includes(id)) return slug;
  }
  return "";
}

function buildNav() {
  navEl.replaceChildren();
  const active = currentRoute();

  // GM tab only in GM mode, so players' screens never show it.
  if (IS_GM) navEl.appendChild(link("", "GM", active === ""));

  for (const slug of routeOrder) {
    const def = routes[slug];
    navEl.appendChild(link(slug, def.player, active === slug));
  }

  function link(slug, label, isActive) {
    const a = document.createElement("a");
    a.href = IS_GM ? `?gm=1#/${slug}` : `#/${slug}`; // keep GM mode across nav
    a.textContent = label;
    a.className = "route-link" + (isActive ? " active" : "");
    return a;
  }
}

function renderNotice(title, msg) {
  const wrap = document.createElement("div");
  wrap.className = "notice";
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = msg;
  wrap.append(h, p);
  return wrap;
}

// Health edits mutate the in-memory pool (render.js clamps it). Sync current
// STUN/BODY/END for health kinds (dual control); XP changes just re-render.
function onHealthChange(character, kind) {
  if (character && (kind === "STUN" || kind === "BODY" || kind === "END")) syncHealth(character);
  route();
}

function renderRoute(slug) {
  appEl.replaceChildren();

  if (slug === "") {
    if (!IS_GM) {
      // Players don't get the all-PC GM dashboard; offer a simple chooser.
      const note = renderNotice("Champions '84", "Open your character from the tabs above.");
      appEl.appendChild(note);
      return;
    }
    const items = Object.values(characters).map((c) => ({ character: c, slug: slugForCharacter(c.id) }));
    appEl.appendChild(renderDashboard(items, { onHealthChange, onSetPhase: setPhase, onSetChar }));
    return;
  }

  const def = routes[slug];
  if (!def) {
    appEl.appendChild(renderNotice("Unknown route", `No player at “/${slug}”.`));
    return;
  }

  const ids = (def.characterIds || []).filter((id) => characters[id]);
  if (ids.length === 0) {
    appEl.appendChild(renderNotice(
      `${def.player} — not yet built`,
      "This character's schema hasn't been converted yet. Coming in a later session."
    ));
    return;
  }

  // Single character: render directly. Multiple: render as tabs.
  if (ids.length === 1) {
    appEl.appendChild(renderCharacter(characters[ids[0]], sheetOptions(characters[ids[0]])));
    return;
  }
  appEl.appendChild(renderTabs(ids));
}

function renderTabs(ids) {
  const wrap = document.createElement("div");
  wrap.className = "tabbed";

  const tabBar = document.createElement("div");
  tabBar.className = "tab-bar";
  const body = document.createElement("div");
  body.className = "tab-body";

  let activeId = ids[0];

  function paint() {
    body.replaceChildren(renderCharacter(characters[activeId], sheetOptions(characters[activeId])));
    [...tabBar.children].forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.id === activeId);
    });
  }

  ids.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.id = id;
    btn.textContent = characters[id].name;
    btn.addEventListener("click", () => { activeId = id; paint(); });
    tabBar.appendChild(btn);
  });

  wrap.append(tabBar, body);
  paint();
  return wrap;
}

function route() {
  buildNav();
  renderRoute(currentRoute());
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
// In case the module loads after DOMContentLoaded has already fired.
if (document.readyState !== "loading") route();
