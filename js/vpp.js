// Double Helix's Variable Power Pool "spellbook" UI.
// Each power groups its delivery variants under `modes` (Touch / Ranged /
// Area). Allocating reserves the SELECTED mode's AP from the 40-AP pool; a
// delivery toggle swaps modes (re-checked against the pool). Powers are either
// rolled live (Use / Attack) or GM-adjudicated (Activate — logged, no dice).
//
// State lives on character.vpp.activeSlots = [{ id, mode }], so a full sheet
// re-render rebuilds the UI. Handlers (from app.js):
//   onAllocate(character, id), onRemove(character, id),
//   onSetMode(character, id, modeKey), onRollVpp(character, entry, modeKey),
//   onControlRoll(character).

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

const getMode = (entry, key) => entry.modes.find((m) => m.deliveryMode === key) || entry.modes[0];

// Compact per-mode summary for a library row, e.g. "Touch 8d6/40 · Ranged 4d6/30".
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
  const { onAllocate, onRemove, onSetMode, onRollVpp, onControlRoll } = handlers;
  const vpp = character.vpp;
  const byId = Object.fromEntries(vpp.library.map((e) => [e.id, e]));
  const slots = vpp.activeSlots || [];
  const apOf = (slot) => { const e = byId[slot.id]; return e ? getMode(e, slot.mode).activeCost : 0; };
  const used = slots.reduce((s, slot) => s + apOf(slot), 0);
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
      const adjudicated = entry.rollType === "adjudicated";

      // delivery toggle (only when >1 mode)
      let toggle = null;
      if (entry.modes.length > 1 && onSetMode) {
        toggle = el("div", { class: "vpp-toggle" }, entry.modes.map((m) => {
          const isSel = m.deliveryMode === slot.mode;
          // would switching fit? (pool minus this slot's current AP, plus the new mode)
          const fits = (used - mode.activeCost + m.activeCost) <= vpp.poolSize;
          const attrs = { class: "seg" + (isSel ? " active" : ""), type: "button",
            title: `${m.dice ? m.dice + ", " : ""}${m.activeCost} AP, ${m.endCost} END` };
          if (isSel) { /* no-op */ }
          else if (!fits) { attrs.disabled = "disabled"; attrs.title += " — won't fit pool"; }
          else { attrs.onClick = () => onSetMode(character, entry.id, m.deliveryMode); }
          return el("button", attrs, DELIVERY_LABEL[m.deliveryMode] || m.deliveryMode);
        }));
      }

      const metaBits = [];
      if (mode.dice) metaBits.push(mode.dice);
      metaBits.push(`${mode.activeCost} AP`);
      metaBits.push(`${mode.endCost} END`);
      if (adjudicated) metaBits.push("GM-adjudicated");

      return el("div", { class: "vpp-slot" + (adjudicated ? " adjudicated" : "") }, [
        el("div", { class: "vpp-slot-info" }, [
          el("span", { class: "vpp-name" }, entry.name),
          toggle,
          el("span", { class: "vpp-power-meta" }, metaBits.join(" · ")),
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
      const cheapest = Math.min(...entry.modes.map((m) => m.activeCost));
      const fits = cheapest <= remaining;
      const disabled = isActive || !fits;
      const label = isActive ? "Allocated" : "Allocate";
      const title = isActive ? "Already allocated"
        : fits ? "Allocate (uses the strongest delivery that fits)"
        : `Needs ${cheapest} AP — only ${remaining} free`;
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
