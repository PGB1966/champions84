// Hero System 6E combat resolvers, built on the pure primitives in dice.js.
// Every function returns the raw dice plus the derived result so the UI can
// show the breakdown ("rolled 4,2,6 = 12") rather than just an outcome.
//
// Three rules are table conventions rather than settled — they're centralized
// in CONVENTIONS below and flagged in the README's open-questions. Defaults
// follow 6E core as I read it; change them in one place if the table differs.
import { rollDice, sum, parseDiceCount } from "./dice.js";

export const CONVENTIONS = {
  // Killing-attack STUN multiplier. 6E core: roll 1d6 and halve, round up
  // (1-2 -> x1, 3-4 -> x2, 5-6 -> x3). Set to "1d6" to use the raw die face.
  killingStunMultiplier: "1d3", // "1d3" | "1d6"

  // Knockback distance. BODY of the attack minus the knockback roll; each
  // leftover point = 2 meters (1 old hex). Set metersPerPoint to 1 to report
  // the raw point spread instead.
  knockbackDice: 2,
  knockbackMetersPerPoint: 2
};

// Hit Location table (6E). stunx = killing STUN multiplier (BODY × stunx);
// nStun = normal-damage STUN multiplier; bodyx = BODY multiplier (all attacks);
// ocv = penalty to hit that location on a called shot. `roll` is the 3d6 range.
export const HIT_LOCATIONS = [
  { name: "Head",      lo: 3,  hi: 5,  stunx: 5, nStun: 2,   bodyx: 2,   ocv: -8 },
  { name: "Hands",     lo: 6,  hi: 6,  stunx: 1, nStun: 0.5, bodyx: 0.5, ocv: -6 },
  { name: "Arms",      lo: 7,  hi: 8,  stunx: 2, nStun: 0.5, bodyx: 0.5, ocv: -5 },
  { name: "Shoulders", lo: 9,  hi: 9,  stunx: 3, nStun: 1,   bodyx: 1,   ocv: -5 },
  { name: "Chest",     lo: 10, hi: 11, stunx: 3, nStun: 1,   bodyx: 1,   ocv: -3 },
  { name: "Stomach",   lo: 12, hi: 12, stunx: 4, nStun: 1.5, bodyx: 1,   ocv: -7 },
  { name: "Vitals",    lo: 13, hi: 13, stunx: 4, nStun: 1.5, bodyx: 2,   ocv: -8 },
  { name: "Thighs",    lo: 14, hi: 14, stunx: 2, nStun: 1,   bodyx: 1,   ocv: -4 },
  { name: "Legs",      lo: 15, hi: 16, stunx: 2, nStun: 0.5, bodyx: 0.5, ocv: -6 },
  { name: "Feet",      lo: 17, hi: 18, stunx: 1, nStun: 0.5, bodyx: 0.5, ocv: -8 }
];

export function locationByName(name) {
  return HIT_LOCATIONS.find((l) => l.name === name) || null;
}

// Roll 3d6 for a random hit location; returns { location, faces, total }.
export function rollHitLocation(rng) {
  const faces = rollDice(3, rng);
  const total = sum(faces);
  const location = HIT_LOCATIONS.find((l) => total >= l.lo && total <= l.hi) || null;
  return { location, faces, total };
}

// STR damage in d6 (STR ÷ 5, rounded), for HTH maneuvers.
export function strDamageDice(str) {
  return Math.max(0, Math.round((str || 0) / 5));
}

// --- to-hit ----------------------------------------------------------------
// 3d6. Reports the highest DCV this roll hits: hitsDcv = 11 + OCV - 3d6. The
// table compares that to the target's actual DCV (no target entry needed). A
// natural 3 always hits any DCV; a natural 18 always misses.
export function rollToHit({ ocv = 0, rng } = {}) {
  const faces = rollDice(3, rng);
  const total = sum(faces);
  let auto = null;
  if (total === 3) auto = "hit";
  else if (total === 18) auto = "miss";
  return {
    kind: "toHit",
    faces, total, ocv,
    hitsDcv: 11 + ocv - total, // highest DCV this roll connects with
    auto
  };
}

// --- generic 3d6 check (characteristic / skill / PER rolls) ----------------
// Roll 3d6, succeed if total <= target. No automatic 3/18 rule (that's an
// attack-roll convention in 6E core); margin reports how much made/missed by.
export function rollCheck({ target = 11, rng } = {}) {
  const faces = rollDice(3, rng);
  const total = sum(faces);
  return {
    kind: "check",
    faces, total, target,
    success: total <= target,
    margin: target - total // >=0 made it by this much; <0 missed by
  };
}

// --- effect dice (VPP Aid / Drain / Suppress / Healing) --------------------
// Roll Nd6; the summed total is the effect magnitude (points added/drained,
// AP suppressed, or BODY healed). Used for VPP powers that aren't attacks.
export function rollEffectDice({ dice, rng } = {}) {
  const faces = rollDice(parseDiceCount(dice), rng);
  return { kind: "effect", faces, dice: faces.length, total: sum(faces) };
}

