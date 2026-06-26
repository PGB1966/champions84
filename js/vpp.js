// Double Helix's Variable Power Pool "spellbook" UI.
// Each power groups its delivery variants under `modes` (Touch / Ranged /
// Area). Allocating reserves AP from the 40-AP pool; a power can be allocated
// PARTIALLY (fewer dice → proportionally less AP), so several partial powers
// can share the pool. A delivery toggle swaps modes. Powers are either rolled
// live (Use / Attack) or GM-adjudicated (Activate — logged, no dice).
//
// State: character.vpp.activeSlots = [{ id, mode, dice, self }] where `dice` is
// the allocated dice count (≤ the mode's max) and `self` marks a boost as
// targeting Double Helix himself. A full sheet re-render rebuilds the UI.
import { parseDiceCount } from "./dice/dice.js";

export const DELIVERY_LABEL = {
  self_or_touch: "Self/Touch",
  ranged: "Ranged",
  area_selective: "3m Area"
};
const CATEGORY_ORDER = ["Boost", "Drain", "Suppress", "Healing", "Attack", "Control", "Defense", "Utility"];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null && v !== false) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export const getMode = (entry, key) => entry.modes.find((m) => m.deliveryMode === key) || entry.modes[0];
export const modeMaxDice = (mode) => (mode && mode.dice ? parseDiceCount(mode.dice) : 0);
const clampDice = (d, max) => Math.max(1, Math.min(max, d || max));

// AP / END a slot reserves, scaled to its allocated dice (full when no dice).
export function apAt(mode, dice) {
  const max = modeMaxDice(mode);
  if (!max) return mode.activeCost;
  return Math.round(mode.activeCost * clampDice(dice, max) / max);
}
export function endAt(mode, dice) {
  const max = modeMaxDice(mode);
  if (!max) return mode.endCost || 0;
  return mode.endCost ? Math.max(1, Math.round(mode.endCost * clampDice(dice, max) / max)) : 0;
}
export function slotAP(entry, slot) { return apAt(getMode(entry, slot.mode), slot.dice); }

const isBoostToChar = (entry) => entry.rollType === "addToCharacteristic" && entry.target && entry.target !== "SPD";

function modeSummary(entry) {
  return entry.modes.map((m) => {
    const lbl = DELIVERY_LABEL[m.deliveryMode] || m.deliveryMode;
    return m.dice ? `${lbl} ${m.dice}/${m.activeCost}` : `${lbl} ${m.activeCost}`;
  }).join(" · ") + " AP";
}

function useLabel(entry) {
  if (entry.rollType === "adjudicated") return "Activate";
  if (entry.rollType === "attackRoll") return "Attack";
  return "Use";
}

