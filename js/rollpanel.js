// Right-hand roll panel: a read-only phase indicator, manual dice tools, and
// the live roll-log feed. Attack/to-hit rolls report the DCV they hit (no
// target entry needed). The GM "private rolls" switch only appears in GM mode.
import { rollToHit, rollNormalDamage, rollKillingDamage, rollKnockback, rollEffectDice } from "./dice/hero.js";
import { describeToHit, describeNormal, describeKilling, describeKnockback } from "./dice/format.js";
import { addRoll, subscribe, getRolls, clearRolls, subscribeStatus, setPrivateMode, getPrivateMode, subscribePhase } from "./log.js";

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

function numField(label, value, min = 0) {
  const input = el("input", { type: "number", value: String(value), min: String(min), class: "num" });
  const wrap = el("label", { class: "field" }, [el("span", {}, label), input]);
  return { wrap, input, get: () => parseInt(input.value, 10) || 0 };
}

function tool(title, fields, onRoll) {
  const inputs = fields.map((f) => numField(f.label, f.value, f.min));
  const btn = el("button", { class: "roll-btn", type: "button",
    onClick: () => onRoll(inputs.map((i) => i.get())) }, "Roll");
  return el("div", { class: "tool" }, [
    el("div", { class: "tool-title" }, title),
    el("div", { class: "tool-row" }, [...inputs.map((i) => i.wrap), btn])
  ]);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logEntry(rec) {
  return el("div", { class: "log-entry" + (rec.private ? " private" : "") }, [
    el("div", { class: "log-head" }, [
      el("span", { class: "log-who" }, rec.who),
      el("span", { class: "log-time" }, fmtTime(rec.ts))
    ]),
    el("div", { class: "log-head-row" }, [
      rec.label ? el("div", { class: "log-label" }, rec.label) : null,
      rec.private ? el("span", { class: "priv-tag" }, "🔒 private") : null
    ]),
    ...(rec.lines || []).map((line) => el("div", { class: "log-line" }, line))
  ]);
}

// Read-only phase indicator (1–12). Synced; the GM drives it from the dashboard.
function buildPhaseIndicator() {
  const seg = el("span", { class: "phase-seg" });
  const bar = el("div", { class: "phase-strip" });
  for (let i = 1; i <= 12; i++) bar.appendChild(el("span", { class: "phase-pip", dataset: String(i) }));
  function paint(n) {
    seg.textContent = `Phase ${n} / 12`;
    [...bar.children].forEach((pip, idx) => pip.classList.toggle("on", idx < n));
  }
  subscribePhase(paint);
  return el("div", { class: "phase-box" }, [el("div", { class: "phase-head" }, [el("span", { class: "tool-title" }, "Phase"), seg]), bar]);
}

export function buildRollPanel({ isGM = false, getRoller } = {}) {
  const panel = el("aside", { class: "roll-panel" });
  // Who a manual roll is attributed to (current player's screen, or GM).
  const roller = () => (typeof getRoller === "function" ? getRoller() : "Dice Tools");

  // GM private rolls toggle (GM mode only).
  let privToggle = null;
  if (isGM) {
    const privCheckbox = el("input", { type: "checkbox", class: "priv-check" });
    privCheckbox.checked = getPrivateMode();
    function refreshPriv() { panel.classList.toggle("private-on", privCheckbox.checked); }
    privCheckbox.addEventListener("change", () => { setPrivateMode(privCheckbox.checked); refreshPriv(); });
    privToggle = el("label", { class: "priv-toggle", title: "When on, your rolls stay on this screen only — not posted to the shared log." },
      [privCheckbox, el("span", {}, "🔒 GM private rolls (this screen only)")]);
    refreshPriv();
  }

  const tools = el("div", { class: "roll-tools" }, [
    buildPhaseIndicator(),
    el("h2", { class: "section-title" }, "Dice Tools"),
    privToggle,
    tool("To-hit (3d6)", [{ label: "OCV", value: 0 }], ([ocv]) => {
      addRoll({ who: roller(), label: "To-hit", lines: [describeToHit(rollToHit({ ocv }))] });
    }),
    tool("Roll dice", [{ label: "Dice (d6)", value: 3 }], ([dice]) => {
      const r = rollEffectDice({ dice: `${dice}d6` });
      addRoll({ who: roller(), label: `${dice}d6 roll`, lines: [`${dice}d6 [${r.faces.join(",")}] = ${r.total}`] });
    }),
    tool("Normal damage", [{ label: "Dice (d6)", value: 3 }], ([dice]) => {
      addRoll({ who: roller(), label: "Normal damage", lines: [describeNormal(rollNormalDamage({ dice }))] });
    }),
    tool("Killing damage", [{ label: "Dice (d6)", value: 2 }], ([dice]) => {
      addRoll({ who: roller(), label: "Killing damage", lines: [describeKilling(rollKillingDamage({ dice }))] });
    }),
    tool("Knockback", [{ label: "BODY done", value: 0 }], ([body]) => {
      addRoll({ who: roller(), label: "Knockback", lines: [describeKnockback(rollKnockback({ body }))] });
    }),
    el("div", { class: "tool" }, [
      el("div", { class: "tool-title" }, "Heroic Action Points" ),
      el("div", { class: "tool-row" }, [
        el("button", { class: "roll-btn", type: "button", onClick: () => {
          const r = rollEffectDice({ dice: "2d6" });
          addRoll({ who: roller(), label: "Heroic Action Points", lines: [`HAP 2d6 [${r.faces.join(",")}] = ${r.total}`] });
        } }, "Roll HAP (2d6)")
      ])
    ])
  ]);

  const feed = el("div", { class: "log-feed" });
  function repaint() {
    feed.replaceChildren(...getRolls().map(logEntry));
    if (getRolls().length === 0) feed.appendChild(el("p", { class: "log-empty" }, "No rolls yet."));
  }
  subscribe(repaint);
  repaint();

  const status = el("span", { class: "log-status" });
  subscribeStatus((mode) => {
    const live = mode === "firebase";
    status.className = "log-status" + (live ? " live" : "");
    status.textContent = live ? "● Live" : "● Local";
    status.title = live ? "Shared roll log — synced via Firebase" : "Local only — Firebase not configured";
  });

  const log = el("div", { class: "roll-log" }, [
    el("div", { class: "log-bar" }, [
      el("h2", { class: "section-title" }, "Roll Log"),
      status,
      el("button", { class: "ghost-btn", type: "button", onClick: () => clearRolls() }, "Clear")
    ]),
    feed
  ]);

  panel.append(tools, log);
  return { element: panel };
}
