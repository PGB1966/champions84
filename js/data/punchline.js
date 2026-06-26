// Punchline — Daniel "Dodge" Carr (played by Mike)
// Validated reference schema. Other characters follow this same shape.
export const punchline = {
  id: "punchline",
  name: "Punchline",
  realName: "Daniel 'Dodge' Carr",
  player: "Mike",
  characteristics: {
    STR: 40, DEX: 21, CON: 18, BODY: 13,
    INT: 14, EGO: 15, PRE: 20, SPD: 4
  },
  derived: {
    OCV: 7, DCV: 7, OMCV: 3, DMCV: 3,
    PD: 10, ED: 8, rPD: 11, rED: 8
  },
  health: {
    STUN: { max: 50, current: 50 },
    BODY: { max: 13, current: 13 },
    END:  { max: 40, current: 40 }
  },
  rec: 10,
  // 6E standard movement (meters/Phase); no points spent on movement.
  movement: { Running: 12, Leaping: 4, Swimming: 4 },
  // Experience: earned and spent tracked separately; unspent is derived.
  // Both start at 0 (Mike's spend was baked into the build above).
  xp: { earned: 0, spent: 0 },
  phases: [3, 6, 9, 12],
  powers: [
    {
      id: "glove_punch",
      name: "Punchline Glove",
      type: "HA",
      totalDice: "20d6",
      damageType: "normal",
      endCost: 4,
      knockbackBonus: 1,
      conditions: ["requires_quip"]
    },
    {
      id: "glove_autofire",
      name: "Rapid Fire Puns",
      type: "HA",
      totalDice: "20d6",
      damageType: "normal",
      endCost: 4,
      ocvMod: -1,
      autofire: { shots: 3, maxHits: 3 },
      conditions: ["requires_quip"]
    },
    {
      id: "bare_fist",
      name: "Bare Fist (no glove)",
      type: "HTH",
      totalDice: "8d6",
      damageType: "normal",
      endCost: 4
    }
  ]
};