export function renderVpp(character, handlers = {}) {
  const { onAllocate, onRemove, onSetMode, onSetDice, onRollVpp, onControlRoll } = handlers;
  const vpp = character.vpp;
  const byId = Object.fromEntries(vpp.library.map((e) => [e.id, e]));
  const slots = vpp.activeSlots || [];
  const used = slots.reduce((s, slot) => s + (byId[slot.id] ? slotAP(byId[slot.id], slot) : 0), 0);
  const remaining = vpp.poolSize - used;

  const root = el("div", { class: "vpp" });

  // --- pool header -----------------------------------------------------
  const pct = vpp.poolSize > 0 ? Math.min(100, (used / vpp.poolSize) * 100) : 0;
  root.appendChild(el("div", { class: "vpp-head" }, [
    el("div", { class: "vpp-pool" }, [
      el("div", { class: "vpp-pool-top" }, [
        el("span", {}, `Pool ${used} / ${vpp.poolSize} AP`),
        el("span", { class: "vpp-remaining" }, `${remaining} free`)
      ]),
      el("div", { class: "vpp-bar" }, [el("div", { class: "vpp-fill", style: `width:${pct}%` })])
    ]),
    el("div", { class: "vpp-meta" }, [
      el("span", { class: "chip" }, vpp.descriptor),
      el("span", { class: "chip" }, `Control ${vpp.controlCost} CP`),
      onControlRoll
        ? el("button", { class: "ghost-btn", type: "button", onClick: () => onControlRoll(character) }, `Control Roll ${vpp.controlRoll}-`)
        : el("span", { class: "chip" }, `Control ${vpp.controlRoll}-`)
    ])
  ]));

  // --- active slots ----------------------------------------------------
  root.appendChild(el("h3", { class: "vpp-subtitle" }, "Active Allocation"));
  if (slots.length === 0) {
    root.appendChild(el("p", { class: "vpp-empty" }, "Nothing allocated. Pick powers from the library below."));
  } else {
    root.appendChild(el("div", { class: "vpp-active" }, slots.map((slot) => {
      const entry = byId[slot.id];
      if (!entry) return null;
      const mode = getMode(entry, slot.mode);
      const max = modeMaxDice(mode);
      const dice = clampDice(slot.dice, max);
      const adjudicated = entry.rollType === "adjudicated";

      // delivery toggle (only when >1 mode)
      let toggle = null;
      if (entry.modes.length > 1 && onSetMode) {
        toggle = el("div", { class: "vpp-toggle" }, entry.modes.map((m) => {
          const isSel = m.deliveryMode === slot.mode;
          const fits = (used - slotAP(entry, slot) + apAt(m, dice)) <= vpp.poolSize;
          const attrs = { class: "seg" + (isSel ? " active" : ""), type: "button",
            title: `${m.dice ? m.dice + ", " : ""}${m.activeCost} AP, ${m.endCost} END` };
          if (!isSel && !fits) { attrs.disabled = "disabled"; attrs.title += " — won't fit pool"; }
          else if (!isSel) attrs.onClick = () => onSetMode(character, entry.id, m.deliveryMode);
          return el("button", attrs, DELIVERY_LABEL[m.deliveryMode] || m.deliveryMode);
        }));
      }

      // dice stepper (partial allocation) for dice-based powers
      let stepper = null;
      if (max && onSetDice) {
        const canDown = dice > 1;
        const canUp = dice < max && (used - slotAP(entry, slot) + apAt(mode, dice + 1)) <= vpp.poolSize;
        stepper = el("div", { class: "vpp-dice" }, [
          el("button", { class: "step", type: "button", disabled: canDown ? null : "disabled",
            onClick: canDown ? () => onSetDice(character, entry.id, dice - 1) : null }, "−"),
          el("span", { class: "vpp-dice-val" }, `${dice}d6`),
          el("button", { class: "step", type: "button", disabled: canUp ? null : "disabled",
            onClick: canUp ? () => onSetDice(character, entry.id, dice + 1) : null }, "+"),
          el("span", { class: "vpp-dice-cap" }, `of ${max}d6`)
        ]);
      }

      const metaBits = [`${apAt(mode, dice)} AP`, `${endAt(mode, dice)} END`];
      if (adjudicated) metaBits.push("GM-adjudicated");

      // self / ally checkbox for boosts that target a characteristic
      let selfRow = null;
      if (isBoostToChar(entry)) {
        const cb = el("input", { type: "checkbox", class: "self-check" });
        cb.checked = slot.self !== false; // default on
        cb.addEventListener("change", () => { slot.self = cb.checked; });
        selfRow = el("label", { class: "vpp-self", title: "On = boost yourself (updates your Characteristics). Off = boosting an ally." },
          [cb, el("span", {}, `Apply ${entry.target} to me`)]);
      }

      return el("div", { class: "vpp-slot" + (adjudicated ? " adjudicated" : "") }, [
        el("div", { class: "vpp-slot-info" }, [
          el("span", { class: "vpp-name" }, entry.name),
          toggle,
          stepper,
          el("span", { class: "vpp-power-meta" }, metaBits.join(" · ")),
          selfRow,
          adjudicated && entry.description ? el("span", { class: "vpp-adj-note" }, entry.description) : null
        ]),
        el("div", { class: "vpp-slot-actions" }, [
          onRollVpp ? el("button", { class: "roll-btn", type: "button", onClick: () => onRollVpp(character, entry, slot.mode) }, useLabel(entry)) : null,
          onRemove ? el("button", { class: "ghost-btn", type: "button", title: "Deallocate", onClick: () => onRemove(character, entry.id) }, "Remove") : null
        ])
      ]);
    })));
  }

  // --- library (grouped by category) -----------------------------------
  root.appendChild(el("h3", { class: "vpp-subtitle" }, "Library"));
  const activeIds = new Set(slots.map((s) => s.id));
  const cats = [...new Set(vpp.library.map((e) => e.category))]
    .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));

  for (const cat of cats) {
    const rows = vpp.library.filter((e) => e.category === cat).map((entry) => {
      const isActive = activeIds.has(entry.id);
      // fits if any mode can be allocated at >= 1 die within remaining AP
      const fits = entry.modes.some((m) => {
        const max = modeMaxDice(m);
        return max ? (m.activeCost / max) <= remaining : m.activeCost <= remaining;
      });
      const disabled = isActive || !fits;
      const label = isActive ? "Allocated" : "Allocate";
      const title = isActive ? "Already allocated"
        : fits ? "Allocate (largest delivery/dice that fits; adjust after)"
        : `Not enough free AP (${remaining} left)`;
      return el("div", { class: "vpp-lib-row" + (isActive ? " is-active" : "") }, [
        el("div", { class: "vpp-slot-info" }, [
          el("div", { class: "vpp-lib-name" }, [
            el("span", { class: "vpp-name" }, entry.name),
            entry.rollType === "adjudicated" ? el("span", { class: "gm-tag" }, "GM") : null
          ]),
          el("span", { class: "vpp-power-meta" }, modeSummary(entry))
        ]),
        onAllocate ? el("button", {
          class: "chip-btn", type: "button", disabled: disabled ? "disabled" : null, title,
          onClick: disabled ? null : () => onAllocate(character, entry.id)
        }, label) : null
      ]);
    });
    root.appendChild(el("div", { class: "vpp-cat" }, [
      el("div", { class: "vpp-cat-title" }, cat),
      el("div", { class: "vpp-lib" }, rows)
    ]));
  }

  return root;
}
