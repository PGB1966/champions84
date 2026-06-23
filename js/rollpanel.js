// Right-hand roll panel: a shared Target DCV, manual dice tools, and the live
// roll-log feed. The manual tools exercise every resolver directly; power
// buttons on the sheet feed the same log.
import { rollToHit, rollNormalDamage, rollKillingDamage, rollKnockback } from "./dice/hero.js";
import { describeToHit, describeNormal, describeKilling, describeKnockback } from "./dice/format.js";
import { addRoll, subscribe, getRolls, clearRolls, subscribeStatus, setPrivateMode, getPrivateMode } from "./log.js";

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

export function buildRollPanel() {
  const target = numField("Target DCV", 0);

  // GM private rolls: when on, this screen's rolls stay local (not shared).
  const privCheckbox = el("input", { type: "checkbox", class: "priv-check" });
  privCheckbox.checked = getPrivateMode();
  const panel = el("aside", { class: "roll-panel" });
  function refreshPrivClass() { panel.classList.toggle("private-on", privCheckbox.checked); }
  privCheckbox.addEventListener("change", () => { setPrivateMode(privCheckbox.checked); refreshPrivClass(); });
  const privToggle = el("label", { class: "priv-toggle", title: "When on, your rolls stay on this screen only — not posted to the shared log." }, [
    privCheckbox, el("span", {}, "🔒 GM private rolls (this screen only)")
  ]);

  const tools = el("div", { class: "roll-tools" }, [
    el("h2", { class: "section-title" }, "Dice Tools"),
    privToggle,
    el("div", { class: "tool" }, [
      el("div", { class: "tool-title" }, "Shared target"),
      el("div", { class: "tool-row" }, [target.wrap])
    ]),
    tool("To-hit (3d6)", [
      { label: "OCV", value: 0 }, { label: "DCV", value: 0 }
    ], ([ocv, dcv]) => {
      const r = rollToHit({ ocv, dcv });
      addRoll({ who: "Dice Tools", label: "To-hit", lines: [describeToHit(r)] });
    }),
    tool("Normal damage", [{ label: "Dice (d6)", value: 8 }], ([dice]) => {
      const r = rollNormalDamage({ dice });
      addRoll({ who: "Dice Tools", label: "Normal damage", lines: [describeNormal(r)] });
    }),
    tool("Killing damage", [{ label: "Dice (d6)", value: 2 }], ([dice]) => {
      const r = rollKillingDamage({ dice });
      addRoll({ who: "Dice Tools", label: "Killing damage", lines: [describeKilling(r)] });
    }),
    tool("Knockback", [{ label: "BODY done", value: 0 }], ([body]) => {
      const r = rollKnockback({ body });
      addRoll({ who: "Dice Tools", label: "Knockback", lines: [describeKnockback(r)] });
    })
  ]);

  const feed = el("div", { class: "log-feed" });
  function repaint() {
    feed.replaceChildren(...getRolls().map(logEntry));
    if (getRolls().length === 0) {
      feed.appendChild(el("p", { class: "log-empty" }, "No rolls yet."));
    }
  }
  subscribe(repaint);
  repaint();

  // Live (Firebase) vs Local (this browser only) indicator.
  const status = el("span", { class: "log-status" });
  subscribeStatus((mode) => {
    const live = mode === "firebase";
    status.className = "log-status" + (live ? " live" : "");
    status.textContent = live ? "● Live" : "● Local";
    status.title = live
      ? "Shared roll log — synced via Firebase"
      : "Local only — Firebase not configured (see firebase-config.js)";
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
  refreshPrivClass();
  return { element: panel, getTargetDcv: () => target.get() };
}
