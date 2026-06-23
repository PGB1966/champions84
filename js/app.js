// Bootstrap + hash router.
// Hash routing (#/mike) keeps deployment to GitHub Pages trivial — no server
// rewrite rules needed, every route resolves to this one index.html.
import { characters, routes, routeOrder } from "./data/index.js";
import { renderCharacter, renderDashboard } from "./render.js";
import { buildRollPanel } from "./rollpanel.js";
import { DELIVERY_LABEL } from "./vpp.js";
import { rollPower, pulledEndCost, rollCheck, rollEffectDice } from "./dice/hero.js";
import { describePower, describeCheck, describeVpp } from "./dice/format.js";
import { addRoll, initLog } from "./log.js";

const appEl = document.getElementById("app");
const navEl = document.getElementById("route-nav");

// Roll panel is built once and persists across route changes.
const rollPanel = buildRollPanel();
document.querySelector(".layout").appendChild(rollPanel.element);

// Connect the shared roll log (no-op / local-only until Firebase is configured).
initLog();

function whoLabel(character) {
  return `${character.player ? character.player + " · " : ""}${character.name}`;
}

// Pay END from the character's pool (clamped at 0). Appends a log line and
// returns true if a deduction happened (caller re-renders to update the bar).
function deductEnd(character, endCost, lines) {
  const pool = character.health?.END;
  if (!(endCost > 0 && pool)) return false;
  const before = pool.current;
  pool.current = Math.max(0, before - endCost);
  const spent = before - pool.current;
  lines.push(spent < endCost
    ? `END: −${spent} (${before} → 0) — short ${endCost - spent}, push or take STUN`
    : `END: −${endCost} (${before} → ${pool.current})`);
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
      targetDcv: rollPanel.getTargetDcv(),
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
const vppMode = (entry, key) => entry.modes.find((m) => m.deliveryMode === key) || entry.modes[0];

function vppUsedAP(vpp) {
  return (vpp.activeSlots || []).reduce((s, slot) => {
    const e = vppEntry(vpp, slot.id);
    return s + (e ? vppMode(e, slot.mode).activeCost : 0);
  }, 0);
}

function onAllocateVpp(character, id) {
  const vpp = character.vpp;
  if (vpp.activeSlots.some((s) => s.id === id)) return;
  const entry = vppEntry(vpp, id);
  if (!entry) return;
  const remaining = vpp.poolSize - vppUsedAP(vpp);
  // Strongest mode (listed first) that fits the remaining pool.
  const mode = entry.modes.find((m) => m.activeCost <= remaining);
  if (!mode) return;
  vpp.activeSlots.push({ id, mode: mode.deliveryMode });
  route();
}

function onSetVppMode(character, id, modeKey) {
  const vpp = character.vpp;
  const slot = vpp.activeSlots.find((s) => s.id === id);
  const entry = vppEntry(vpp, id);
  if (!slot || !entry) return;
  const next = entry.modes.find((m) => m.deliveryMode === modeKey);
  if (!next) return;
  const usedOthers = vppUsedAP(vpp) - vppMode(entry, slot.mode).activeCost;
  if (next.activeCost > vpp.poolSize - usedOthers) return; // wouldn't fit
  slot.mode = modeKey;
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

// Use an allocated VPP power in its selected delivery mode: roll live (attack /
// effect dice) or, for adjudicated powers, just log the activation. Pays END.
function onRollVpp(character, entry, modeKey) {
  const mode = vppMode(entry, modeKey);
  let lines;
  if (entry.rollType === "adjudicated") {
    lines = ["Activated — effect adjudicated by GM (no die roll)"];
  } else if (entry.rollType === "attackRoll") {
    const power = { name: entry.name, type: "Blast", totalDice: mode.dice, damageType: entry.damageType || "normal" };
    lines = describePower(rollPower({
      power, ocv: character.derived?.OCV ?? 0, targetDcv: rollPanel.getTargetDcv(), rng: Math.random
    }));
  } else {
    lines = [describeVpp({ ...entry, dice: mode.dice }, rollEffectDice({ dice: mode.dice, rng: Math.random }))];
  }
  if (entry.note) lines.push(entry.note);
  if (mode.note) lines.push(mode.note);

  const endCost = mode.endCost || 0;
  deductEnd(character, endCost, lines);

  const delivery = DELIVERY_LABEL[modeKey] || modeKey;
  addRoll({ who: whoLabel(character), label: `${entry.name} — ${delivery} (${endCost} END)`, lines });
  route();
}

const vppHandlers = {
  onAllocate: onAllocateVpp,
  onRemove: onRemoveVpp,
  onSetMode: onSetVppMode,
  onRollVpp,
  onControlRoll: onControlRollVpp
};

function currentRoute() {
  const slug = (location.hash.replace(/^#\/?/, "") || "").trim();
  return slug; // "" => GM dashboard
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

  const gm = link("", "GM", active === "");
  navEl.appendChild(gm);

  for (const slug of routeOrder) {
    const def = routes[slug];
    navEl.appendChild(link(slug, def.player, active === slug));
  }

  function link(slug, label, isActive) {
    const a = document.createElement("a");
    a.href = `#/${slug}`;
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

// Health edits mutate the in-memory pool (render.js already clamped it); this
// session just re-renders. Firebase persistence is wired in a later step.
function onHealthChange() {
  route();
}

function renderRoute(slug) {
  appEl.replaceChildren();

  if (slug === "") {
    const items = Object.values(characters).map((c) => ({ character: c, slug: slugForCharacter(c.id) }));
    appEl.appendChild(renderDashboard(items, { onHealthChange }));
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
    appEl.appendChild(renderCharacter(characters[ids[0]], { onHealthChange, onRollPower, onRollCheck, onTogglePowerSet, vppHandlers }));
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
    body.replaceChildren(renderCharacter(characters[activeId], { onHealthChange, onRollPower, onRollCheck, onTogglePowerSet, vppHandlers }));
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
