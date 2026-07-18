// Standard combat maneuvers (6E) available to every character. OCV/DCV/Phase
// are display strings from the maneuver table; `roll` marks the ones with a
// live button and how to resolve them:
//   { dice }            — STR-based normal damage (via strDamageDice)
//   { grab: true }      — to-hit only (Grab); success = target DCV ≤ hits DCV
//   { velocity: "..." } — STR + velocity damage; needs a velocity input
// Velocity formulas (Move By / Move Through) are best-effort readings of the
// table — verify at your table.
import { strDamageDice } from "../dice/hero.js";

export function standardManeuvers(character) {
  const sd = strDamageDice(character.characteristics?.STR || 0);
  return [
    { id: "block", name: "Block", phase: "½", ocv: "+0", dcv: "+0", effect: "Block an attack; can Abort to it" },
    { id: "brace", name: "Brace", phase: "½", ocv: "+2", dcv: "½", effect: "Negates the Range Modifier only" },
    { id: "disarm", name: "Disarm", phase: "½", ocv: "−2", dcv: "+0", effect: "STR vs STR to knock a weapon away" },
    { id: "dodge", name: "Dodge", phase: "½", ocv: "—", dcv: "+3", effect: "Dodge all attacks this phase; can Abort" },
    { id: "grab", name: "Grab", phase: "½", ocv: "−1", dcv: "−2", effect: "Grab 2 limbs, then Squeeze/Slam/Throw", roll: { ocvMod: -1, grab: true } },
    { id: "grabby", name: "Grab By", phase: "½", ocv: "−3", dcv: "−4", effect: "Move + Grab; +(v/10) to STR", roll: { ocvMod: -3, grab: true } },
    { id: "haymaker", name: "Haymaker", phase: "½*", ocv: "+0", dcv: "−5", effect: "+4 DC; takes +1 Segment to perform", roll: { ocvMod: 0, dice: sd + 4, damageType: "normal" } },
    { id: "moveby", name: "Move By", phase: "½", ocv: "−2", dcv: "−2", effect: "STR/2 + v/10; you take ⅓", roll: { ocvMod: -2, velocity: "moveby", damageType: "normal" } },
    { id: "movethrough", name: "Move Through", phase: "½", ocv: "−v/5", dcv: "−3", effect: "STR + v/6; you take ½ or full", roll: { velocity: "movethrough", damageType: "normal" } },
    { id: "multiple", name: "Multiple Attack", phase: "1", ocv: "Var", dcv: "½", effect: "Attack multiple times at penalties" },
    { id: "set", name: "Set", phase: "1", ocv: "+1", dcv: "+0", effect: "Ranged attacks only; take aim" },
    { id: "shove", name: "Shove", phase: "½", ocv: "−1", dcv: "−1", effect: "Push target 1m per 5 STR" },
    { id: "strike", name: "Strike", phase: "½", ocv: "+0", dcv: "+0", effect: "STR (or weapon) damage", roll: { ocvMod: 0, dice: sd, damageType: "normal" } },
    { id: "throw", name: "Throw", phase: "½", ocv: "+0", dcv: "+0", effect: "Throw a grabbed target for STR damage", roll: { ocvMod: 0, dice: sd, damageType: "normal" } },
    { id: "trip", name: "Trip", phase: "½", ocv: "−1", dcv: "−2", effect: "Knock the target Prone" }
  ];
}

// Damage dice for a velocity maneuver given the character and velocity (m).
export function velocityManeuverDice(kind, character, v) {
  const sd = strDamageDice(character.characteristics?.STR || 0);
  const vel = Math.max(0, v || 0);
  if (kind === "moveby") return Math.max(1, Math.round(sd / 2) + Math.round(vel / 10));
  if (kind === "movethrough") return Math.max(1, sd + Math.round(vel / 6));
  return sd;
}

// Move Through's OCV penalty scales with velocity (−v/5).
export function movethroughOcvMod(v) {
  return -Math.round(Math.max(0, v || 0) / 5);
}
