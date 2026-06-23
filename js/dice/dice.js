// Core dice primitives. Pure and RNG-injectable so the Hero resolvers (and
// their tests) are deterministic — pass a scripted `rng` to replay exact rolls.
// `rng` is any function returning a float in [0, 1), defaulting to Math.random.

export function rollDie(rng = Math.random) {
  return 1 + Math.floor(rng() * 6);
}

export function rollDice(n, rng = Math.random) {
  const count = Math.max(0, Math.trunc(n));
  const faces = [];
  for (let i = 0; i < count; i++) faces.push(rollDie(rng));
  return faces;
}

export function sum(faces) {
  return faces.reduce((a, b) => a + b, 0);
}

// Parse a dice expression like "20d6", "3d6", "1d6". Returns the die count.
// Half-dice ("2½d6" / "2.5d6") and trailing pips ("+1") are out of scope for
// now (none of the current characters use them); throws on anything unexpected
// so a typo in character data fails loudly instead of rolling silently wrong.
export function parseDiceCount(expr) {
  if (typeof expr === "number") return Math.trunc(expr);
  const m = /^\s*(\d+)\s*d\s*6\s*$/i.exec(String(expr));
  if (!m) throw new Error(`Unsupported dice expression: "${expr}" (expected like "20d6")`);
  return parseInt(m[1], 10);
}
