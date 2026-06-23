// Character & route registry.
// As characters are converted to schema, import and register them here.
// `characters` keyed by id; `routes` maps a URL slug -> the character ids shown
// on that route (an array, so a player with multiple PCs renders as tabs).
import { punchline } from "./punchline.js";
import { vivian } from "./vivian.js";
import { irieBlaze } from "./irieBlaze.js";
import { doubleHelix } from "./doubleHelix.js";

export const characters = {
  punchline,
  vivian,
  irieBlaze,
  doubleHelix
};

export const routes = {
  mike: { player: "Mike", characterIds: ["punchline", "vivian"] },
  dave: { player: "Dave", characterIds: ["irieBlaze"] },
  vlad: { player: "Vlad", characterIds: ["doubleHelix"] }
};

// Order of routes in the top nav.
export const routeOrder = ["mike", "dave", "vlad"];
