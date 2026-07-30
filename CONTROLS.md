# WALLY: CRYPTO SMACKDOWN — Controls

Everything below reflects the default bindings in `src/config/GameConfig.js`.
Keyboard bindings can be remapped in **Settings → controls** (Player 1 —
including the **Item** action): select an action and press the new key
(**Esc** cancels the capture, **RESET** restores the defaults). Changes apply
instantly and persist in the save file (`controls.p1` overrides are honored
on boot). The touch overlay reads the same bindings, so remaps carry over.

## Moving around (v2.0 free-roam)

v2.0 unlocked the lane: fighters move **freely across the whole arena floor**,
walled on all four sides.

- **Camera-relative movement:** the camera rides behind your fighter, and
  W/A/S/D (or the pad stick) move relative to it — **W** walks deeper into
  the arena, **S** comes back toward the camera, **A/D** strafe.
- **Soft lock-on:** your fighter automatically turns to face the opponent
  whenever you attack or come within combat range (~6 m). You never aim —
  you position. Movelist inputs written as "forward" always resolve to
  **toward the opponent**, whatever direction that is on screen.
- **Dash:** double-tap any movement direction quickly (within ~12 frames).
  Dashing toward the opponent covers ground; dashing away is shorter and
  briefly invulnerable.
- **Jump drift:** hold a direction in the air for partial air control. Light,
  Heavy and Kick work airborne.
- **Walls:** all four arena walls bounce — launched fighters (and ragdolls)
  ricochet off any of them.

## Fight controls — keyboard

| Action        | Key        |
|---------------|------------|
| Move          | W / A / S / D |
| Jump          | Space      |
| Crouch        | C          |
| Light attack  | J          |
| Heavy attack  | K          |
| Kick          | L          |
| Grab / throw  | U          |
| Special       | I          |
| Super         | O          |
| Block (hold)  | Left Shift |
| Use item      | E          |
| Pause         | Esc        |

## Fight controls — gamepad (standard mapping)

| Action        | Button |
|---------------|--------|
| Move / dash   | Left stick or D-pad (double-tap to dash) |
| Jump          | A / Cross |
| Light attack  | X / Square |
| Heavy attack  | Y / Triangle |
| Kick          | B / Circle |
| Block (hold)  | LB |
| Grab / throw  | LT |
| Special       | RB |
| Super         | RT |
| Use item      | Select / Back |
| Pause         | Start |

Crouch has no default pad button — it stays on the keyboard (**C**), and
keyboard and pad work simultaneously, so crouch inputs (including the joke
move) are always available. The first pad to connect drives **Player 1**.

## Fight controls — touch (v2.1 simplified)

Touch devices auto-show a translucent overlay during fights (menus stay
plain tap targets — the overlay never covers them). v2.1 replaced the old
nine-button wall with a stick and **four buttons**:

- **Lower left — virtual stick.** Touch anywhere in the lower left region
  and drag: the stick re-centers under your finger. It feeds the same
  camera-relative movement as WASD (up on the screen = deeper into the
  arena). Flick-double-tap a direction to dash. **Flick straight down to
  full deflection** for a crouch *tap* (holding the stick down still just
  retreats — only the hard down-flick crouches).
- **Right cluster — the four buttons:**
  - **ATTACK** (big, bottom) — your light attack; chains cover everything
    the old KICK button did.
  - **HEAVY** (right).
  - **SPECIAL** (left) — tap (or hold) for a special. With a **full meter**,
    keep it pressed: a gold ring fills around the button and at **~0.6 s**
    your **SUPER** fires. Let go early and it falls back to a normal special.
  - **GRAB/ITEM** (top) — contextual: empty-handed it grabs; holding an item
    it shows that item's icon and **uses** it.
- **BLOCK — hold anywhere on the upper-left half of the screen** (the area
  above the stick zone). The zone outlines itself with a HOLD-HERE hint once,
  on your first match. Multi-touch is fully supported: hold block with one
  finger while steering with another.
- **JUMP** — a small button by the cluster's corner, present **only while
  the Jumping setting is ON** (Settings → JUMPING).
