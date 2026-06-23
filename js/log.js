// Shared roll log. Two modes behind one API:
//   • "firebase" — when firebase-config.js is filled in: public writes push to
//     the Realtime Database; a single onValue listener mirrors the shared log
//     into `synced`, so every player sees the same feed live.
//   • "local"    — otherwise: an in-memory feed, scoped to this browser.
//
// GM private rolls (entry.private, or made while private mode is on) are NEVER
// pushed — they live only in `local` on the roller's screen. getRolls() merges
// the synced public feed with local rolls. The UI (rollpanel.js) only knows
// addRoll/getRolls/subscribe/clearRolls and is identical in both modes.
import { firebaseConfig, isConfigured, FIREBASE_VERSION } from "./firebase-config.js";

const MAX_ENTRIES = 200;

const synced = [];                 // public rolls mirrored from Firebase
const local = [];                  // local-only: private rolls (FB) or all (local mode)
const listeners = new Set();       // (record|null, rolls) => void
const statusListeners = new Set(); // (mode) => void
let nextId = 1;

let mode = "local";
let privateMode = false; // GM "private rolls" switch
let fbPush = null;       // (payload) => void   — push a public roll to RTDB
let fbRemove = null;     // () => void          — clear the shared log

// Merge the synced (public) and local feeds, newest first, capped.
function allRolls() {
  const merged = mode === "firebase" ? synced.concat(local) : local.slice();
  merged.sort((a, b) => b.ts - a.ts);
  return merged.slice(0, MAX_ENTRIES);
}

function notify(record) {
  const rolls = allRolls();
  for (const fn of listeners) fn(record, rolls);
}

function setMode(next) {
  mode = next;
  for (const fn of statusListeners) fn(mode);
}

// --- public API ------------------------------------------------------------
// entry: { who, label, lines: [], private?: bool }
// If `private` is omitted, the current private-mode switch decides.
export function addRoll(entry) {
  const isPrivate = entry.private != null ? Boolean(entry.private) : privateMode;
  const payload = {
    ts: Date.now(),
    who: entry.who || "Unknown",
    label: entry.label || "",
    lines: entry.lines || [],
    private: isPrivate
  };

  // Public rolls in firebase mode go to the DB and come back via onValue
  // (Firebase fires it locally first, so the roller sees it effectively instantly).
  if (mode === "firebase" && fbPush && !isPrivate) {
    fbPush(payload);
    return payload;
  }

  const record = { id: nextId++, ...payload };
  local.unshift(record);
  if (local.length > MAX_ENTRIES) local.length = MAX_ENTRIES;
  notify(record);
  return record;
}

export function getRolls() {
  return allRolls();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearRolls() {
  local.length = 0;
  if (mode === "firebase" && fbRemove) fbRemove(); // onValue clears `synced` + notifies
  notify(null);
}

export function getMode() {
  return mode;
}

export function setPrivateMode(value) {
  privateMode = Boolean(value);
}

export function getPrivateMode() {
  return privateMode;
}

// Notify (immediately, with the current mode) and on every mode change.
export function subscribeStatus(fn) {
  statusListeners.add(fn);
  fn(mode);
  return () => statusListeners.delete(fn);
}

// Call once at startup. Resolves to the active mode. Falls back to "local" if
// Firebase isn't configured or fails to initialize.
export async function initLog() {
  if (!isConfigured()) return "local";
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const { initializeApp } = await import(`${base}/firebase-app.js`);
    const { getDatabase, ref, push, remove, query, limitToLast, onValue } =
      await import(`${base}/firebase-database.js`);

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const rollsRef = ref(db, "rolls");

    fbPush = (payload) => push(rollsRef, payload);
    fbRemove = () => remove(rollsRef);

    // Mirror the shared public log (last MAX_ENTRIES) on every change.
    const recent = query(rollsRef, limitToLast(MAX_ENTRIES));
    onValue(recent, (snap) => {
      const val = snap.val() || {};
      synced.length = 0;
      for (const [id, v] of Object.entries(val)) synced.push({ id, lines: [], ...v });
      notify(null);
    });

    setMode("firebase");
    return "firebase";
  } catch (err) {
    console.error("Firebase init failed; roll log staying local-only:", err);
    setMode("local");
    return "local";
  }
}
