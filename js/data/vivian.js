// Vivian the Amphibian — Amphibian-Human Hybrid Vigilante (played by Mike)
// Source: Session 5 updated character sheet PDF.
// BODY not listed on the sheet; using the 6E default of 10 (confirm at table).
export const vivian = {
  id: "vivian",
  name: "Vivian the Amphibian",
  realName: "Amphibian-Human Hybrid",
  player: "Mike",
  characteristics: { STR: 15, DEX: 23, CON: 20, BODY: 10, INT: 18, EGO: 16, PRE: 16, SPD: 4 },
  derived: { OCV: 7, DCV: 7, OMCV: 3, DMCV: 3, PD: 6, ED: 6, rPD: 0, rED: 0 },
  health: {
    STUN: { max: 40, current: 40 },
    BODY: { max: 10, current: 10 },
    END:  { max: 40, current: 40 }
  },
  rec: 10,
  // Leaping 12m bought (PDF); Running/Swimming at 6E standard (not specified).
  movement: { Running: 12, Leaping: 12, Swimming: 4 },
  xp: { earned: 0, spent: 0 },
  phases: [3, 6, 9, 12],

  // Martial Arts (added Session 5). Offensive maneuvers roll; Dodge displays.
  maneuvers: [
    { id: "defensive_strike", name: "Defensive Strike", phase: "½", ocvMod: 1, dcvMod: 3,
      type: "HTH", totalDice: "3d6", damageType: "normal", endCost: 2, effect: "STR damage" },
    { id: "martial_dodge", name: "Martial Dodge", phase: "½", dcvMod: 5, abort: true, defensive: true,
      effect: "Dodge vs all attacks this phase (Abort)" }
  ],

  powers: [
    { id: "regeneration", name: "Regeneration", type: "Healing", cost: "30 pts", alwaysOn: true,
      description: "Regeneration 2 BODY per Turn. Persistent, Continuous, Self Only." },
    { id: "stasis_field", name: "Stasis Field", type: "Entangle", cost: "50 pts",
      description: "Entangle 5d6 — Area, No Range, Personal Immunity. Bio-gel projection. (GM adjudicates; roll 5d6 in Dice Tools if needed.)" },
    { id: "bio_empathy", name: "Bio-Empathy", type: "Mind Scan", cost: "25 pts",
      description: "Mind Scan — Amphibians and Humans only, Based on EGO." },
    { id: "env_adaptation", name: "Environmental Adaptation", type: "Senses", cost: "20 pts", alwaysOn: true,
      description: "Amphibious, Darkvision, Immunity to Environmental Toxins." },
    { id: "clinging", name: "Clinging", type: "Movement", cost: "5 pts",
      description: "Adhesive skin — wall and ceiling movement." }
  ],

  skills: [
    "Paramedics 12-", "Survival (Wetlands) 13-", "Stealth 14-",
    "KS: Amphibian Biology 12-", "PS: Bio-Tech Researcher 14-"
  ],
  complications: [
    "DNPC: Dr. Everett Wade (Watcher) 11-",
    "Hunted: Genetic Purists 11-",
    "Psych Lim: Protective of Nature (Common, Strong)",
    "Distinctive Features: Amphibian Appearance (Concealable)"
  ]
};
