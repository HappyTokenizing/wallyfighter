// OWNED BY ORCHESTRATOR — registry of playable fighters. Module agents never edit this.
import { WallyDef } from './wally.js'
import { DogeyDef } from './dogey.js'
import { PeepeeDef } from './peepee.js'
import { ShibroDef } from './shibro.js'
import { TiredApeDef } from './tired-ape.js'
import { FattyPingoDef } from './fatty-pingo.js'
import { BonkoDef } from './bonko.js'
import { CryptoPunkdDef } from './crypto-punkd.js'
import { CoolPalDef } from './cool-pal.js'
import { BlackishBullDef, BlackishBullUnchainedDef } from './blackish-bull.js'

export const Characters = {
  wally: WallyDef,
  dogey: DogeyDef,
  peepee: PeepeeDef,
  shibro: ShibroDef,
  'tired-ape': TiredApeDef,
  'fatty-pingo': FattyPingoDef,
  bonko: BonkoDef,
  'crypto-punkd': CryptoPunkdDef,
  'cool-pal': CoolPalDef,
  'blackish-bull': BlackishBullDef,
}

// Story-mode round 10 boss form — deliberately NOT in Characters/RosterOrder.
export const UnchainedBull = BlackishBullUnchainedDef

export const RosterOrder = [
  'wally', 'dogey', 'peepee', 'shibro', 'tired-ape',
  'fatty-pingo', 'bonko', 'crypto-punkd', 'cool-pal', 'blackish-bull',
]

// Display-name fallback for slots without a registered def (none remain, but the
// UI references this for locked-slot rendering).
export const RosterNames = {
  peepee: 'PEEPEE', shibro: 'SHIBRO', 'tired-ape': 'TIRED APE',
  'fatty-pingo': 'FATTY PINGO', bonko: 'BONKO', 'crypto-punkd': "CRYPTO PUNK'D",
  'cool-pal': 'COOL PAL', 'blackish-bull': 'THE BLACKISH BULL',
}
