// OWNED BY ORCHESTRATOR — registry of arenas. Module agents never edit this.
import { MemeMarket } from './memeMarket.js'
import { LiquiditySwamp } from './liquiditySwamp.js'
import { FrozenTokenLab } from './frozenTokenLab.js'
import { SettlementExpress } from './settlementExpress.js'
import { MountainNodeVillage } from './mountainNodeVillage.js'
import { LostBlockMuseum } from './lostBlockMuseum.js'
import { InstitutionalCapitalTower } from './institutionalCapitalTower.js'
import { CalmBeforeLiquidation } from './calmBeforeLiquidation.js'
import { BullMarketColosseum } from './bullMarketColosseum.js'
import { PermanentReserveCore } from './permanentReserveCore.js'

export const Arenas = {
  'meme-market': MemeMarket,
  'liquidity-swamp': LiquiditySwamp,
  'frozen-token-lab': FrozenTokenLab,
  'settlement-express': SettlementExpress,
  'mountain-node-village': MountainNodeVillage,
  'lost-block-museum': LostBlockMuseum,
  'institutional-capital-tower': InstitutionalCapitalTower,
  'calm-before-liquidation': CalmBeforeLiquidation,
  'bull-market-colosseum': BullMarketColosseum,
  'permanent-reserve-core': PermanentReserveCore,
}

// Story order.
export const ArenaOrder = [
  'meme-market',
  'liquidity-swamp',
  'frozen-token-lab',
  'settlement-express',
  'mountain-node-village',
  'lost-block-museum',
  'institutional-capital-tower',
  'calm-before-liquidation',
  'bull-market-colosseum',
  'permanent-reserve-core',
]