- **Pause chip** below the P2 health bar.
- **No KICK button** — a deliberate v2.1 simplification. Kick and the few
  move-list inputs that require it are keyboard/gamepad-only on this scheme;
  light chains fill the gap. The hidden joke move survives: **two hard
  down-flicks of the stick, then ATTACK**.
- **Landscape only.** Portrait gets a ROTATE DEVICE screen instead of a bad
  time.
- Desktop testing / overrides: localStorage key `wcs-touch` — `1` forces the
  overlay available on any machine, `0` suppresses it on touch laptops.

## Items

Every arena serves pickup items during the fight (their absurdity scales with
the venue — office junk in the Meme Market, reality-bending artifacts in the
Permanent Reserve Core). v2.1 delivery: each arena starts its rounds with
**two authored item spots**, and while the floor is light the **audience
hurls more in from the stands** every 20–30 s (watch for the telegraphed
landing ring). Breaking props sometimes ejects a glowing **heart pickup**
(+12 HP) — first fighter to reach it, either side, gets the heal.

- **Pick up:** walk over an item with empty hands — pickup is automatic.
- **Use:** press **E** (pad **Select**, touch **GRAB/ITEM**) to use the held
  item. The HUD shows what each fighter is holding next to the meter bars.
- At most **two items on the ground** and **one in hand** per fighter. Ground
  items despawn after ~15 seconds (they blink first).
- The CPU picks up and uses items too (difficulty 2 and up). Watch its hands.

## Menu navigation

| Action   | Keyboard              | Touch |
|----------|-----------------------|-------|
| Navigate | Arrow keys or W/A/S/D | Tap the entry |
| Confirm  | Enter, J or Space     | Tap again / tap |
| Back     | Esc, K or Backspace   | On-screen back where shown |

Gamepad: the left stick / D-pad moves the cursor, **X/Square** confirms,
**Y/Triangle** backs out.

- **Title screen:** literally any button (or tap) advances.
- **VS splash:** Confirm or Back skips it.
- **Intro cinematic:** any key, click, tap or pad button skips from frame one.
- **Character select:** picks are sequential — your fighter first, then your
  CPU opponent, then (in Versus CPU) the **AI difficulty row**: ←/→ picks
  level 1–5, Confirm fights, Esc goes back a step. **Heavy (K / pad Y) swaps
  costume A/B** on this screen — costume wins over "back" here.
- **Pause menu:** ↑/↓ and Confirm; Esc resumes; every entry is tappable.
  Quitting from Story or Arcade returns to that mode's hub, never eats your
  progress.
- **F3** (anywhere): FPS / screen / quality debug overlay.

## Story chapter 1 — the tutorial

Chapter 1 of Story Mode opens as a guided tutorial: sequential objective
cards (move, jump, block, a light combo, heavy, kick, grab, special, super
with granted meter, item pickup + use, and a finishing KO with a granted
setup — the execution plays itself, v2.1) with the key glyphs matching your
device — keyboard keys or touch buttons. The jump step is skipped when the
Jumping setting is OFF. The opponent stays docile until the final live
fight. Skip it anytime; finishing it counts as the chapter 1 victory and
the campaign rolls on.

## Combo grammar (universal)

Every fighter obeys the same grammar; the movelist screen has their specifics.

- **Chains:** on contact, **Light** cancels into Light, Heavy, Kick, Launcher,
  Special or Super. **Heavy / Kick / Launcher** cancel into Special or Super.
  **Special** cancels into Super. Up to 4 cancels deep per string.
- **Scaling:** each consecutive combo hit deals ×0.9 of the last (floor ×0.3).
- **Buffer:** inputs read from a rolling buffer with ~8 frames of leniency, so
  sequences and chords can be sloppy-ish. Not sloppy. Sloppy-*ish*.
- **Facing:** thanks to soft lock-on, attacks aim at the opponent within a
  generous cone — "forward" in any input always means toward them.
- **Launchers:** every fighter has at least two — they pop the opponent up for
  juggles, and juggled foes hang slightly for generous follow-ups.
