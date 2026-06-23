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

// --- to-hit ----------------------------------------------------------------
// 3d6, hit if total <= 11 + OCV - DCV. A natural 3 always hits, 18 always
// misses, regardless of CVs.
export function rollToHit({ ocv = 0, dcv = 0, rng } = {}) {
  const faces = rollDice(3, rng);
  const total = sum(faces);
  const needed = 11 + ocv - dcv; // hit when total <= needed
  let hit = total <= needed;
  let auto = null;
  if (total === 3) { hit = true; auto = "hit"; }
  else if (total === 18) { hit = false; auto = "miss"; }
  return {
    kind: "toHit",
    faces, total, ocv, dcv, needed,
    hit, auto,
    margin: needed - total // >=0 = made it by this much (in CV); <0 = missed by
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
export function rollNormalDamage({ dice, rng } = {}) {
  const n = parseDiceCount(dice);
  const faces = rollDice(n, rng);
  let body = 0;
  for (const f of faces) body += f === 1 ? 0 : f === 6 ? 2 : 1;
  return { kind: "normalDamage", faces, dice: n, stun: sum(faces), body };
}

// --- killing damage --------------------------------------------------------
// Nd6 for BODY (= sum). Separate STUN-multiplier die; STUN = BODY x multiplier.
export function rollKillingDamage({ dice, multiplierMode = CONVENTIONS.killingStunMultiplier, rng } = {}) {
  const n = parseDiceCount(dice);
  const bodyFaces = rollDice(n, rng);
  const body = sum(bodyFaces);
  const multiplierRoll = rollDice(1, rng)[0];
  const multiplier = multiplierMode === "1d6"
    ? multiplierRoll
    : Math.ceil(multiplierRoll / 2); // 1-2->1, 3-4->2, 5-6->3
  return {
    kind: "killingDamage",
    bodyFaces, dice: n, body,
    multiplierRoll, multiplier, multiplierMode,
    stun: body * multiplier
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

export function rollPower({ power, ocv = 0, targetDcv = 0, dice, rng } = {}) {
  const ocvMod = power.ocvMod || 0;
  const fullDice = parseDiceCount(power.totalDice);
  const useDice = dice == null
    ? fullDice
    : Math.max(1, Math.min(fullDice, Math.trunc(dice)));
  const pulled = useDice < fullDice;

  const toHit = rollToHit({ ocv: ocv + ocvMod, dcv: targetDcv, rng });

  let damage = null;
  let knockback = null;
  if (power.damageType === "killing") {
    damage = rollKillingDamage({ dice: useDice, rng });
  } else if (power.damageType === "normal") {
    damage = rollNormalDamage({ dice: useDice, rng });
  }

  // Knockback for physical attacks that did BODY. A power's knockbackBonus
  // reduces the knockback dice (more knockback) — table-confirmable, see README.
  if (damage && PHYSICAL_TYPES.has(power.type)) {
    const kbDice = CONVENTIONS.knockbackDice - (power.knockbackBonus || 0);
    knockback = rollKnockback({ body: damage.body, kbDice, rng });
  }

  return { kind: "power", power, ocv, ocvMod, targetDcv, fullDice, dice: useDice, pulled, toHit, damage, knockback };
}
