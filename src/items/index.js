// Public surface of the item module (CONTRACTS.md §14 pickup/use flow +
// §25 v2.1 delivery: authored placements, audience throws, heart drops).
export { ItemSystem, ARENA_ITEM_SPOTS, itemSpotsForArena } from './ItemSystem.js'
export {
  ITEM_ROSTER, TIER_BY_ARENA,
  rosterForTier, rosterForArena, itemDefByKind, allItemKinds,
} from './roster.js'
