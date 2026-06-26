// Turn resolver results into compact human-readable strings for the roll log.
// Kept separate from the resolvers so the log feed (and later Firebase
// payloads) can render without re-deriving anything.

function diceList(faces) {
  return faces.join(",");
}

export function describeToHit(r) {
  if (r.auto === "hit") return `to-hit 3d6 [${diceList(r.faces)}] = ${r.total} — natural 3, hits ANY DCV`;
  if (r.auto === "miss") return `to-hit 3d6 [${diceList(r.faces)}] = ${r.total} — natural 18, automatic MISS`;
  return `to-hit 3d6 [${diceList(r.faces)}] = ${r.total} (OCV ${r.ocv}) — hits DCV ${r.hitsDcv}`;
}

export function describeCheck(r) {
  const verb = r.success ? "SUCCESS" : "FAIL";
  const by = r.success ? `by ${r.margin}` : `by ${-r.margin}`;
  return `3d6 [${diceList(r.faces)}] = ${r.total} (need ≤ ${r.target}) — ${verb} ${by}`;
}

// Effect roll (non-attack powers: Aid / Drain / Suppress / Healing / Transform
// / Telepathy …). `entry` is the power (needs rollType, dice, optional target);
// `r` is a rollEffectDice() result. Reused by VPP powers and permanent powers.
export function describeVpp(entry, r) {
  const faces = diceList(r.faces);
  switch (entry.rollType) {
    case "addToCharacteristic":
      return `${entry.dice} Aid [${faces}] = +${r.total} ${entry.target}`;
    case "subtractFromCharacteristic":
      return `${entry.dice} Drain [${faces}] = −${r.total} ${entry.target}`;
    case "suppressAP":
      return `${entry.dice} Suppress [${faces}] = −${r.total} AP of powers`;
    case "healBody":
      return `${entry.dice} Healing [${faces}] = ${r.total} BODY restored`;
    case "transform":
      return `${entry.dice} Transform [${faces}] = ${r.total} BODY (vs target's BODY)`;
    case "telepathy":
      return `${entry.dice} Telepathy [${faces}] = ${r.total} effect (vs EGO + 30 / 20 / 10)`;
    default:
      return `${entry.dice} [${faces}] = ${r.total}`;
  }
}

export function describeNormal(r) {
  return `${r.dice}d6 normal [${diceList(r.faces)}] = ${r.stun} STUN, ${r.body} BODY`;
}

export function describeKilling(r) {
  const mult = r.multiplierMode === "1d6" ? `1d6=${r.multiplierRoll}` : `½d6=${r.multiplier}`;
  return `${r.dice}d6 killing [${diceList(r.bodyFaces)}] = ${r.body} BODY × ${r.multiplier} (${mult}) = ${r.stun} STUN`;
}

export function describeKnockback(r) {
  if (r.kbDice === 0) return `knockback: none (no KB dice) — ${r.meters}m`;
  return `knockback ${r.kbDice}d6 [${diceList(r.faces)}] = ${r.kbRoll}; ${r.body} BODY − ${r.kbRoll} = ${r.points} → ${r.meters}m`;
}

// A full power resolution -> a one-line headline plus detail lines.
export function describePower(r) {
  const lines = [];
  lines.push(describeToHit(r.toHit));
  if (r.pulled) lines.push(`pulled punch: ${r.dice}d6 of ${r.fullDice}d6`);
  if (r.damage) {
    lines.push(r.damage.kind === "killingDamage" ? describeKilling(r.damage) : describeNormal(r.damage));
  }
  if (r.knockback) lines.push(describeKnockback(r.knockback));
  if (r.power.autofire) {
    lines.push(`autofire: ${r.power.autofire.shots} shots (max ${r.power.autofire.maxHits} hits) — resolve per-shot at table`);
  }
  return lines;
}
