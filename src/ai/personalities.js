// Personality profiles — the soul of each CPU fighter. The shared Brain
// (src/ai/Brain.js) is one state machine; these weights make Dogey feel like a
// caffeinated shiba and Cool Pal feel like furniture. Keyed by character id.
//
// Profile fields (all weights 0..1 unless noted):
//   aggression   how eagerly it approaches / swings
//   patience     willingness to sit in neutral instead of forcing something
//   blockChance  base chance to react to a perceived attack by blocking
//   counterness  when defending, chance to use a 'counter'-tagged favorite
//                instead of plain block (Shibro / Cool Pal reads)
//   feintiness   empty dashes, whiffed max-range pokes, fake approaches
//   meterGreed   0 = hoards meter for the super, 1 = spends on cooldown
//   mobility     baseline movement activity (0 = statue, 1 = never still)
//   dashiness    preference for dashing over walking
//   jumpiness    jump-in frequency
//   hitAndRun    after landing a string, disengage instead of staying in
//   cornerCarry  bias movement/pressure toward shoving the foe wallward
//   okiRush      how hard it hunts knockdowns with meaties (vs backing off)
//   spacing      { preferred, tolerance } meters — the range it fights at
//                (v2.0: RADIAL distance on the XZ plane, not lane distance)
//   plane        v2.0 free-roam lateral expression (§17) — how the personality
//                moves on the plane. All 0..1, defaults in DefaultPlane:
//                  orbit      tangential circling intensity around the foe
//                  flip       chance per decision to reverse orbit direction
//                  weave      lateral sway mixed into the approach (0 = beeline)
//                  evade      chance to SIDESTEP (lateral dash) instead of
//                             blocking when a swing is perceived
//                  retreat    backpedal bias while defending / pressured
//                  dashStrafe chance a lateral reposition is a dash burst
//                             (teleport-strafe flavor)
//   strings      arrays of button names run as pressure chains (uses the
//                engine's cancel windows: light->light->heavy etc.)
//   favorites    [{ id, when: [tags], w }] moves picked by situation.
//                Tags: far|mid|close|antiair|oki|punish|pressured|meterFull|
//                      knockedAway|desperate|counter
//
// NOTE for move pickers: never favorite a ['down','light'] normal — every
// roster character has a ['down','down','light'] joke move that out-scores it
// in Fighter.findMove, so crouch+light always summons the joke. The Brain
// leans on this for comedy *deliberately* via 'joke'-kind favorites only.

export const DefaultPlane = {
  orbit: 0.45, flip: 0.25, weave: 0.3, evade: 0.15, retreat: 0.35, dashStrafe: 0.1,
}

export const DefaultPersonality = {
  name: 'Journeyman',
  aggression: 0.55, patience: 0.5, blockChance: 0.4, counterness: 0,
  feintiness: 0.25, meterGreed: 0.6, mobility: 0.6, dashiness: 0.45,
  jumpiness: 0.3, hitAndRun: false, cornerCarry: false, okiRush: 0.5,
  spacing: { preferred: 1.8, tolerance: 0.7 },
  plane: { ...DefaultPlane },
  strings: [['light', 'light', 'heavy'], ['light', 'kick'], ['heavy']],
  favorites: [],
}

