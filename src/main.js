import * as THREE from 'three'
import { Game } from './core/Game.js'
import { GameConfig } from './config/GameConfig.js'
import { AudioLibrary, wireAudioEvents } from './audio/library.js'
import { wireCrowdChants } from './audio/crowd.js'

console.info(`[WCS] ${GameConfig.title} v${GameConfig.version} — three r${THREE.REVISION}`)

const game = new Game(document.getElementById('app'), document.getElementById('ui-root'))
game.audio.installLibrary(AudioLibrary)
wireAudioEvents(game)
wireCrowdChants(game) // §19 name chants ride the event bus, not the engine
game.start()

// handy for console poking during development
window.__game = game