- **Throws (Grab) beat block.** Blocking otherwise kills chip damage from
  normals; specials still chip a little.
- **Counter hits** (interrupting a startup) deal +50% and get announced.
- **Meter** builds by dealing and taking damage, 0–100. **Super costs the full
  100.**
- **KO EXECUTIONS ARE AUTOMATIC (v2.1):** the old FINISHER prompt and its
  Special + Heavy chord are **gone**. Land the blow that ends a round and an
  execution cutscene plays itself — the HUD stamps "FINISH THE POSITION!"
  as it starts. Which one you get is tiered by the killing move: **lights and
  kicks** earn quick flourishes, **heavies / launchers / grabs** get the
  mid-size treatment, and **specials / supers** unlock the ABSURD pool
  (steamroller, liquidation truck, orbital candle strike, hand of the market,
  bear raid, ETF vacuum, final audit, the rug and friends — including your
  fighter's own signature finisher, and they echo the special that landed
  when they recognize it). Never the same one twice in a row per tier, and
  **any button, key or tap skips it** straight to the round result.

### The hidden joke move

Every fighter has one, on the same input: **Crouch, Crouch, Light**
(keyboard: **C, C, J**).

What each one does is a matter between you, the fighter, and the SEC. Their
names, for the collectors:

| Fighter | Joke move |
|---|---|
| WALLY | This Is Financial Advice |
| DOGEY | Good Boy |
| PEEPEE | Ribbit Report |
| SHIBRO | Good Validator |
| TIRED APE | Out of Office |
| FATTY PINGO | Cold Wallet |
| BONKO | Lost Package |
| CRYPTO PUNK'D | Not Your Keys |
| COOL PAL | Do Not Disturb |
| THE BLACKISH BULL | Bear Costume |

## Training Room extra keys

All toggles are also clickable (and tappable) in the on-screen TRAINING TOOLS
panel.

| Key | Effect |
|-----|--------|
| F1  | Infinite HP (both fighters, auto-refill) |
| F2  | Full meter (P1, always topped up) |
| F4  | Show hit/hurtbox wireframes |
| F5  | Input history strip |
| F6  | Frame-data readout (last move: kind, damage, startup/active/recovery) |
| F7  | Move list panel |
| R   | Reset positions, timer, props |

(F3 is not skipped by accident — it's the global FPS overlay.)

## Ragdoll Playground extra keys

All actions are also clickable in the TOYBOX CONTROLS legend.

| Key | Effect |
|-----|--------|
| Q   | Launch a puppet left |
| W   | Launch a puppet up |
| E   | Launch a puppet right |
| L   | Launch at a random angle |
| P   | Spawn current prop at the cursor |
| O   | Cycle prop kind (coin, crate, vault door, rocket, candle, chair, monitor, box) |
| X   | Explosion at the cursor |
| D   | Airdrop 10 random props |
| C   | Build a prop tower (with a candle on top, obviously) |
| B   | Cycle physics preset (Standard → Silly → Unhinged) |
| T   | Toggle slow-mo |
| R   | Reset the sandbox |
| Left click | Drop the current prop at the cursor |
| Gravity slider | Drag it. See what happens. |
| Esc | Back to menu |

## Legacy P2 bindings (training dummy / debug)

Local 2-player was removed in v1.1 — versus is **Versus CPU** now. The old
Player-2 keyboard bindings still exist in the engine for driving the training
dummy and for debugging, but the Settings remap panel no longer edits them
(saved `controls.p2` overrides from v1.0 are preserved and still honored):

| Action | Key | | Action | Key |
|---|---|---|---|---|
| Move (strafe) | ← / → | | Grab | Numpad 4 |
| Move (depth) | ↑ / ↓ | | Special | Numpad 5 |
| Jump | Numpad 8 | | Super | Numpad 6 |
| Crouch | Numpad 9 | | Block | Numpad 0 |
| Light | Numpad 1 | | Item | Numpad 7 |
| Heavy | Numpad 2 | | Kick | Numpad 3 |
