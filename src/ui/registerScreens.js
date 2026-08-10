// UI module entry — registers every screen, installs the retro chrome overlay
// (scanlines + vignette) and the event-driven match HUD. Returns the initial
// screen name per CONTRACTS.md §2.
import './ui.css'
import { MatchScreen } from '../combat/MatchScreen.js'
import { StoryScreen } from '../modes/StoryMode.js'
import { ArcadeScreen } from '../modes/ArcadeMode.js'
import { TrainingScreen } from '../modes/TrainingMode.js'
import { PlaygroundScreen } from '../modes/RagdollPlayground.js'
import { IntroScreen } from '../modes/IntroCinematic.js'
import { LoadingScreen } from './screens/LoadingScreen.js'
import { TitleScreen } from './screens/TitleScreen.js'
import { MenuScreen } from './screens/MenuScreen.js'
import { SelectScreen } from './screens/SelectScreen.js'
import { VsScreen } from './screens/VsScreen.js'
import { ResultsScreen } from './screens/ResultsScreen.js'
import { SettingsScreen } from './screens/SettingsScreen.js'
import { GalleryScreen } from './screens/GalleryScreen.js'
import { MovelistScreen } from './screens/MovelistScreen.js'
import { CreditsScreen } from './screens/CreditsScreen.js'
import { Hud } from './Hud.js'
import { TouchControls } from './TouchControls.js'
import { el, resetMusicTracker } from './uiKit.js'
import { getBackdrop } from './MenuBackdrop.js'

// 'exhibition' is a select-screen configuration rather than a real screen —
// anything that lands here forwards to select (mode 'exhibition') on its first
// frame, rendering the shared backdrop meanwhile so nothing flashes black.
class ExhibitionRedirect {
  constructor(game) { this.game = game }
  enter() { this.backdrop = getBackdrop(this.game) }
  exit() { this.backdrop = null }
  update(dt) {
    this.backdrop?.update(dt)
    this.game.screens.goto('select', { mode: 'exhibition' })
  }
  render(renderer, dt) { this.backdrop?.render(renderer, dt) }
}

export function registerScreens(game) {
  // persistent CRT-ish chrome on top of everything
  const chrome = el('div', 'wcs-chrome')
  chrome.appendChild(el('div', 'wcs-chrome-scanlines'))
  chrome.appendChild(el('div', 'wcs-chrome-vignette'))
  game.ui.appendChild(chrome)

  // the HUD lives for the whole session; it mounts/unmounts itself on
  // 'match:start' / 'match:end' events
  game.hud = new Hud(game)

  // v2.0 mobile: virtual touch overlay — auto on touch devices, forceable for
  // desktop testing via localStorage wcs-touch=1 (or =0 to suppress). Shows
  // itself only during fights; menus stay tap-driven.
  if (TouchControls.wanted(game)) game.touchControls = new TouchControls(game)

  // combat plays its own battle music — forget the UI's track so menu music
  // reliably restarts when we come back from a match
  game.events.on('screen:changed', ({ name }) => {
    if (name === 'match') resetMusicTracker()
  })

  // core flow
  game.screens.register('loading', new LoadingScreen(game))
  game.screens.register('title', new TitleScreen(game))
  game.screens.register('menu', new MenuScreen(game))
  game.screens.register('select', new SelectScreen(game))
  game.screens.register('vs', new VsScreen(game))
  game.screens.register('match', new MatchScreen(game))
  game.screens.register('results', new ResultsScreen(game))
  game.screens.register('settings', new SettingsScreen(game))

  // game modes (src/modes/)
  game.screens.register('story', new StoryScreen(game))
  game.screens.register('arcade', new ArcadeScreen(game))
  game.screens.register('training', new TrainingScreen(game))
  game.screens.register('playground', new PlaygroundScreen(game))
  game.screens.register('intro', new IntroScreen(game))
  game.screens.register('exhibition', new ExhibitionRedirect(game))

  // extras
  game.screens.register('gallery', new GalleryScreen(game))
  game.screens.register('movelist', new MovelistScreen(game))
  game.screens.register('credits', new CreditsScreen(game))

  return 'loading'
}