// --- normal damage ---------------------------------------------------------
// Nd6. STUN = sum. BODY per die: 1 -> 0, 2-5 -> 1, 6 -> 2.
// With a hit location: STUN ×= nStun, BODY ×= bodyx (applied to raw / pre-defense).
export function rollNormalDamage({ dice, hitLocation = null, rng } = {}) {
  const n = parseDiceCount(dice);
  const faces = rollDice(n, rng);
  let body = 0;
  for (const f of faces) body += f === 1 ? 0 : f === 6 ? 2 : 1;
  const stun = sum(faces);
  const r = { kind: "normalDamage", faces, dice: n, stun, body };
  if (hitLocation) {
    r.hitLocation = hitLocation;
    r.stun = Math.round(stun * hitLocation.nStun);
    r.body = Math.round(body * hitLocation.bodyx);
    r.baseStun = stun;
    r.baseBody = body;
  }
  return r;
}

// --- killing damage --------------------------------------------------------
// Nd6 for BODY (= sum). Separate STUN-multiplier die; STUN = BODY x multiplier.
// With a hit location: BODY ×= bodyx, and STUN = BODY × stunx (no ½d6 roll).
export function rollKillingDamage({ dice, multiplierMode = CONVENTIONS.killingStunMultiplier, hitLocation = null, rng } = {}) {
  const n = parseDiceCount(dice);
  const bodyFaces = rollDice(n, rng);
  const rawBody = sum(bodyFaces);
  if (hitLocation) {
    const body = Math.round(rawBody * hitLocation.bodyx);
    return {
      kind: "killingDamage",
      bodyFaces, dice: n, body, baseBody: rawBody,
      hitLocation, multiplier: hitLocation.stunx,
      stun: body * hitLocation.stunx
    };
  }
  const multiplierRoll = rollDice(1, rng)[0];
  const multiplier = multiplierMode === "1d6"
    ? multiplierRoll
    : Math.ceil(multiplierRoll / 2); // 1-2->1, 3-4->2, 5-6->3
  return {
    kind: "killingDamage",
    bodyFaces, dice: n, body: rawBody,
    multiplierRoll, multiplier, multiplierMode,
    stun: rawBody * multiplier
  };
}

// --- knockback -------------------------------------------------------------
// Roll the knockback dice, subtract from BODY done. Leftover points convert to
// meters. `kbDice` lets a power adjust the dice count (fewer dice = more KB).
export function rollKnockback({ body = 0, kbDice = CONVENTIONS.knockbackDice, rng } = {}) {
  const count = Math.max(0, kbDice);
  const faces = rollDice(count, rng);
  const kbRoll = sum(faces);
  const points = Math.max(0, body - kbRoll);
  return {
    kind: "knockback",
    faces, kbDice: count, kbRoll, body,
    points,
    meters: points * CONVENTIONS.knockbackMetersPerPoint
  };
}

// --- pulling a punch -------------------------------------------------------
// A power may be used at fewer dice ("pulling the punch") for a proportional
// END cost. END scales with the fraction of dice used, rounded to nearest,
// minimum 1 (you still pay to activate). A 0-END power stays free. The
// proportional rounding is a table convention — see README.
export function pulledEndCost(power, chosenDice) {
  const fullEnd = power.endCost || 0;
  if (fullEnd === 0) return 0;
  const fullDice = parseDiceCount(power.totalDice);
  const n = Number.isFinite(chosenDice) ? Math.trunc(chosenDice) : fullDice;
  const useDice = Math.max(1, Math.min(fullDice, n));
  return Math.max(1, Math.round((fullEnd * useDice) / fullDice));
}

// --- full power resolution -------------------------------------------------
// Resolves a character's power against a target DCV: to-hit (with the power's
// ocvMod applied), then damage, then knockback for physical normal attacks.
// `dice` optionally pulls the punch to fewer dice (defaults to the power's
// full dice; to-hit is unaffected). Returns the component rolls plus the
// dice/pulled state; the UI decides how to label/log them.
const PHYSICAL_TYPES = new Set(["HA", "HTH", "HKA"]);

export function rollPower({ power, ocv = 0, dice, hitLocation = null, rng } = {}) {
  const ocvMod = power.ocvMod || 0;
  const fullDice = parseDiceCount(power.totalDice);
  const useDice = dice == null
    ? fullDice
    : Math.max(1, Math.min(fullDice, Math.trunc(dice)));
  const pulled = useDice < fullDice;

  // A called/random hit location adds its OCV penalty to the to-hit.
  const locOcv = hitLocation ? (hitLocation.ocv || 0) : 0;
  const toHit = rollToHit({ ocv: ocv + ocvMod + locOcv, rng });

  let damage = null;
  let knockback = null;
  if (power.damageType === "killing") {
    damage = rollKillingDamage({ dice: useDice, hitLocation, rng });
  } else if (power.damageType === "normal") {
    damage = rollNormalDamage({ dice: useDice, hitLocation, rng });
  }

  // Knockback for physical attacks that did BODY. A power's knockbackBonus
  // reduces the knockback dice (more knockback) — table-confirmable, see README.
  if (damage && PHYSICAL_TYPES.has(power.type)) {
    const kbDice = CONVENTIONS.knockbackDice - (power.knockbackBonus || 0);
    knockback = rollKnockback({ body: damage.body, kbDice, rng });
  }

  return { kind: "power", power, ocv, ocvMod, fullDice, dice: useDice, pulled, hitLocation, toHit, damage, knockback };
}
