// Browser-runnable tests for the dice engine. Open tests/index.html, or call
// runAll() from the console. Uses a scripted RNG so every roll is exact:
// scriptedRng([4,2,6]) makes rollDie() return 4, then 2, then 6.
import { rollDie, rollDice, parseDiceCount } from "../js/dice/dice.js";
import {
  rollToHit, rollNormalDamage, rollKillingDamage, rollKnockback, rollPower, pulledEndCost, rollCheck, rollEffectDice
} from "../js/dice/hero.js";
import { charRoll } from "../js/render.js";

export function scriptedRng(faces) {
  let i = 0;
  return () => {
    const f = faces[i++ % faces.length];
    return (f - 0.5) / 6; // maps to exactly that die face
  };
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}

const tests = {
  "scriptedRng produces exact faces"() {
    eq(rollDice(3, scriptedRng([4, 2, 6])), [4, 2, 6], "faces");
  },

  "parseDiceCount reads Nd6"() {
    eq(parseDiceCount("20d6"), 20, "20d6");
    eq(parseDiceCount("1d6"), 1, "1d6");
    eq(parseDiceCount(8), 8, "numeric");
    let threw = false;
    try { parseDiceCount("2d10"); } catch { threw = true; }
    eq(threw, true, "rejects non-d6");
  },

  "to-hit: reports hits DCV = 11 + OCV - 3d6"() {
    // OCV 7, roll 3+4+4 = 11 -> hits DCV 11 + 7 - 11 = 7.
    const r = rollToHit({ ocv: 7, rng: scriptedRng([3, 4, 4]) });
    eq([r.total, r.hitsDcv], [11, 7], "hits dcv");
    // higher roll -> hits a lower DCV
    const r2 = rollToHit({ ocv: 7, rng: scriptedRng([4, 4, 4]) });
    eq([r2.total, r2.hitsDcv], [12, 6], "lower dcv on worse roll");
  },

  "to-hit: natural 3 always hits, 18 always misses"() {
    const a = rollToHit({ ocv: 4, rng: scriptedRng([1, 1, 1]) });
    eq([a.total, a.auto], [3, "hit"], "nat 3");
    const b = rollToHit({ ocv: 4, rng: scriptedRng([6, 6, 6]) });
    eq([b.total, b.auto], [18, "miss"], "nat 18");
  },

  "normal damage: STUN = sum, BODY counts 1->0, 2-5->1, 6->2"() {
    // faces 1,2,5,6 -> STUN 14, BODY 0+1+1+2 = 4
    const r = rollNormalDamage({ dice: 4, rng: scriptedRng([1, 2, 5, 6]) });
    eq([r.stun, r.body], [14, 4], "normal");
  },

  "killing damage: BODY = sum, STUN = BODY x multiplier (½d6)"() {
    // body faces 5,6 = 11 BODY; mult die 5 -> ceil(5/2)=3 -> STUN 33
    const r = rollKillingDamage({ dice: 2, rng: scriptedRng([5, 6, 5]) });
    eq([r.body, r.multiplier, r.stun], [11, 3, 33], "killing ½d6");
  },

  "killing damage: raw 1d6 multiplier mode"() {
    const r = rollKillingDamage({ dice: 2, multiplierMode: "1d6", rng: scriptedRng([5, 6, 5]) });
    eq([r.body, r.multiplier, r.stun], [11, 5, 55], "killing 1d6");
  },

  "knockback: (BODY - 2d6) x 2 meters, floored at 0"() {
    // body 12, kb roll 3+4=7 -> 5 points -> 10m
    const r = rollKnockback({ body: 12, rng: scriptedRng([3, 4]) });
    eq([r.kbRoll, r.points, r.meters], [7, 5, 10], "kb positive");
    // body 3, kb roll 6+6=12 -> floored 0
    const z = rollKnockback({ body: 3, rng: scriptedRng([6, 6]) });
    eq([z.points, z.meters], [0, 0], "kb floored");
  },

  "rollCheck: 3d6 <= target, with margin"() {
    // target 13, roll 4+4+3 = 11 -> success by 2
    const s = rollCheck({ target: 13, rng: scriptedRng([4, 4, 3]) });
    eq([s.total, s.success, s.margin], [11, true, 2], "success");
    // target 11, roll 5+5+5 = 15 -> fail by 4
    const f = rollCheck({ target: 11, rng: scriptedRng([5, 5, 5]) });
    eq([f.total, f.success, f.margin], [15, false, -4], "fail");
  },

  "rollEffectDice: sum of Nd6 (VPP Aid/Drain/Suppress/Heal)"() {
    // 8d6 Aid: faces 5,5,5,5,4,4,4,4 = 36
    const r = rollEffectDice({ dice: "8d6", rng: scriptedRng([5, 5, 5, 5, 4, 4, 4, 4]) });
    eq([r.dice, r.total], [8, 36], "aid 8d6");
  },

  "charRoll: 9 + round(CHAR/5)"() {
    eq(charRoll(40), 17, "STR 40");  // 9 + 8
    eq(charRoll(21), 13, "DEX 21");  // 9 + round(4.2)=4
    eq(charRoll(18), 13, "CON 18");  // 9 + round(3.6)=4
    eq(charRoll(14), 12, "INT 14");  // 9 + round(2.8)=3
    eq(charRoll(10), 11, "base 10"); // 9 + 2
  },

  "pulledEndCost: scales proportionally, min 1, full at full dice"() {
    const power = { totalDice: "20d6", endCost: 4 };
    eq(pulledEndCost(power, 20), 4, "full");
    eq(pulledEndCost(power, 10), 2, "half");
    eq(pulledEndCost(power, 5), 1, "quarter");
    eq(pulledEndCost(power, 1), 1, "min 1");        // 4*1/20 = 0.2 -> 1
    eq(pulledEndCost(power, 99), 4, "clamps to full dice");
    eq(pulledEndCost({ totalDice: "2d6", endCost: 0 }, 1), 0, "0-END stays free");
  },

  "rollPower: pulling the punch uses fewer dice for damage but not to-hit"() {
    // 3d6 power pulled to 2d6. to-hit still 3d6 = [3,3,3]=9. damage 2d6 = [6,6]=12 STUN, 4 BODY.
    const power = { name: "Jab", type: "HTH", totalDice: "3d6", damageType: "normal", endCost: 4 };
    const r = rollPower({ power, ocv: 5, dice: 2, rng: scriptedRng([3, 3, 3, 6, 6]) });
    eq([r.fullDice, r.dice, r.pulled], [3, 2, true], "pulled state");
    eq(r.toHit.faces.length, 3, "to-hit still 3d6");
    eq([r.damage.stun, r.damage.body], [12, 4], "damage uses 2 dice");
  },

  "rollPower: applies ocvMod (hits DCV) and rolls fewer KB dice for knockbackBonus"() {
    const power = { name: "Glove", type: "HA", totalDice: "3d6", damageType: "normal", knockbackBonus: 1, ocvMod: -1, endCost: 4 };
    // to-hit 3d6 = [4,4,4]=12; ocv 7 + mod -1 = 6 -> hits DCV 11 + 6 - 12 = 5
    // damage 3d6 = [6,6,6] -> STUN 18, BODY 6; knockback 1d6 = [2] -> 6-2 = 4 -> 8m
    const r = rollPower({ power, ocv: 7, rng: scriptedRng([4, 4, 4, 6, 6, 6, 2]) });
    eq(r.toHit.hitsDcv, 5, "ocvMod applied to hits DCV");
    eq([r.damage.stun, r.damage.body], [18, 6], "damage");
    eq([r.knockback.kbDice, r.knockback.meters], [1, 8], "kb bonus reduces dice");
  }
};

export function runAll() {
  const results = [];
  for (const [name, fn] of Object.entries(tests)) {
    try { fn(); results.push({ name, pass: true }); }
    catch (e) { results.push({ name, pass: false, error: e.message }); }
  }
  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, results };
}
