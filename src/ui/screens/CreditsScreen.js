// Credits — auto-scrolling retro crawl over the 3D backdrop. Hold down/confirm
// to fast-forward, ESC to bail. Returns to the menu when the crawl completes.
import { RosterOrder } from '../../characters/index.js'
import { el, ensureMusic, charName, hintHTML } from '../uiKit.js'
import { getBackdrop } from '../MenuBackdrop.js'

const SCROLL_SPEED = 58    // px/s
const BOOST_SPEED = 360    // px/s while held

const ROLES = [
  ['EXECUTIVE PRODUCER OF SYNERGY', 'CHAD MAXIMUS'],
  ['DIRECTOR OF NUMBER GO UP', 'DR. LAMBO SOON'],
  ['CHIEF VIBES OFFICER', 'A LAVA LAMP'],
  ['HEAD OF RAGDOLL RELATIONS', 'SIR FLOPSALOT III'],
  ['POLYGON BUDGET ENFORCEMENT', 'TRI ANGLE, ESQ.'],
  ['LEAD WHITEPAPER AUTHOR', 'UNREAD & PROUD'],
  ['COMBAT BALANCE CONSULTANT', 'A COIN FLIP'],
  ['QUALITY ASSURANCE', 'ONE (1) ROOMBA'],
  ['LEGAL COUNSEL', '[REDACTED BY LEGAL COUNSEL]'],
  ['MOTION CAPTURE', 'NOBODY. IT SHOWS.'],
  ['CATERING', 'EXIT LIQUIDITY GRILL & BUFFET'],
  ['CRISIS MANAGEMENT', 'CTRL+Z'],
]

const TECH_NOTES = [
  'RENDERED IN GLORIOUS LOW-POLY BY THREE.JS',
  'PHYSICS CRIMES COMMITTED WITH CANNON-ES',
  'SHIPPED AT LUDICROUS SPEED BY VITE',
  'EXTERNAL ASSETS DOWNLOADED: ZERO',
  'EVERY MODEL, TEXTURE AND SOUND: 100% PROCEDURAL, 0% PRE-MINED',
  'ANNOUNCER SYNTHESIZED LIVE — WE COULD NOT AFFORD A MAN',
  'SAVE DATA LIVES IN LOCALSTORAGE, LIKE YOUR PRIVATE KEYS. BE CAREFUL.',
]

const THANKS = [
  'YOUR GPU (SORRY)',
  'EVERY RAGDOLL THAT NEVER GOT UP',
  'THE 2002 ARCADE SCENE, POSTHUMOUSLY',
  'YOU, FOR PRESSING BUTTONS',
]

export class CreditsScreen {
  constructor(game) { this.game = game }

  enter() {
    this.backdrop = getBackdrop(this.game)
    this.done = false

    const roles = ROLES
      .map(([r, n]) => `<div class="cred-role"><span class="r">${r}</span><span class="n">${n}</span></div>`)
      .join('')
    const cast = RosterOrder
      .map((id) => `<div class="cred-role"><span class="n">${charName(id)}</span><span class="r">AS THEMSELVES</span></div>`)
      .join('')
    const tech = TECH_NOTES.map((t) => `<div class="cred-line">${t}</div>`).join('')
    const thanks = THANKS.map((t) => `<div class="cred-line">${t}</div>`).join('')

    this.root = el('div', 'wcs-screen wcs-credits')
    this.root.innerHTML = `
      <div class="wcs-dim"></div>
      <div class="cred-scroll">
        <div class="cred-big">
          <div class="l1">WALLY</div>
          <div class="l2">CRYPTO SMACKDOWN</div>
        </div>
        <div class="cred-studio">A TOTALLY REAL GAME STUDIOS PRODUCTION</div>

        <div class="cred-h">THE SUITS</div>
        ${roles}

        <div class="cred-h">STARRING</div>
        ${cast}
        <div class="cred-role"><span class="n">???</span><span class="r">AND INTRODUCING — CONTRACTUALLY UNCHAINED</span></div>

        <div class="cred-h">TECH NOTES</div>
        ${tech}

        <div class="cred-h">SPECIAL THANKS</div>
        ${thanks}

        <div class="cred-disc">NO CRYPTOCURRENCIES WERE HARMED IN THE MAKING OF THIS GAME.</div>
        <div class="cred-fin">IT WAS NOT FINANCIAL ADVICE.</div>
        <div class="cred-copy">© 2002 TOTALLY REAL GAME STUDIOS · ALL RIGHTS RESERVED-ISH · NO REFUNDS</div>
        <div class="cred-return">WALLY WILL RETURN IN "WALLY 2: THE RE-PEG"</div>
      </div>
      <div class="cred-fade top"></div>
      <div class="cred-fade bot"></div>
      ${hintHTML(this.game, 'HOLD <b>&darr; / J</b> FAST-FORWARD &nbsp; <b>ESC</b> BACK')}
    `
    this.game.ui.appendChild(this.root)
    this.scrollEl = this.root.querySelector('.cred-scroll')
    this.y = innerHeight
    this.scrollEl.style.transform = `translateY(${this.y}px)`
  }

  exit() {
    this.root?.remove()
    this.root = null
    this.scrollEl = null
  }

  update(dt) {
    if (this.done) return
    ensureMusic(this.game, 'results')
    this.backdrop.update(dt)

    const input = this.game.input
    if (input.menuPressed('back')) {
      this.done = true
      this.game.audio.sfx('menu_back')
      this.game.screens.goto('menu')
      return
    }
    const boost =
      input.isDown(0, 'crouch') || input.isDown(1, 'crouch') ||
      input.isDown(0, 'light') || input.isDown(1, 'light')
    this.y -= (boost ? BOOST_SPEED : SCROLL_SPEED) * dt
    this.scrollEl.style.transform = `translateY(${this.y}px)`

    if (this.y < -(this.scrollEl.offsetHeight + 80)) {
      this.done = true
      this.game.audio.sfx('menu_confirm')
      this.game.screens.goto('menu')
    }
  }

  render(renderer, dt) { this.backdrop.render(renderer, dt) }
}
