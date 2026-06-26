// Irie Blaze — Jah'Mari Brightwell, Rastafarian Solar/Nature Hero (played by Dave)
// Source: Session 5 updated character sheet PDF.
// Day/night split: a completely different power set at night (not a reduced
// version of day). Nature & Healing powers work in both. BODY not listed on the
// sheet; using the 6E default of 10. ECV 7 → OMCV/DMCV 7; Mental Defense 10.
export const irieBlaze = {
  id: "irieBlaze",
  name: "Irie Blaze",
  realName: "Jah'Mari Brightwell",
  player: "Dave",
  characteristics: { STR: 15, DEX: 18, CON: 18, BODY: 10, INT: 13, EGO: 20, PRE: 18, SPD: 4 },
  derived: { OCV: 6, DCV: 6, OMCV: 7, DMCV: 7, PD: 6, ED: 6, rPD: 0, rED: 0, MD: 10 },
  health: {
    STUN: { max: 35, current: 35 },
    BODY: { max: 10, current: 10 },
    END:  { max: 40, current: 40 }
  },
  rec: 8,
  xp: { earned: 0, spent: 0 },
  phases: [3, 6, 9, 12],

  // Day/Night power sets. `shared` powers are always available.
  powerSets: {
    current: "day",
    sets: {
      day: {
        label: "Solar Fire — Day",
        powers: [
          { id: "solar_blast", name: "Solar Blast", type: "Blast", totalDice: "6d6", damageType: "normal",
            endCost: 3, cost: "30 AP", conditions: ["requires_sunlight"],
            description: "Energy Blast 6d6. OAF (Dreadlocks), requires sunlight or bright light." },
          { id: "flame_shield", name: "Flame Shield", type: "Force Field", endCost: 3, cost: "26 AP",
            description: "Force Field 13 PD / 13 ED. Costs END, OAF (Dreadlocks)." },
          { id: "solar_flare", name: "Solar Flare", type: "Blast", totalDice: "4d6", damageType: "normal",
            endCost: 3, cost: "32 AP", conditions: ["requires_sunlight"],
            description: "Energy Blast 4d6, AoE 6m Radius, 4 shots. OAF (Dreadlocks)." }
        ]
      },
      night: {
        label: "Moon Shadow — Night",
        powers: [
          { id: "shadow_embrace", name: "Shadow Embrace", type: "Invisibility", endCost: 4, cost: "40 AP",
            description: "Invisibility to Sight + Hearing, No Fringe. Only in shadows/darkness. Costs END, OAF (Dreadlocks)." }
        ]
      }
    },
    shared: {
      label: "Nature & Healing (Day or Night)",
      powers: [
        { id: "call_of_wild", name: "Call of the Wild", type: "Summon", cost: "40 AP",
          description: "Summon up to two 200-pt animals. Requires local wildlife, Full Phase. OAF (Dreadlocks)." },
        { id: "natures_whisper", name: "Nature's Whisper", type: "Telepathy", totalDice: "5d6", rollType: "telepathy",
          endCost: 2, cost: "15 AP", description: "Telepathy 5d6 — only with animals and plants. OAF (Dreadlocks)." },
        { id: "irie_healing", name: "Irie Healing", type: "Healing", totalDice: "3d6", rollType: "healBody",
          endCost: 3, cost: "30 AP", description: "Healing 3d6. Extra Time (1 Turn), requires meditation/chanting. Costs END." },
        { id: "calming_presence", name: "Calming Presence", type: "Mental Defense", cost: "~18 pts",
          description: "Mental Defense 10, Usable on Others — now 3m radius, Selective (Session 5). Blanket a crowd, choose who's calmed. OAF (Dreadlocks)." },
        { id: "sun_blessed_rage", name: "Sun-Blessed Rage", type: "Aid", totalDice: "3d6", rollType: "addToCharacteristic",
          target: "Solar Blast", endCost: 3, cost: "30 AP",
          description: "Aid to Energy Blast 3d6. Trigger: witnessing injustice (auto). Self Only, Linked to Enraged." }
      ]
    }
  },

  complications: [
    "Code Against Killing (Common, Total)",
    "OAF: Dreadlocks (all powers depend on this focus)",
    "Hunted: Federal Draft Enforcement",
    "Enraged: When witnessing injustice (linked to Sun-Blessed Rage)"
  ]
};