export const Personalities = {
  // Relentless rushdown. Dash-dances in your face, spams Buy the Dip the
  // moment you knock it away, always +1 more scratch than you expected.
  dogey: {
    name: 'Rushdown',
    aggression: 0.38, patience: 0.1, blockChance: 0.24, counterness: 0,
    feintiness: 0.55, meterGreed: 0.7, mobility: 0.95, dashiness: 0.95,
    jumpiness: 0.75, hitAndRun: false, cornerCarry: false, okiRush: 0.32,
    spacing: { preferred: 1.55, tolerance: 0.55 },
    // orbits AGGRESSIVELY — circles you at claw range, direction changes often
    plane: { orbit: 0.95, flip: 0.45, weave: 0.8, evade: 0.25, retreat: 0.1, dashStrafe: 0.35 },
    strings: [['light', 'light'], ['light', 'heavy'], ['light']],
    favorites: [
      { id: 'buy-the-dip', when: ['knockedAway', 'far'], w: 2 },
      { id: 'rapid-scratch', when: ['close'], w: 0.5 },
      { id: 'leaping-kick', when: ['antiair', 'close'], w: 1.5 },
      { id: 'diamond-paws', when: ['punish'], w: 0.6 },
      { id: 'hodl-forever', when: ['close'], w: 0.5 },
      { id: 'coin-toss', when: ['mid'], w: 1 },
      { id: 'to-the-moon', when: ['meterFull'], w: 2 },
    ],
  },

  // Trap goblin. Backs off, leaves Exit Liquidity presents on the floor,
  // feints constantly, occasionally does something for no reason at all.
  peepee: {
    name: 'Chaos Trapper',
    aggression: 0.45, patience: 0.55, blockChance: 0.35, counterness: 0,
    feintiness: 0.9, meterGreed: 0.7, mobility: 0.7, dashiness: 0.5,
    jumpiness: 0.6, hitAndRun: true, cornerCarry: false, okiRush: 0.35,
    spacing: { preferred: 3.2, tolerance: 1.1 },
    // skittish drifter — hops around its traps, bails diagonally when rushed
    plane: { orbit: 0.55, flip: 0.5, weave: 0.6, evade: 0.35, retreat: 0.6, dashStrafe: 0.2 },
    strings: [['light', 'light'], ['light', 'heavy'], ['kick']],
    favorites: [
      { id: 'exit-liquidity', when: ['mid', 'far'], w: 3 },
      { id: 'liquidity-leak', when: ['mid'], w: 2 },
      { id: 'frog-market', when: ['close', 'pressured'], w: 1.5 },
      { id: 'frog-kick', when: ['antiair'], w: 2 },
      { id: 'tongue-grab', when: ['close'], w: 2 },
      { id: 'belly-flop', when: ['close'], w: 1 },
      { id: 'pump-and-dump', when: ['meterFull'], w: 2.5 },
      { id: 'ribbit-report', when: ['oki'], w: 0.4 },
    ],
  },

  // Patient turtle. Blocks everything, counter-stances on a read, and when
  // you whiff ONE move it takes half your health bar about it.
  shibro: {
    name: 'Turtle Master',
    aggression: 0.35, patience: 0.9, blockChance: 0.85, counterness: 0.5,
    feintiness: 0.2, meterGreed: 0.4, mobility: 0.35, dashiness: 0.3,
    jumpiness: 0.15, hitAndRun: false, cornerCarry: false, okiRush: 0.4,
    spacing: { preferred: 2.6, tolerance: 0.6 },
    // holds ground, rotating in place to face you — barely a step sideways
    plane: { orbit: 0.08, flip: 0.1, weave: 0.1, evade: 0.1, retreat: 0.15, dashStrafe: 0 },
    strings: [['light', 'heavy'], ['heavy']],
    favorites: [
      { id: 'counter-stance', when: ['counter'], w: 3 },
      { id: 'shoulder-check', when: ['punish'], w: 2 },
      { id: 'rising-chain-attack', when: ['punish', 'antiair'], w: 2 },
      { id: 'chain-dash', when: ['punish', 'mid'], w: 2 },
      { id: 'proof-of-paw', when: ['punish'], w: 2 },
      { id: 'honor-throw', when: ['close'], w: 1.5 },
      { id: 'community-shield', when: ['pressured'], w: 1.5 },
      { id: 'chain-splitter', when: ['meterFull', 'punish'], w: 2.5 },
    ],
  },

  // Barely walks. You come to HIM, and you eat a huge lazy normal for it.
  // Under pressure he simply stops caring (Market Indifference).
  'tired-ape': {
    name: 'Immovable Executive',
    aggression: 0.3, patience: 0.95, blockChance: 0.5, counterness: 0.15,
    feintiness: 0.1, meterGreed: 0.3, mobility: 0.12, dashiness: 0.1,
    jumpiness: 0.05, hitAndRun: false, cornerCarry: false, okiRush: 0.25,
    spacing: { preferred: 2.2, tolerance: 1.2 },
    // furniture. If it moves laterally at all, it was an accident
    plane: { orbit: 0.04, flip: 0.05, weave: 0.05, evade: 0.02, retreat: 0.05, dashStrafe: 0 },
    strings: [['heavy'], ['light', 'heavy']],
    favorites: [
      { id: 'lazy-backhand', when: ['close'], w: 3 },
      { id: 'mug-uppercut', when: ['close', 'antiair'], w: 2 },
      { id: 'robe-spin', when: ['antiair'], w: 2 },
      { id: 'chair-shove', when: ['mid'], w: 1.5 },
      { id: 'market-indifference', when: ['pressured'], w: 3 },
      { id: 'firm-handshake', when: ['close'], w: 1.5 },
      { id: 'yawn-stun', when: ['close'], w: 1 },
      { id: 'meeting-email', when: ['meterFull'], w: 2 },
    ],
  },

  // Mid-range gadgeteer. Lobs hardware from just outside your reach, sets up
  // Cold Storage, then cashes the freeze in with a wrench.
  'fatty-pingo': {
    name: 'Gadget Zoner',
    aggression: 0.4, patience: 0.6, blockChance: 0.4, counterness: 0,
    feintiness: 0.4, meterGreed: 0.75, mobility: 0.5, dashiness: 0.35,
    jumpiness: 0.25, hitAndRun: true, cornerCarry: false, okiRush: 0.45,
    spacing: { preferred: 3.4, tolerance: 1.0 },
    // waddles a slow arc at lob range, backpedals to reset his gadget line
    plane: { orbit: 0.35, flip: 0.3, weave: 0.35, evade: 0.2, retreat: 0.55, dashStrafe: 0.1 },
    strings: [['light', 'light'], ['light', 'heavy']],
    favorites: [
      { id: 'cold-storage', when: ['mid', 'far'], w: 3 },
      { id: 'unstable-prototype', when: ['mid'], w: 2 },
      { id: 'penguin-airdrop', when: ['far'], w: 2 },
      { id: 'backpack-burst', when: ['mid'], w: 2 },
      { id: 'wrench-strike', when: ['punish', 'close'], w: 2 },
      { id: 'belly-bounce', when: ['close'], w: 1.5 },
      { id: 'penguin-piledriver', when: ['close'], w: 1.5 },
      { id: 'belly-of-the-exchange', when: ['meterFull'], w: 2.5 },
    ],
  },

  // Never. Stops. Moving. Darts in, posts a two-hit string, darts out,
  // repeats at 65,000 transactions per second. Meter full = Infinite TPS.
  bonko: {
    name: 'Hit-and-Run',
    aggression: 0.46, patience: 0.05, blockChance: 0.28, counterness: 0,
    feintiness: 0.7, meterGreed: 0.6, mobility: 1, dashiness: 1,
    jumpiness: 0.55, hitAndRun: true, cornerCarry: false, okiRush: 0.45,
    spacing: { preferred: 2.0, tolerance: 0.55 },
    // orbital hummingbird — never the same angle twice, darts on diagonals
    plane: { orbit: 0.85, flip: 0.6, weave: 0.9, evade: 0.3, retreat: 0.3, dashStrafe: 0.5 },
    strings: [['light', 'light'], ['light', 'kick'], ['kick']],
    favorites: [
      { id: 'infinite-tps', when: ['meterFull'], w: 3 },
      { id: 'sprint-tackle', when: ['far', 'mid'], w: 1.2 },
      { id: 'same-block-delivery', when: ['mid'], w: 1 },
      { id: 'gas-free-combo', when: ['close'], w: 0.5 },
      { id: 'sliding-kick', when: ['mid'], w: 1 },
      { id: 'delivery-toss', when: ['close'], w: 1 },
      { id: 'finality-express', when: ['meterFull'], w: 2 },
    ],
  },

  // Teleport mixups and clone feints from exactly magnifying-lens range.
  // You are being investigated and also punched.
  'crypto-punkd': {
    name: 'Mixup Phantom',
    aggression: 0.8, patience: 0.45, blockChance: 0.65, counterness: 0.2,
    feintiness: 0.4, meterGreed: 0.7, mobility: 0.7, dashiness: 0.75,
    jumpiness: 0.25, hitAndRun: true, cornerCarry: false, okiRush: 0.6,
    spacing: { preferred: 1.9, tolerance: 0.7 },
    // teleport-strafes: sudden lateral dash bursts to a new attack angle
    plane: { orbit: 0.6, flip: 0.5, weave: 0.5, evade: 0.5, retreat: 0.25, dashStrafe: 0.85 },
    strings: [['light', 'heavy'], ['light', 'light', 'kick']],
    favorites: [
      { id: 'clone-feint', when: ['mid'], w: 0.8 },
      { id: 'pixel-projectile', when: ['far', 'mid'], w: 3.5 },
      { id: 'glitch-dodge', when: ['pressured', 'counter'], w: 1.5 },
      { id: 'right-click-save', when: ['mid', 'punish'], w: 2.5 },
      { id: 'missing-metadata', when: ['close'], w: 1.5 },
      { id: 'blockchain-detective', when: ['far', 'mid'], w: 2 },
      { id: 'detached-hand-punch', when: ['antiair', 'close', 'mid'], w: 2 },
      { id: 'magnifying-glass-strike', when: ['close', 'punish'], w: 1.5 },
      { id: 'evidence-bag', when: ['close'], w: 2.5 },
      { id: 'floor-price', when: ['meterFull'], w: 2.5 },
    ],
  },

  // Near-motionless. Lets you walk into a wall made of counters, and if you
  // start a long string it goes Still Cool and you regret your choices.
  'cool-pal': {
    name: 'Zen Wall',
    aggression: 0.56, patience: 1, blockChance: 0.92, counterness: 0.5,
    feintiness: 0.1, meterGreed: 0.5, mobility: 0.1, dashiness: 0.05,
    jumpiness: 0.05, hitAndRun: false, cornerCarry: false, okiRush: 0.6,
    spacing: { preferred: 1.9, tolerance: 1.0 },
    // backpedals + sidesteps: gives ground calmly, slips swings sideways
    plane: { orbit: 0.2, flip: 0.2, weave: 0.1, evade: 0.6, retreat: 0.75, dashStrafe: 0.05 },
    strings: [['light', 'heavy'], ['heavy']],
    favorites: [
      { id: 'calm-counter', when: ['counter'], w: 3 },
      { id: 'still-cool', when: ['pressured'], w: 3 },
      { id: 'zero-stress', when: ['pressured'], w: 1.5 },
      { id: 'touch-grass', when: ['punish', 'mid'], w: 1.8 },
      { id: 'headphone-swing', when: ['antiair'], w: 2 },
      { id: 'yawn-push', when: ['close'], w: 2.5 },
      { id: 'nap-time', when: ['close'], w: 2 },
      { id: 'gentle-guidance', when: ['close'], w: 1.5 },
      { id: 'log-off', when: ['meterFull'], w: 2 },
    ],
  },

  // Forward-pressure tank. Armors straight through your pokes, walks you to
  // the corner like it's a board meeting, God Candle the moment you're down.
  'blackish-bull': {
    name: 'Pressure Tank',
    aggression: 0.8, patience: 0.2, blockChance: 0.65, counterness: 0.35,
    feintiness: 0.15, meterGreed: 0.8, mobility: 0.8, dashiness: 0.55,
    jumpiness: 0.1, hitAndRun: false, cornerCarry: true, okiRush: 0.9,
    spacing: { preferred: 1.2, tolerance: 0.5 },
    // walks STRAIGHT THROUGH you — zero orbit, zero weave, never a step back
    plane: { orbit: 0.05, flip: 0.05, weave: 0, evade: 0.05, retreat: 0, dashStrafe: 0 },
    strings: [['light', 'heavy'], ['light', 'light', 'heavy']],
    favorites: [
      { id: 'shoulder-charge', when: ['mid', 'far'], w: 2.5 },
      { id: 'armor-stance', when: ['pressured'], w: 1 },
      { id: 'bull-rush', when: ['mid'], w: 2 },
      { id: 'full-port', when: ['punish'], w: 2 },
      { id: 'infinite-conviction', when: ['close'], w: 1.5 },
      { id: 'maximum-leverage', when: ['mid'], w: 1.5 },
      { id: 'market-correction', when: ['close'], w: 2.5 },
      { id: 'grapple-toss', when: ['close'], w: 1.5 },
      { id: 'god-candle', when: ['meterFull', 'oki'], w: 3 },
    ],
  },

  // The honest protagonist: a bit of everything, no gimmicks, reads the
  // whitepaper AND the room.
  wally: {
    name: 'All-Rounder',
    aggression: 0.6, patience: 0.5, blockChance: 0.45, counterness: 0.1,
    feintiness: 0.3, meterGreed: 0.6, mobility: 0.65, dashiness: 0.5,
    jumpiness: 0.3, hitAndRun: false, cornerCarry: true, okiRush: 0.55,
    spacing: { preferred: 1.8, tolerance: 0.7 },
    // textbook footwork: measured circling, the occasional clean sidestep
    plane: { orbit: 0.5, flip: 0.3, weave: 0.4, evade: 0.2, retreat: 0.3, dashStrafe: 0.15 },
    strings: [['light', 'light', 'heavy'], ['light', 'kick'], ['light', 'heavy']],
    favorites: [
      { id: 'tusky-uppercut', when: ['antiair'], w: 2 },
      { id: 'market-stomp', when: ['close', 'oki'], w: 1.5 },
      { id: 'herd-charge', when: ['mid'], w: 1.5 },
      { id: 'tokenization-tornado', when: ['mid'], w: 1.5 },
      { id: 'compound-interest', when: ['punish'], w: 1.5 },
      { id: 'bull-market-mode', when: ['far'], w: 1.5 },
      { id: 'rug-pull', when: ['close'], w: 1.5 },
      { id: 'trunk-grab', when: ['close'], w: 1 },
      { id: 'permanent-reserve', when: ['meterFull'], w: 2 },
    ],
  },
}

// Story-mode final boss: the bull, unchained — everything cranked.
Personalities['blackish-bull-unchained'] = {
  ...Personalities['blackish-bull'],
  name: 'Unchained',
  aggression: 1, blockChance: 0.45, meterGreed: 1, mobility: 0.95,
  okiRush: 1, feintiness: 0.25,
  favorites: [
    ...Personalities['blackish-bull'].favorites,
    { id: 'reserve-collapse', when: ['mid', 'punish', 'oki'], w: 2.5 },
  ],
}

export function getPersonality(charId) {
  return Personalities[charId] || DefaultPersonality
}
