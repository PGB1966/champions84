// Double Helix — Dr. Aris Thorne (played by Vlad)
// Sources: project brief VPP JSON (canonical, roll-live) + Session 5 PDFs
// (combat reference & updated character sheet).
//
// VPP uses ROLL-LIVE (per table decision) — dice are rolled, not Standard
// Effect. Each VPP power groups its delivery variants under `modes` (Touch /
// Ranged / Area); allocating reserves the SELECTED mode's AP from the pool, and
// the delivery toggle swaps dice/AP/END.
//
// rollType:
//   addToCharacteristic / subtractFromCharacteristic / suppressAP / healBody
//        — roll Nd6, sum is the effect magnitude
//   attackRoll — to-hit + damage
//   adjudicated — no die roll; GM rules the effect (still costs AP + END).
//        AP/END for adjudicated powers marked (est.) are GM-set placeholders
//        from the PDFs — adjust freely.
export const doubleHelix = {
  id: "doubleHelix",
  name: "Double Helix",
  realName: "Dr. Aris Thorne",
  player: "Vlad",
  characteristics: { STR: 10, DEX: 13, CON: 15, BODY: 10, INT: 20, EGO: 13, PRE: 10, SPD: 4 },
  derived: { OCV: 4, DCV: 4, OMCV: 3, DMCV: 3, PD: 2, ED: 3, rPD: 0, rED: 0 },
  health: {
    STUN: { max: 25, current: 25 },
    BODY: { max: 10, current: 10 },
    END:  { max: 30, current: 30 }
  },
  rec: 6,
  movement: { Running: 6, Leaping: 2, Swimming: 2 },
  xp: { earned: 0, spent: 0 },
  phases: [3, 6, 9, 12],

  powers: [
    {
      id: "genetic_sight",
      name: "Genetic Sight",
      type: "Sense",
      cost: "15 pts",
      alwaysOn: true,
      description: "Detect DNA (Sight Group), Discriminatory, Analyze. See genetic code, health, powers, and lineage of living beings — appears as a glowing double-helix overlay. Always active. NOT part of the VPP."
    }
  ],

  vpp: {
    poolSize: 40,
    controlCost: 20,
    descriptor: "Biological/Genetic",
    actionCost: "full_phase",
    standardEffect: false,
    controlRoll: 13, // INT 20 → 9 + 20/5 = 13-
    controlRollNote: "Based on INT 20 (9 + INT/5). Confirm at table whether this uses a dedicated Power skill instead.",
    apCeilings: { self_or_touch: 40, ranged: 30, area_selective: 24 },

    library: [
      // --- Boost (Aid) ---
      { id: "aid_str", name: "Boost Strength", category: "Boost", rollType: "addToCharacteristic", target: "STR", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 },
        { deliveryMode: "area_selective", dice: "3d6", activeCost: 24, endCost: 2 } ] },
      { id: "aid_dex", name: "Boost Dexterity", category: "Boost", rollType: "addToCharacteristic", target: "DEX", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 },
        { deliveryMode: "area_selective", dice: "3d6", activeCost: 24, endCost: 2 } ] },
      { id: "aid_con", name: "Boost Constitution", category: "Boost", rollType: "addToCharacteristic", target: "CON", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 },
        { deliveryMode: "area_selective", dice: "3d6", activeCost: 24, endCost: 2 } ] },
      { id: "aid_int", name: "Boost Intelligence", category: "Boost", rollType: "addToCharacteristic", target: "INT", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 } ] },
      { id: "aid_spd", name: "Boost Speed", category: "Boost", rollType: "addToCharacteristic", target: "SPD", note: "Divide result per Hero System SPD Aid conversion table", modes: [
        { deliveryMode: "self_or_touch", dice: "5d6", activeCost: 40, endCost: 4 } ] },

      // --- Drain ---
      { id: "drain_dex", name: "Drain Dexterity", category: "Drain", rollType: "subtractFromCharacteristic", target: "DEX", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 } ] },
      { id: "drain_str", name: "Drain Strength", category: "Drain", rollType: "subtractFromCharacteristic", target: "STR", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 } ] },

      // --- Suppress ---
      { id: "suppress_powers", name: "Suppress Powers", category: "Suppress", rollType: "suppressAP", modes: [
        { deliveryMode: "self_or_touch", dice: "8d6", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", dice: "4d6", activeCost: 30, endCost: 3 },
        { deliveryMode: "area_selective", dice: "2d6", activeCost: 24, endCost: 2 } ] },

      // --- Healing ---
      { id: "healing", name: "Healing", category: "Healing", rollType: "healBody", modes: [
        { deliveryMode: "self_or_touch", dice: "2d6", activeCost: 40, endCost: 4, note: "Cannot exceed target's starting BODY" },
        { deliveryMode: "area_selective", dice: "1d6", activeCost: 24, endCost: 2 } ] },

      // --- Attack ---
      { id: "blast", name: "Biological Disruption", category: "Attack", rollType: "attackRoll", damageType: "normal", note: "Requires hit roll vs target DCV before damage roll", modes: [
        { deliveryMode: "ranged", dice: "6d6", activeCost: 30, endCost: 3 },
        { deliveryMode: "area_selective", dice: "5d6", activeCost: 24, endCost: 2 } ] },
      { id: "cellular_necrosis", name: "Cellular Necrosis (RKA)", category: "Attack", rollType: "attackRoll", damageType: "killing",
        note: "Ignores ED. EMERGENCY ONLY — violates 'First, Do No Harm'.", modes: [
        { deliveryMode: "self_or_touch", dice: "2d6", activeCost: 40, endCost: 4 } ] },

      // --- Control (GM-adjudicated) ---
      { id: "entangle", name: "Entangle (Keratin/Bio-Gel)", category: "Control", rollType: "adjudicated",
        description: "Organic material encases the target. Max recorded 48 BODY. (est. AP)", modes: [
        { deliveryMode: "self_or_touch", activeCost: 40, endCost: 4 },
        { deliveryMode: "ranged", activeCost: 30, endCost: 3 } ] },
      { id: "gene_lock", name: "Gene-Lock (Transform)", category: "Control", rollType: "transform",
        note: "Transform — target's powers cease functioning. Last resort; Thorne avoids permanent DNA alteration without consent.", modes: [
        { deliveryMode: "self_or_touch", dice: "2d6", activeCost: 40, endCost: 4 } ] },
      { id: "fear", name: "Fear (Emotion Control)", category: "Control", rollType: "adjudicated",
        description: "Mental attack inducing a fear response; effective on humans and animals. (est. AP)", modes: [
        { deliveryMode: "ranged", activeCost: 30, endCost: 3 } ] },

      // --- Defense / Utility (GM-adjudicated) ---
      { id: "armor", name: "Bio-Plating (Armor)", category: "Defense", rollType: "adjudicated",
        description: "Resistant Protection 20 PD / 20 ED (totals 22/23). Ignores up to 10 AP of Killing damage.", modes: [
        { deliveryMode: "self_or_touch", activeCost: 40, endCost: 0 } ] },
      { id: "invisibility", name: "Invisibility (Chromatophore)", category: "Utility", rollType: "adjudicated",
        description: "Invisibility to Sight Group — biological camouflage. Costs END to maintain. (est. AP)", modes: [
        { deliveryMode: "self_or_touch", activeCost: 40, endCost: 3 } ] },
      { id: "predator_mode", name: "Predator Mode", category: "Utility", rollType: "adjudicated",
        description: "Running +10m, Infrared vision, and scent Tracking. (est. AP)", modes: [
        { deliveryMode: "self_or_touch", activeCost: 40, endCost: 0 } ] }
    ],

    // Active allocations: [{ id, mode }] where mode is a deliveryMode key.
    activeSlots: []
  }
};
