// ---------------------------------------------------------------------------
// src/render/env.js — procedural image-based lighting.
//
// GRAPHICS_CONTRACT.md §5. Every mood is an analytic sky (gradient + sun disc at
// a real angular size + horizon haze + ground bounce + cloud bands + optional
// interior softbox panels) rendered into a half-float cube render target and
// then PMREM-prefiltered into the roughness-mip pyramid MeshStandardMaterial
// wants for `scene.environment`.
//
// WHY analytic instead of a canvas skybox: an IBL is only worth having if it
// carries values above 1.0. A canvas texture is LDR — clamped at white — so a
// chrome ball lit by it reads as flat grey paint. Rendering into a HalfFloatType
// cube lets the sun disc sit at 8-14 linear units, which is what produces a real
// specular glint and a believable falloff into the horizon haze.
//
// WHY the sun direction lives in this table: the env sun and the arena's key
// light must agree, or every metal surface reflects a sun that is not where the
// shadows say it is — the single most common tell of a hobby frame. lighting.js
// reads `MOODS[x].sunDir` / `.sun` and derives its key from them.
//
// Nothing here uses Math.random(); cloud fields are hashed from `seed`.
// ---------------------------------------------------------------------------

import * as THREE from 'three'

// Angular diameter of the real sun, in degrees. Moods that want a softbox
// instead of a star widen `sunSize` from here.
export const SUN_ANGULAR_DIAMETER = 0.53

const MAX_PANELS = 4

// ---------------------------------------------------------------------------
// ROUND 4 — THE HOTSPOT REWRITE. Read this before touching any sun number.
//
// The blind AAA comparison has said the same thing six rounds running: "NO
// SPECULAR LOBE ANYWHERE IN ANY OF THE ELEVEN FRAMES." It also diagnosed the
// cause, correctly, and the cause is this file: the brightest feature in the
// environment map subtended 22-30 degrees at a radiance of 0.5-1.5. Under an
// emitter that wide and that dim there is no roughness value on any fighter
// that can produce a visible hotspot, because a prefiltered environment can
// only give back what you put in.
//
// THE PHYSICS, in the two lines that decide every number below.
//
// A disc of angular RADIUS t (radians) and radiance L delivers irradiance
//     E = L * Omega,  Omega = 2*PI*(1 - cos t)  ~= PI*t^2
// and, after PMREM prefiltering, the radiance a GGX lobe of roughness r reads
// back at the mirror direction is approximately
//     P(r) ~= L * t^2 / (t^2 + a^2),   a = r^2   (GGX alpha)
// Substituting L = E / (PI*t^2) gives the number that matters:
//     P(r) ~= E / (PI * (t^2 + a^2))
//
// Read that again: FOR A SMALL SOURCE THE HOTSPOT DEPENDS ONLY ON ITS
// IRRADIANCE AND ITS SIZE — not on how bright you make a wide one. At r = 0.3
// (a = 0.09) a source of ANY size below ~5 deg with E = 0.25 gives P ~= 9.8,
// which is a hotspot an order of magnitude above the surrounding sky. The old
// table's 22-degree, 1.5-radiance overcast dome had E = 0.17 spread over
// t = 0.19, giving P(0.3) = 1.5 — i.e. exactly the sky it sits in. Invisible.
// By construction. No material could have fixed it.
//
// So the mood table no longer authors a radiance at all. It authors
//   sunSize : the angular DIAMETER of the brightest feature, in degrees
//   sunE    : the IRRADIANCE that feature delivers, in linear units
// and `getMood()` solves the radiance L = sunE / Omega. That keeps the two
// halves honest: `sunSize` is an art decision (how tight is the glint), `sunE`
// is an energy decision (how much light does the source actually carry), and
// neither can silently cancel the other the way a hand-picked radiance did.
//
// WHY 1-4 DEGREES AND NOT 0.53. The real sun is 0.53 deg, but the cube faces
// are rendered at 256 px, i.e. 0.35 deg per texel, so a 0.53-degree disc is
// 1.5 texels and lands on the PMREM chain as an aliased sparkle. Everything
// here is 1.3 deg or wider (>= 3.7 texels), which is inside the "1-4 deg for
// stylised work" band and resolves cleanly. Overcast and interior moods go
// wider (2.4-7 deg) because a broader, softer hotspot is what those moods
// mean — but they are still SMALL relative to a 22-30 degree dome, and they
// still carry a real E, so they still produce a lobe.
//
// WHY THE DISC CAN BE 700x THE SKY AND NOTHING BLOWS UP. The cube target is
// HalfFloatType (max 65504) and the biggest disc radiance in the table is 883.
// Nothing renders this texture directly — `applyEnvironment` only sets
// `scene.background` when a caller explicitly asks for it, and no arena does —
// so the disc is only ever seen through the PMREM's roughness mips and through
// specular reflections, which is precisely where we want it.
//
// Report figures for every mood are produced by `moodHotspot(name)`.
// ---------------------------------------------------------------------------

// Any `sunIntensity` below this is read as a LEGACY radiance (the pre-round-4
// 0.5-15 range) and discarded in favour of solving from `sunE`. Arenas ship
// partial mood overrides — memeMarket's DUSK_ENV carries `sunIntensity: 3.4` —
// and those files are owned by other agents, so the override has to degrade to
// "keep my colour and my disc size, take the calibrated energy" rather than
// silently reinstating a flat, lobe-free sun in one arena out of ten.
export const LEGACY_SUN_RADIANCE_MAX = 60

/** Solid angle (steradians) of a disc of angular DIAMETER `deg`. */
export function discSolidAngle(deg) {
  const half = THREE.MathUtils.degToRad(Math.max(1e-4, deg)) * 0.5
  return 2 * Math.PI * (1 - Math.cos(half))
}

// ---------------------------------------------------------------------------
// Mood table.
//
// Per the contract each mood carries { sky, horizon, ground, sun, sunSize,
// sunIntensity, ambient, clouds, contrast }. We add (documented in the report):
//   sunDir     [x,y,z]  — world direction TO the sun; the key light reads this
//   haze/hazeStrength/hazeFalloff — horizon band
//   gradPow / groundPow / saturation / gain — gradient shaping
//   panels[]   — interior softboxes/strips for the no-sky moods
//   seed / drift — deterministic cloud field selection
//
// `sunSize` is the angular DIAMETER of the brightest feature, in degrees.
// `sunE` is the IRRADIANCE that feature delivers, in linear units; the peak
// radiance is solved from the pair (see the HOTSPOT REWRITE note above and
// `moodHotspot()`). A literal `sunIntensity` in this table is legacy and is
// ignored unless it is above LEGACY_SUN_RADIANCE_MAX.
//
// `gain` is the mood's ENVIRONMENT EXPOSURE TRIM — see MOOD_EXPOSURE. It is
// applied inside the sky shader, so it works no matter what `intensity` a
// caller passes to applyEnvironment (ArenaBase always passes an explicit 1).
// ---------------------------------------------------------------------------
export const MOODS = {
  // Neutral three-softbox cyclorama. The default, and the character-gallery
  // look. The 16-degree "sun" was the cyclorama's own key softbox — wide enough
  // that it WAS the sky. It is now a 3-degree beauty-dish core sitting inside
  // the same three broad panels, so the panels still wrap and the core still
  // glints.
  studio: {
    sky: 0x9fa6ad, horizon: 0xb9bfc4, ground: 0x6e7378,
    sun: 0xffffff, sunSize: 3.0, sunE: 0.30, sunDir: [0.42, 0.72, 0.55],
    ambient: 0x11141a, clouds: 0, contrast: 1.0, saturation: 0.9, gain: 1.0,
    haze: 0xc3c9cd, hazeStrength: 0.35, hazeFalloff: 5.0, gradPow: 0.8,
    glowStrength: 0.30, glowPower: 90,
    panels: [
      { dir: [-0.75, 0.35, 0.55], size: 34, color: 0xdfe7f2, intensity: 0.55 },
      { dir: [0.15, 0.95, -0.28], size: 46, color: 0xffffff, intensity: 0.4 },
      { dir: [0.2, 0.12, -0.97], size: 30, color: 0xbcd2ee, intensity: 0.3 },
    ],
    seed: 11,
  },

  // Low warm sun raking across a packed stadium bowl.
  // THE "ORANGE MID-TONE SOUP" MOOD. The critic's note was "neither a black
  // anchor nor a highlight". Both halves are addressed here: contrast up (the
  // sky's own S-curve pivots on scene-linear mid grey, so raising it pushes the
  // shaded side of the bowl DOWN toward a real black) and a 1.8-degree, 426-
  // radiance sun that finally gives the frame something at the top end.
  'sunset-stadium': {
    sky: 0x2a4a86, horizon: 0xff9a52, ground: 0x4a3526,
    sun: 0xffb066, sunSize: 1.8, sunE: 0.28, sunDir: [-0.66, 0.14, 0.74],
    ambient: 0x0d0a12, clouds: { coverage: 0.46, sharpness: 0.16, scale: 2.6, band: 0.42, lit: 0xffd0a0, shade: 0x6b4a63, sunGlow: 0.9 },
    contrast: 1.18, saturation: 1.06, gain: 0.94, haze: 0xffb877, hazeStrength: 0.62, hazeFalloff: 6.5, gradPow: 0.62,
    glowStrength: 0.45, glowPower: 150,
    seed: 23,
  },

  // Hard overhead sun, high-key, short shadows.
  'noon-stadium': {
    sky: 0x2f6fd0, horizon: 0xa9cbf0, ground: 0x6b6f63,
    sun: 0xfff4e0, sunSize: 1.3, sunE: 0.34, sunDir: [0.26, 0.92, 0.29],
    ambient: 0x0f141c, clouds: { coverage: 0.3, sharpness: 0.1, scale: 3.2, band: 0.5, lit: 0xffffff, shade: 0x9aa9bd, sunGlow: 0.4 },
    contrast: 1.05, saturation: 1.0, gain: 0.96, haze: 0xcfe0f4, hazeStrength: 0.4, hazeFalloff: 9.0, gradPow: 0.85,
    glowStrength: 0.34, glowPower: 240,
    seed: 5,
  },

  // No sun. Moon + two neon walls doing all the work. The MOON is the small
  // bright source here — 2.2 deg (the real moon is 0.52, but a stylised night
  // wants a readable disc) at 155 radiance, which is what puts a cold glint on
  // a wet jacket while the neon panels stay a broad coloured wash.
  'night-neon': {
    sky: 0x080a1c, horizon: 0x2a1140, ground: 0x0b0d16,
    sun: 0xbcd4ff, sunSize: 2.2, sunE: 0.15, sunDir: [-0.34, 0.66, -0.67],
    ambient: 0x05060d, clouds: { coverage: 0.36, sharpness: 0.2, scale: 2.2, band: 0.4, lit: 0x3a2a52, shade: 0x101024, sunGlow: 0.2 },
    contrast: 1.2, saturation: 1.15, gain: 1.0, haze: 0x3d1a54, hazeStrength: 0.55, hazeFalloff: 7.0, gradPow: 0.5,
    glowStrength: 0.22, glowPower: 120,
    panels: [
      { dir: [0.92, 0.16, 0.36], size: 40, color: 0xff2fa0, intensity: 0.9 },
      { dir: [-0.88, 0.2, -0.43], size: 36, color: 0x1fe8ff, intensity: 0.75 },
    ],
    seed: 71,
  },

  // ROUND 5 — THE ARENA THE CRITIC CALLED BROKEN, NOT AMATEUR.
  // "trees and ground are flat-shaded, one uniform value per polygon, the
  // original complaint verbatim and untouched. I can name zero materials."
  //
  // Round 4 fixed the wrong half. It gave this mood a 7-degree patch at E=0.22,
  // which does put a lobe on a roughness-0.3 wet frog — but NOTHING in a swamp
  // is roughness 0.3. Mud, bark, moss, foliage and wet stone live at 0.5-0.85,
  // and at t = 3.5 deg (t^2 = 3.7e-3) against a = r^2 = 0.0625 at r = 0.5, the
  // lobe reads back 5.6 % of the disc's radiance: P(0.5) = 0.99 against a sky
  // of 0.23. Four times the sky is not a highlight when the surface is also
  // catching a 0.72 hemi. P(0.7) was 0.27 — literally the sky. So there was no
  // specular on any surface in the arena, exactly as measured.
  //
  // The fix is the same physics the round-4 note derives and then did not
  // apply here: P ~= E / (PI * (t^2 + a^2)). At fixed E, SHRINKING t is the
  // only thing that raises the lobe on a ROUGH surface. 7.0 -> 3.4 deg is a
  // 4.2x cut in t^2 and 0.22 -> 0.30 in E; together P(0.5) goes 0.99 -> 1.60
  // (6.9x sky) and P(0.7) 0.27 -> 0.42 (1.8x sky), while P(0.3) goes 5.6 ->
  // 11.3. 3.4 degrees is still SEVEN TIMES the real sun — it stays a soft
  // overcast brightening, not a star.
  //
  // Second half of "flat-shaded": an overcast dome delivers near-isotropic
  // irradiance, so no polygon orientation matters. Three PANELS break that —
  // a bright cloud-break above and forward, a dark tree-line behind, and a
  // green underlight from the bioluminescent pool (arena brief §10's hero
  // moment, as actual light rather than an additive card). Haze comes down
  // 0.70 -> 0.52 because a heavy horizon wash is itself a flattening term.
  'overcast-swamp': {
    sky: 0x8b9a8e, horizon: 0x9aa79a, ground: 0x2b3628,
    sun: 0xeaf0e2, sunSize: 3.4, sunE: 0.30, sunDir: [0.3, 0.8, -0.52],
    ambient: 0x141814, clouds: { coverage: 0.82, sharpness: 0.26, scale: 1.8, band: 0.55, lit: 0xc2ccbb, shade: 0x5c6855, sunGlow: 0.35 },
    contrast: 1.06, saturation: 0.86, gain: 0.98, haze: 0xa8b3a4, hazeStrength: 0.52, hazeFalloff: 4.6, gradPow: 0.86, groundPow: 1.15,
    glowStrength: 0.30, glowPower: 60,
    panels: [
      { dir: [0.26, 0.86, -0.44], size: 26, color: 0xd4dccc, intensity: 0.34 },
      { dir: [-0.62, 0.22, 0.75], size: 44, color: 0x3a4a38, intensity: 0.16 },
      { dir: [0.08, -0.58, 0.81], size: 46, color: 0x2fae86, intensity: 0.20 },
    ],
    seed: 37,
  },

  // Snow is a mirror: the ground half is BRIGHTER than the zenith near the
  // horizon. That upward bounce is the whole reason arctic scenes read cold-clean.
  // Measured at 30 degrees / 0.5-1.5 by the critic — because the BRIGHT SNOW
  // GROUND was outshining the disc. It no longer is: the disc is 1.4 deg at 754.
  'arctic-day': {
    sky: 0x4f8ed6, horizon: 0xd9ecff, ground: 0xcfe4f5,
    sun: 0xffffff, sunSize: 1.4, sunE: 0.34, sunDir: [-0.42, 0.52, 0.74],
    ambient: 0x121c26, clouds: { coverage: 0.5, sharpness: 0.24, scale: 2.8, band: 0.45, lit: 0xffffff, shade: 0xb9cfe4, sunGlow: 0.5 },
    contrast: 1.04, saturation: 0.92, gain: 0.92, haze: 0xe6f3ff, hazeStrength: 0.55, hazeFalloff: 6.0, gradPow: 0.7, groundPow: 1.4,
    glowStrength: 0.40, glowPower: 200,
    seed: 91,
  },

  // Sealed metal room. Warm ceiling strip, cold bounce off the deck. The
  // 26-degree "ceiling" is now the three broad PANELS (which is what a ceiling
  // wash actually is) plus one 3.2-degree hot fixture — the thing a polished
  // vault door and a gold bar can actually reflect.
  'interior-vault': {
    sky: 0x151719, horizon: 0x1d2124, ground: 0x0e1012,
    sun: 0xffd9a0, sunSize: 3.2, sunE: 0.17, sunDir: [0.12, 0.96, 0.25],
    ambient: 0x0a0b0d, clouds: 0, contrast: 1.16, saturation: 0.95, gain: 1.0,
    haze: 0x232830, hazeStrength: 0.4, hazeFalloff: 5.5, gradPow: 0.9,
    glowStrength: 0.20, glowPower: 70,
    panels: [
      { dir: [0.0, 0.99, 0.14], size: 55, color: 0xffe0b0, intensity: 0.55 },
      { dir: [0.86, 0.22, -0.46], size: 28, color: 0x6f8ea8, intensity: 0.28 },
      { dir: [-0.8, 0.18, 0.57], size: 28, color: 0x53616e, intensity: 0.2 },
    ],
    seed: 3,
  },

  // Gallery: skylight wash plus pinpoint spots, marble bouncing back up. The
  // critic measured 26 degrees — the two 12-degree spot panels plus the bright
  // dome were the brightest features and the 3.5-degree disc at 4.5 was lost in
  // them. The disc is now 2.4 deg at 185, i.e. 200x the panels, which is what a
  // gallery spot actually is relative to its own skylight.
  'museum-gallery': {
    sky: 0xdad3c6, horizon: 0xe8e2d6, ground: 0xbdb5a6,
    sun: 0xfff0d8, sunSize: 2.4, sunE: 0.24, sunDir: [0.2, 0.94, -0.28],
    ambient: 0x1a1815, clouds: 0, contrast: 1.06, saturation: 0.88, gain: 0.94,
    haze: 0xe2dbcd, hazeStrength: 0.45, hazeFalloff: 4.5, gradPow: 0.85, groundPow: 1.3,
    glowStrength: 0.24, glowPower: 110,
    panels: [
      { dir: [-0.55, 0.79, 0.28], size: 12, color: 0xfff4e2, intensity: 0.9 },
      { dir: [0.62, 0.74, -0.26], size: 12, color: 0xfff4e2, intensity: 0.7 },
      { dir: [0.0, 0.35, 0.94], size: 42, color: 0xd8d0c0, intensity: 0.22 },
    ],
    seed: 44,
  },

  // Tunnel: near-black with two fluorescent runs and one sodium fixture.
  'subway-tunnel': {
    sky: 0x0e1114, horizon: 0x171b1f, ground: 0x0a0c0e,
    // Tilted slightly off vertical on purpose. A dead-overhead sunDir has no
    // azimuth at all, so the key light derived from it has no defined direction
    // to cast along and the shadow collapses under the fighters' feet. Leaning
    // the ceiling wash a few degrees down the track gives it a real direction
    // that the rig and the reflections can both agree on.
    // 30 deg / 0.5 was the ceiling wash pretending to be a lamp. The wash is
    // the panels below; this is the fixture itself — 2.6 deg at 123, which is
    // what puts a hard line of light along a rail and a wet tunnel floor.
    sun: 0xcfe8ff, sunSize: 2.6, sunE: 0.16, sunDir: [0.22, 0.95, 0.22],
    ambient: 0x070809, clouds: 0, contrast: 1.24, saturation: 1.0, gain: 1.0,
    haze: 0x1b2126, hazeStrength: 0.5, hazeFalloff: 5.0, gradPow: 0.95,
    glowStrength: 0.20, glowPower: 60,
    panels: [
      { dir: [0.0, 0.97, 0.24], size: 18, color: 0xdcefff, intensity: 0.85 },
      { dir: [0.0, 0.97, -0.24], size: 18, color: 0xdcefff, intensity: 0.6 },
      { dir: [0.94, 0.3, 0.16], size: 22, color: 0xffa347, intensity: 0.35 },
    ],
    seed: 17,
  },

  // Floor-to-ceiling glass at dusk: warm city floor, cold sky.
  'tower-dusk': {
    sky: 0x152a5c, horizon: 0xff8f6b, ground: 0x1b2233,
    sun: 0xffb27a, sunSize: 1.6, sunE: 0.24, sunDir: [0.72, 0.11, -0.68],
    ambient: 0x0a0d16, clouds: { coverage: 0.38, sharpness: 0.14, scale: 3.4, band: 0.34, lit: 0xffc4a0, shade: 0x4a3f63, sunGlow: 0.8 },
    contrast: 1.14, saturation: 1.06, gain: 1.0, haze: 0xff9d78, hazeStrength: 0.6, hazeFalloff: 7.5, gradPow: 0.55,
    glowStrength: 0.42, glowPower: 160,
    panels: [
      { dir: [-0.6, -0.32, 0.73], size: 60, color: 0xffb066, intensity: 0.18 },
    ],
    seed: 63,
  },

  // The vault glyph is the dominant source. Everything else is fill.
  'reserve-core': {
    sky: 0x07090c, horizon: 0x0b1016, ground: 0x05070a,
    // The glyph is a 3-degree emitter, not a 16-degree glow: that is the whole
    // difference between "a vault with a hot rune in it" and "a blue room".
    sun: 0x66e0ff, sunSize: 3.0, sunE: 0.17, sunDir: [0.0, 0.28, 0.96],
    ambient: 0x04060a, clouds: 0, contrast: 1.26, saturation: 1.12, gain: 1.0,
    haze: 0x0d1a24, hazeStrength: 0.45, hazeFalloff: 6.0, gradPow: 0.9,
    glowStrength: 0.28, glowPower: 40,
    panels: [
      { dir: [0.0, 0.34, -0.94], size: 30, color: 0xffc24a, intensity: 0.3 },
      { dir: [0.0, 0.99, 0.1], size: 50, color: 0x2a4a66, intensity: 0.18 },
    ],
    seed: 29,
  },

  // Late-afternoon plaza, wet stone underfoot, neon starting to bite.
  'meme-plaza': {
    sky: 0x3f83c8, horizon: 0xffc98a, ground: 0x3a4048,
    // THE CLIPPING MOOD — 9.68 % of frame at pure white, median 203. The env's
    // own contribution comes down (gain 0.80) and the energy moves into a small
    // disc instead of a bright dome, which is what converts "everything is hot"
    // into "one thing is hot". See MOOD_EXPOSURE['meme-plaza'] for the rest.
    sun: 0xffd9a8, sunSize: 1.5, sunE: 0.24, sunDir: [0.58, 0.36, 0.73],
    ambient: 0x101620, clouds: { coverage: 0.32, sharpness: 0.14, scale: 3.0, band: 0.46, lit: 0xffe6c8, shade: 0x7f8fa8, sunGlow: 0.6 },
    contrast: 1.08, saturation: 1.1, gain: 0.80, haze: 0xffd2a0, hazeStrength: 0.5, hazeFalloff: 7.0, gradPow: 0.7,
    glowStrength: 0.36, glowPower: 180,
    panels: [
      { dir: [-0.9, 0.08, 0.43], size: 34, color: 0xff3d9a, intensity: 0.32 },
      { dir: [0.42, 0.06, -0.91], size: 34, color: 0x25dcff, intensity: 0.28 },
    ],
    seed: 55,
  },

  // Dawn: a warm sliver on one side, deep cold shadow everywhere else.
  'mountain-dawn': {
    sky: 0x18407e, horizon: 0xffb27a, ground: 0x2b3a4a,
    sun: 0xffc07a, sunSize: 1.4, sunE: 0.27, sunDir: [0.78, 0.1, -0.62],
    ambient: 0x0b111c, clouds: { coverage: 0.52, sharpness: 0.18, scale: 2.4, band: 0.3, lit: 0xffcfa0, shade: 0x3f4a70, sunGlow: 1.0 },
    contrast: 1.16, saturation: 1.08, gain: 1.0, haze: 0xffa877, hazeStrength: 0.66, hazeFalloff: 5.5, gradPow: 0.5,
    glowStrength: 0.48, glowPower: 130,
    seed: 83,
  },

  // ROUND 5 — "no highlight anywhere in the frame (p99 = 127)".
  //
  // Two independent causes, one in each file. lighting.js owns the first (the
  // lightning key fired for 7 % of wall-clock time and no capture ever landed
  // inside a strike — see MOOD_FLICKER). This is the second: between strikes
  // the environment was the only source, and its 4-degree patch at E = 0.17
  // gave P(0.5) = 1.00 and P(0.7) = 0.27 — a wet asphalt apron and a wet hide
  // both read as their diffuse colour and nothing else. A storm's entire
  // visual signature is that everything is WET, and wet means a tight, hard,
  // silver-blue lobe on surfaces that would otherwise be matte.
  //
  // 4.0 -> 2.2 deg (t^2 down 3.3x) with E 0.17 -> 0.26 takes P(0.3) from 6.9
  // to 11.5, P(0.5) from 1.00 to 1.55 and P(0.7) from 0.27 to 0.41 — against a
  // sky luminance of 0.012, so those are 950x / 128x / 34x ratios. There is now
  // a highlight on every wet surface in the arena on every frame, and the
  // lightning is a 4x kick on top of it rather than the only source of one.
  //
  // The two panels are the cell's own structure: a cold break in the deck where
  // the strikes come from, and a sodium horizon glow off the city the storm is
  // sitting over. Both are directional, which is what stops a 90 %-coverage
  // cloud deck from delivering flat irradiance.
  'liquidation-storm': {
    sky: 0x1a1b2e, horizon: 0x51465c, ground: 0x22242c,
    sun: 0xe2ddff, sunSize: 2.2, sunE: 0.26, sunDir: [-0.5, 0.44, -0.75],
    ambient: 0x0a0b12, clouds: { coverage: 0.9, sharpness: 0.34, scale: 1.6, band: 0.6, lit: 0x7a7090, shade: 0x1e1c2c, sunGlow: 0.5 },
    contrast: 1.18, saturation: 0.9, gain: 1.0, haze: 0x584a63, hazeStrength: 0.72, hazeFalloff: 4.2, gradPow: 0.75,
    glowStrength: 0.28, glowPower: 90,
    panels: [
      { dir: [-0.46, 0.62, -0.64], size: 22, color: 0x9aa4d8, intensity: 0.26 },
      { dir: [0.68, 0.05, 0.73], size: 30, color: 0x5a4436, intensity: 0.14 },
    ],
    seed: 67,
  },
}

export const MOOD_NAMES = Object.keys(MOODS)

// Arena id (src/arenas/index.js) -> mood, per GRAPHICS_CONTRACT §10.
export const ARENA_MOODS = {
  'meme-market': 'meme-plaza',
  'bull-market-colosseum': 'sunset-stadium',
  'liquidity-swamp': 'overcast-swamp',
  'frozen-token-lab': 'arctic-day',
  'mountain-node-village': 'mountain-dawn',
  'lost-block-museum': 'museum-gallery',
  'settlement-express': 'subway-tunnel',
  'institutional-capital-tower': 'tower-dusk',
  'calm-before-liquidation': 'liquidation-storm',
  'permanent-reserve-core': 'reserve-core',
}

// ---------------------------------------------------------------------------
// Mood normalisation. Fills defaults so the shader never sees an undefined and
// so callers can hand us a partial override object.
// ---------------------------------------------------------------------------
const DEFAULT_CLOUDS = { coverage: 0, sharpness: 0.18, scale: 2.6, band: 0.45, lit: 0xffffff, shade: 0x8a94a6, sunGlow: 0.4, drift: [0, 0] }

let warnedMoods = null

export function getMood(name = 'studio', overrides = null) {
  let base = MOODS[name]
  if (!base) {
    if (!warnedMoods) warnedMoods = new Set()
    if (!warnedMoods.has(name)) {
      warnedMoods.add(name)
      console.warn(`[env] unknown mood "${name}" — falling back to "studio"`)
    }
    base = MOODS.studio
  }
  const m = Object.assign({}, base, overrides || {})
  const cl = typeof m.clouds === 'number' ? { coverage: m.clouds } : (m.clouds || {})
  m.clouds = Object.assign({}, DEFAULT_CLOUDS, cl)
  m.sunSize = m.sunSize ?? SUN_ANGULAR_DIAMETER

  // --- THE HOTSPOT SOLVE ---------------------------------------------------
  // `sunE` (irradiance) is canonical; the disc's peak radiance is derived from
  // it and from the disc's own solid angle. See the HOTSPOT REWRITE note.
  //
  // Three cases, in priority order:
  //   1. an explicit radiance ABOVE the legacy ceiling — a caller who has read
  //      this note and means it. Honoured, and sunE is back-solved for report.
  //   2. `sunE` present (every shipped mood, and every partial override, since
  //      Object.assign inherits it from the base mood) — solve the radiance.
  //   3. neither — fall back to the studio energy rather than to a dim disc,
  //      because "no hotspot" is the failure mode this whole file exists to fix.
  m.sunSolidAngle = discSolidAngle(m.sunSize)
  if (m.sunIntensity != null && m.sunIntensity > LEGACY_SUN_RADIANCE_MAX) {
    m.sunE = m.sunIntensity * m.sunSolidAngle
  } else {
    m.sunE = m.sunE ?? 0.24
    m.sunIntensity = m.sunE / m.sunSolidAngle
  }
  m.sunDir = m.sunDir || [0.4, 0.8, 0.45]
  m.ambient = m.ambient ?? 0x000000
  m.contrast = m.contrast ?? 1
  m.saturation = m.saturation ?? 1
  m.gain = m.gain ?? 1
  m.gradPow = m.gradPow ?? 0.75
  m.groundPow = m.groundPow ?? 0.9
  m.haze = m.haze ?? m.horizon
  m.hazeStrength = m.hazeStrength ?? 0.45
  m.hazeFalloff = m.hazeFalloff ?? 6
  // The glow is the atmospheric halo AROUND the disc, so it is sized off the
  // energy, never off the (now four-figure) radiance — the old
  // `min(0.5, sunIntensity * 0.06)` would pin every mood at the 0.5 ceiling.
  m.glowStrength = m.glowStrength ?? THREE.MathUtils.clamp(m.sunE * 1.5, 0.06, 0.5)
  m.glowPower = m.glowPower ?? 220
  m.panels = m.panels || []
  m.seed = m.seed ?? 1
  m.name = name
  return m
}

/** World-space unit vector pointing TO the sun for `mood`. lighting.js uses this. */
export function moodSunDirection(name, target = new THREE.Vector3()) {
  const d = getMood(name).sunDir
  return target.set(d[0], d[1], d[2]).normalize()
}

/** Sun colour for `mood` as a THREE.Color (sRGB-authored hex). */
export function moodSunColor(name, target = new THREE.Color()) {
  return target.setHex(getMood(name).sun)
}

/**
 * Energy-equivalent irradiance of the mood's sun disc: peak radiance times the
 * solid angle it covers. A 16-degree softbox at radiance 2.6 and a 0.53-degree
 * star at radiance 12 can be compared with this. lighting.js derives its default
 * key intensity from it so the analytic key and the env sun stay in agreement.
 */
export function sunIrradiance(name) {
  return getMood(name).sunE
}

// ---------------------------------------------------------------------------
// MEASUREMENT. The critic measured the old table's angular sizes and radiances
// and used them to explain why no fighter could carry a hotspot; these are the
// same measurements, computed rather than eyeballed, so the claim is checkable.
// ---------------------------------------------------------------------------

/**
 * Radiance a GGX lobe of roughness `r` reads back from the mood's brightest
 * feature, after PMREM prefiltering. See the derivation in the HOTSPOT note:
 *   P(r) ~= L * t^2 / (t^2 + a^2),  t = angular radius, a = r^2
 * A value comfortably above the surrounding sky radiance is a visible hotspot;
 * the old table returned ~1.0-1.5 here at every roughness, i.e. the sky itself.
 */
export function specularPeak(name, roughness = 0.3, overrides = null) {
  const m = getMood(name, overrides)
  const t = THREE.MathUtils.degToRad(m.sunSize) * 0.5
  const a = THREE.MathUtils.clamp(roughness, 0.02, 1) ** 2
  // Post-grade radiance: the sky shader applies contrast about linear mid grey
  // and then gain, and the disc goes through both.
  const L = Math.max(0, (m.sunIntensity - 0.18) * m.contrast + 0.18) * m.gain
  return L * (t * t) / (t * t + a * a)
}

/**
 * Full hotspot report for one mood — the table this round is judged on.
 * `skyRadiance` is the graded zenith, i.e. what the hotspot has to beat.
 */
export function moodHotspot(name, overrides = null) {
  const m = getMood(name, overrides)
  const L = Math.max(0, (m.sunIntensity - 0.18) * m.contrast + 0.18) * m.gain
  const zen = new THREE.Color().setHex(m.sky, THREE.SRGBColorSpace)
  const skyL = (0.2126 * zen.r + 0.7152 * zen.g + 0.0722 * zen.b) * m.gain
  return {
    mood: m.name,
    angularDiameterDeg: +m.sunSize.toFixed(2),
    solidAngleSr: m.sunSolidAngle,
    irradiance: +m.sunE.toFixed(4),
    peakRadiance: +L.toFixed(1),
    skyRadiance: +skyL.toFixed(3),
    contrastRatio: +(L / Math.max(1e-4, skyL)).toFixed(0),
    peakAtRough: {
      0.1: +specularPeak(name, 0.1, overrides).toFixed(1),
      0.3: +specularPeak(name, 0.3, overrides).toFixed(2),
      0.5: +specularPeak(name, 0.5, overrides).toFixed(2),
      0.7: +specularPeak(name, 0.7, overrides).toFixed(3),
    },
    // How many 256px cube texels the disc spans. Below ~3 it aliases.
    texelsAt256: +(m.sunSize / (90 / 256)).toFixed(1),
  }
}

/** Every mood's hotspot figures. `console.table(hotspotReport())`. */
export function hotspotReport() {
  return MOOD_NAMES.map((n) => moodHotspot(n))
}

// ---------------------------------------------------------------------------
// PER-MOOD EXPOSURE CALIBRATION.
//
// The critic's measurement: "meme-market clips 9.68 % of the frame to pure
// white with a median of 203. bull-market is an orange mid-tone soup with
// neither a black anchor nor a highlight. One grade cannot be simultaneously
// three stops hot and two stops flat unless nothing is normalising scene
// exposure." Correct — nothing was. Every arena rendered through one global
// `exposure = 1` and one global grade, so the only thing setting a mood's
// value range was the accident of how bright its arena author made its props.
//
// This table is that normalisation. One entry per mood, all of them authored
// against the same intent:
//
//   * MEDIAN in the 120-155 band (sRGB). Not a rule of taste — it is where a
//     shipped fighting-game frame's histogram centre actually sits, and it is
//     what leaves room for both a black anchor and a highlight.
//   * CLIPPED PIXELS under ~0.6 % of frame, and every one of them an emitter
//     or a specular core, never a wall.
//   * A REAL BLACK. `black` is the grade's normalised toe; every mood gets a
//     non-zero one, and the dark/foggy moods get more, because haze is what
//     lifts a black off zero and haze is exactly what those moods have.
//   * A ROLL-OFF, not a clip. `contrast` is the S-curve amount; raising it on
//     the flat moods (sunset-stadium, liquidation-storm, overcast-swamp) is
//     what separates their midtones instead of letting them pool.
//
// Fields map 1:1 onto RenderPipeline's own API, so there is no translation
// layer. THE WIRING IS `RenderPipeline.setMood()`, which is reached
// automatically: the pipeline reads the mood off `scene.environment.name`
// (buildEnvironment tags every PMREM `env:<mood>`) once per frame and applies
// exposure, grade, bloom, tone and the AO kernel. An arena that calls
// `applyEnvironment()` is calibrated with no integration work at all.
// A caller that wants to push a mood by hand calls `pipeline.setMood()`
// directly — see the note where `applyMoodGrade()` used to live, further down.
// `ao` is a multiplier on the tier's GTAO strength: the moods whose crevices
// were washed out (the bright, high-ambient ones) ask for more.
//
// THE TWO NAMED FAILURES AND WHAT WAS DONE TO THEM:
//   meme-plaza     -1.0 stop of pipeline exposure (0.70) on top of -0.32 stop
//                  of env gain (0.80) and a ~0.5-stop cut across the rig's
//                  key/hemi/fill/ambient in lighting.js. Bloom threshold moves
//                  1.10 -> 1.38 so the plaza's cream stone stops blooming and
//                  only the neon does.
//   sunset-stadium exposure held near 1.0 but contrast 0.09 -> 0.22 and black
//                  0.015 -> 0.040, which is the black anchor; the highlight is
//                  the new 1.8-degree sun. Temperature is pulled 0.08 cool and
//                  the split-tone shadows pushed further blue, because "orange
//                  soup" is as much a hue-collapse problem as a value one.
// ---------------------------------------------------------------------------
//
// ROUND 8 — THREE FIELDS ADDED, AND WHY EACH IS A PER-MOOD DECISION.
//
//   shadowTint / highTint   Only sunset-stadium ever carried these, so nine
//     moods out of ten were split-toning with ONE pair of hues: cool shadows,
//     warm highlights, everywhere, forever. That is a house look applied as if
//     it were a design — an arctic lab and a subway tunnel are not the same
//     colour problem. The pairs below are deliberately restrained (every
//     channel inside 0.87-1.15, i.e. under a sixth of a stop of hue push) and
//     every one of them is the mood's OWN complementary axis: the shadow tint
//     leans toward the mood's fill/bounce colour and the highlight tint toward
//     its key. Readability first — the midtones, where the fighters live, are
//     untouched by construction (see the split-tone window in GradeShader).
//
//   tone: { hiKnee, hiPivot, hiBoost }   Where the highlight restore starts.
//     This is not curve shape (that stays global — Pipeline.setFinish), it is a
//     statement about how high a mood's LIT WALLS sit. A vault whose rig runs
//     the table's highest ambient floor puts a lot of wall in the 0.6-0.8
//     display band, and the restore has no business touching a wall. Moods
//     that do not name a tone inherit the house one and are bit-identical.
//     ROUND 9: the house knee moved 0.56 -> 0.84 to sit above the new
//     compressive shoulder, so a mood that wants the restore off its walls now
//     names a knee ABOVE 0.84, not below it. The three moods that carry one
//     (interior-vault, subway-tunnel, reserve-core) were re-derived; anything
//     that still reads 0.60-0.74 in a future edit is a stale number.
//
// THE 13.02 % CLIP, and what actually caused it. reserve-core was measured
// putting 13.02 % of frame at pure white — the worst frame in the game. Two
// causes, in this order of magnitude:
//   1. THE HIGHLIGHT RESTORE HAD NO CEILING (Pipeline's GradeShader, fixed
//      there). Solved through the whole chain, the smallest scene-linear
//      radiance that reached 255 counts in this mood was 0.513 — a mid-grey
//      wall. It is 6.55 after the fix. That is 12.8x more headroom and it is
//      most of the 13.02 %.
//   2. THIS TABLE WAS ALSO HOT. reserve-core ran the highest exposure of the
//      fourteen (1.18) AND the lowest bloom threshold (1.04). 1.04 is BELOW
//      the emissive convention's "lit surfaces <= 1.2 linear" ceiling, so the
//      vault's own lit walls were feeding the bloom pyramid and the pyramid
//      was adding the radiance back on top of an already-clipping restore.
//      Exposure 1.10, threshold 1.34, strength 0.46: the glyph still blooms
//      (an emitter is >= 1.6 by convention and the glyph is far above it) and
//      nothing that is merely LIT does. interior-vault — the menu backdrop,
//      measured at 1.06-1.48 % against the same 0.8 % limit — gets the same
//      treatment for the same reason.
// Measured through the CPU mirror of the grade, reserve-core now separates the
// top of its range instead of plateauing:
//      scene-linear   0.50   0.80   1.20   2.00   4.00
//      before          252    255    255    255    255
//      after           226    242    247    251    254
export const MOOD_EXPOSURE = {
  studio: { exposure: 1.00, contrast: 0.10, black: 0.018, saturation: 1.02, temperature: 0.00, split: 0.30, bloomThreshold: 1.12, ao: 1.00 },

  'sunset-stadium': {
    exposure: 0.96, contrast: 0.22, black: 0.040, saturation: 0.99, temperature: -0.08, split: 0.48,
    shadowTint: [0.89, 0.965, 1.14], highTint: [1.05, 1.00, 0.92],
    bloomThreshold: 1.18, bloomStrength: 0.42, ao: 1.15,
  },

  // Hard overhead sun: the shadow side is sky-blue bounce, the lit side is a
  // hair of warmth. The classic daylight pair, kept small.
  'noon-stadium': {
    exposure: 0.90, contrast: 0.13, black: 0.024, saturation: 1.02, temperature: -0.02, split: 0.32,
    shadowTint: [0.93, 0.975, 1.10], highTint: [1.04, 1.005, 0.955],
    bloomThreshold: 1.20, ao: 1.20,
  },

  // Neon: the two wall panels are magenta and cyan, so the shadows take the
  // cyan and the highlights the magenta. This is the one mood where the split
  // is doing scene colour rather than photographic convention.
  'night-neon': {
    exposure: 1.14, contrast: 0.15, black: 0.032, saturation: 1.10, temperature: 0.00, split: 0.40,
    shadowTint: [0.90, 1.00, 1.09], highTint: [1.07, 0.985, 1.03],
    bloomThreshold: 1.22, bloomStrength: 0.56, ao: 0.90,
  },

  // Overcast is low-contrast BY NATURE, which is not the same as having no
  // black. The S-curve does the separating; the toe does the anchoring.
  // Shadows go green-grey (the tree line and the moss are the bounce), the
  // cloud break stays neutral-cool — an overcast highlight is not warm.
  'overcast-swamp': {
    exposure: 1.04, contrast: 0.19, black: 0.030, saturation: 0.94, temperature: -0.03, split: 0.42,
    shadowTint: [0.94, 1.02, 0.96], highTint: [1.00, 1.01, 1.02],
    bloomThreshold: 1.16, ao: 1.20,
  },

  // Snow: shadow is the sky (deep blue), highlight is the sun off ice — the
  // one mood whose highlight should read COLDER than neutral, not warmer.
  'arctic-day': {
    exposure: 0.86, contrast: 0.11, black: 0.022, saturation: 0.98, temperature: -0.06, split: 0.34,
    shadowTint: [0.90, 0.97, 1.13], highTint: [0.99, 1.005, 1.03],
    bloomThreshold: 1.22, ao: 1.30,
  },

  // THE MENU BACKDROP. Measured at 1.06-1.48 % clipped white against the
  // pipeline's own 0.8 % limit. Same two causes as reserve-core below and the
  // same two fixes: the restore's ceiling (fixed in Pipeline) plus a threshold
  // that was under the lit-surface ceiling. hiKnee 0.86 — above the round-9
  // house knee — keeps the restore off the vault's own lit walls so it only
  // ever touches the door seam.
  // ROUND 9: same third cause as reserve-core, one third the magnitude, because
  // the menu measured 1.06-1.48 % rather than 10.80 %. exposure 1.06 -> 0.92
  // (a 0.20-stop cut) takes a 1.2-linear lit wall from display 0.911 to 0.879,
  // which is 8 counts, and the new compressive shoulder takes another 15. The
  // knee comes up with reserve-core's for the same reason — the vault seam is
  // the only emitter in the shot and the restore should be spent on it.
  // ROUND 10 (verifier, MEASURED IN THE BROWSER) — THIS MOOD WAS DOUBLE-DEBITED.
  // The 0.20-stop cut above and MenuBackdrop's round-3 pass (vault door moved
  // off `metal` to `metal-rough`, practicals 14 W -> 8 W, wash 28 -> 21 W,
  // candles 16 -> 11) were BOTH written to pay the same 1.06-1.48 % clipped-white
  // bill, and neither author could see the other's change. Measured at 1600x900
  // on the title and menu screens after both landed:
  //     exposure 0.92 -> median 18-25, pctBelow8 17.3-24.8 %, clippedWhite 0.000 %
  // against this mood's own v3.2 baseline of median 76-90 / below8 0.17-1.63 %.
  // The vault walls were rendering at luma 4-15. Swept exposureScale live on the
  // real menu scene (Pipeline clamps exposure at 1.60):
  //     0.92 -> med 20 / below8 19.6 %      1.20 -> med 27 / below8 13.4 %
  //     1.38 -> med 33 / below8 10.8 %      1.47 -> med 33 / below8 11.3 %
  //     1.60 -> med 38 / below8  7.5 %
  // pctClippedWhite stayed 0.000 at EVERY step, and frame max never reached 254 —
  // i.e. the clipping headroom this mood gained is real and nothing above uses it.
  // 1.38 is the value taken: it is ~half the recovered range, it leaves the
  // highlight-restore knee (0.87) and bloom gate (1.44) valid without re-derivation,
  // and it keeps a full stop of margin under the clamp for a future emitter pass.
  // The remaining gap to median 76-90 is RADIANCE, not grade — see the note in the
  // verifier's round-10 report for MenuBackdrop.js.
  'interior-vault': {
    exposure: 1.38, contrast: 0.15, black: 0.028, saturation: 1.02, temperature: 0.04, split: 0.38,
    shadowTint: [0.92, 0.98, 1.11], highTint: [1.06, 1.005, 0.94],
    tone: { hiKnee: 0.87, hiPivot: 0.925, hiBoost: 0.92 },
    bloomThreshold: 1.44, bloomStrength: 0.44, ao: 1.05,
  },

  // Gallery: marble bounce is faintly warm-grey, the spots are daylight-white.
  // Barely any split at all — a gallery IS neutral, and pretending otherwise
  // is the "everything is one amber wash" failure in miniature.
  'museum-gallery': {
    exposure: 0.88, contrast: 0.12, black: 0.026, saturation: 0.96, temperature: 0.01, split: 0.34,
    shadowTint: [0.97, 0.985, 1.05], highTint: [1.02, 1.005, 0.985],
    bloomThreshold: 1.20, ao: 1.35,
  },

  // Tunnel: fluorescent runs (cold) against one sodium fixture (amber). The
  // widest hue split in the table, because that contrast IS the arena.
  'subway-tunnel': {
    exposure: 1.10, contrast: 0.16, black: 0.034, saturation: 1.02, temperature: 0.02, split: 0.40,
    shadowTint: [0.90, 0.975, 1.12], highTint: [1.09, 1.01, 0.90],
    tone: { hiKnee: 0.86, hiPivot: 0.922, hiBoost: 0.92 },
    bloomThreshold: 1.24, bloomStrength: 0.50, ao: 0.95,
  },

  // Dusk through glass: cold interior shadow, warm city highlight.
  'tower-dusk': {
    exposure: 1.02, contrast: 0.14, black: 0.030, saturation: 1.05, temperature: 0.02, split: 0.42,
    shadowTint: [0.90, 0.965, 1.13], highTint: [1.08, 1.00, 0.92],
    bloomThreshold: 1.16, ao: 1.00,
  },

  // THE WORST FRAME IN THE GAME: 13.02 % pure white in round 7, 10.80 %
  // any-channel after round 8's headroom-form restore. See the block above this
  // table for the derivation of the first two fixes.
  //
  // ROUND 9 — THE THIRD AND LAST CAUSE: THE EXPOSURE ITSELF.
  // Solve the chain forward for this mood instead of backward from the clip.
  // A LIT WALL is <= 1.2 linear by the emissive convention (§ the note above
  // setBloom). At exposure 1.10 that wall enters ACES at 1.32, which the fit
  // maps to 0.826, and 0.826^(1/2.2) is display 0.917 = 234 counts BEFORE the
  // contrast curve and BEFORE the highlight restore adds another ~12. So in
  // this mood every merely-lit surface was rendering at 240-250 and the whole
  // vault interior — not just the glyph — was the clipped region. No bloom
  // threshold can fix that, because the wall was never blooming; it was simply
  // exposed two stops hot for a room whose own design is "one emitter in the
  // dark".
  //   exposure 1.10 -> 0.84 puts that same wall at 1.01 linear -> ACES 0.767
  //   -> display 0.890 -> 227 counts, and the round-9 filmic shoulder in
  //   GradeShader (knee 0.72, compressive) then rolls it to ~0.845 = 215.
  // The glyph is 8-40 linear and lands at 253-255 either way, so the hero
  // moment is intact and now has 40 counts of separation from its own wall.
  //
  // The remaining band is bought per-mood rather than globally:
  //   tone.hiKnee 0.62 -> 0.88, above the round-9 house knee of 0.84. The
  //     restore's job is "use the top of the range"; in a room with ONE emitter
  //     that top belongs to the emitter alone, and at knee 0.62 it was being
  //     spent on the walls. hiBoost stays near the house 0.95 (0.90) because
  //     the emitter still has to reach white — the knee is what excludes the
  //     walls, not the boost.
  //   bloomThreshold 1.34 -> 1.52. Emitters are >= 1.6 linear by convention;
  //     1.52 is the first threshold that is unambiguously above every lit
  //     surface in the arena AND below every emitter in it.
  // Shadow cyan / highlight gold: the glyph is 0x66e0ff and the arena's second
  // panel is 0xffc24a, so the split is literally the two light sources.
  //
  // Readability, not mood, is the acceptance test: a fighter's mid-tone hide
  // sits at ~219 and the glyph disc must sit BELOW that. Exposure is half of
  // that fix; the other half is the glyph's own emissiveIntensity, which lives
  // in src/arenas/permanentReserveCore.js.
  'reserve-core': {
    exposure: 0.84, contrast: 0.19, black: 0.034, saturation: 1.10, temperature: 0.00, split: 0.38,
    shadowTint: [0.88, 0.98, 1.14], highTint: [1.09, 1.015, 0.90],
    tone: { hiKnee: 0.88, hiPivot: 0.928, hiBoost: 0.90 },
    bloomThreshold: 1.52, bloomStrength: 0.42, ao: 0.95,
  },

  'meme-plaza': {
    exposure: 0.70, contrast: 0.13, black: 0.022, saturation: 1.04, temperature: -0.02, split: 0.32,
    shadowTint: [0.93, 0.99, 1.08], highTint: [1.05, 1.00, 0.96],
    bloomThreshold: 1.38, bloomStrength: 0.40, ao: 1.25,
  },

  // §10's brief for this arena is literally "warm dawn rim over cold blue
  // shadow", so the split tone is the brief, restated as a grade.
  'mountain-dawn': {
    exposure: 0.98, contrast: 0.17, black: 0.032, saturation: 1.05, temperature: 0.03, split: 0.46,
    shadowTint: [0.89, 0.96, 1.15], highTint: [1.10, 1.01, 0.89],
    bloomThreshold: 1.14, ao: 1.10,
  },

  // Storm: everything is wet, so the shadows are the deck's blue-violet and
  // the highlights are the lightning's silver — desaturated, not warm.
  'liquidation-storm': {
    exposure: 1.06, contrast: 0.19, black: 0.036, saturation: 0.92, temperature: -0.04, split: 0.44,
    shadowTint: [0.94, 0.965, 1.10], highTint: [1.01, 1.015, 1.02],
    bloomThreshold: 1.18, ao: 1.05,
  },
}

const EXPOSURE_DEFAULT = {
  exposure: 1.0, contrast: 0.09, black: 0.015, saturation: 1.04, temperature: 0,
  split: 0.35, shadowTint: [0.94, 0.985, 1.07], highTint: [1.035, 1.005, 0.955],
  bloomThreshold: 1.10, bloomStrength: 0.5, ao: 1.0,
  // `null` means "inherit the pipeline's house tone" — NOT "use these numbers".
  // Pipeline.setMood() restores its own `_toneBase` when a mood does not name
  // one, so a mood is opt-in and the character gallery never inherits a vault's
  // highlight knee. See the ROUND 8 note above MOOD_EXPOSURE.
  tone: null,
}

// ---------------------------------------------------------------------------
// ROUND 5 — MAKING GTAO BITE AT ARCHITECTURAL SCALE.
//
// The standing verdict: "wall-to-floor in the museum, pedestal-to-floor and
// statue-legs-to-plinth in bull-market, riser-to-ground under every crowd stand
// — zero occlusion gradient at any of them."
//
// TWO SEPARATE BUGS, both found here rather than in Pipeline.js.
//
// 1. THE PER-MOOD `ao` MULTIPLIER WAS NEVER APPLIED. It had been in this table
//    since round 4 and `moodGrade()` had been returning it, but nothing
//    consumed it: every arena ran the tier default (intensity 1.0) regardless
//    of what its mood asked for. `RenderPipeline.setMood()` consumes the whole
//    request now — intensity AND the kernel below — and asserts it in
//    `stats().mood.aoProfileApplied`.
//
// 2. THE KERNEL WAS TUNED FOR CREVICES AND ONLY FOR CREVICES. Pipeline's
//    defaults are screenScale 55 px @ 1920 with distanceExponent 2.0. The
//    world radius that produces is
//        R(d) = (screenScale / 960) * tan(fov/2) * aspect * d
//    which at fov 50 / 16:9 is 0.0475 * d, i.e.
//        3 m -> 0.14 m      8 m -> 0.38 m
//    and distanceExponent 2.0 puts the five sample rings at 4/16/36/64/100 %
//    of that, so at 8 m the rings land at 1.5/6.1/13.7/24.3/38.0 cm. A
//    wall/floor corner needs occluders sampled out to half a metre or more at
//    that distance before any gradient appears; four of the five taps were
//    inside the first 25 cm, and the outermost one alone cannot build a ramp.
//    THAT is why the junctions measure flat while a trunk ring darkens fine.
//
//    The arena profile below is 84 px @ 1920 with distanceExponent 1.6:
//        R(d) = 0.0725 * d   ->   3 m: 0.22 m,  5 m: 0.36 m,  8 m: 0.58 m
//        rings at 7.6 / 23.1 / 43.6 / 69.0 / 100 % of R
//        at 8 m ->  4.4 / 13.4 / 25.3 / 40.0 / 58.0 cm   (a corner gradient)
//        at 3.6 m -> 2.0 /  6.0 / 11.4 / 18.0 / 26.1 cm  (a trunk ring, a
//                                                         lapel, an armpit)
//    So one kernel still serves both, and the character crevices the round-4
//    tuning bought are NOT given back: 2.0 cm at portrait distance is finer
//    than the 55/2.0 profile's second ring.
//
//    `thickness` is a multiple of the radius post-patch, so 1.30 accepts an
//    occluder up to 0.75 m behind the surface at 8 m — a wall qualifies, a
//    background building 30 m away still does not, so the silhouette halo the
//    round-4 note was guarding against stays dead. `scale` (the pow on the AO
//    term) 1.4 -> 1.75 deepens the resulting gradient without touching its
//    extent.
//
// `studio` is deliberately left on Pipeline's defaults: it is the character
// gallery, it has no architecture, and its job is the tightest possible
// crevice kernel.
//
// Pipeline.js owns setAO() and its defaults; this is a per-mood REQUEST, and
// any field a mood does not name is left exactly as the tier set it.
// ---------------------------------------------------------------------------
//
// ROUND 8 — THE FOURTH FIELD, AND WHY IT BELONGS IN THE ARCHITECTURAL PROFILE.
//
// `distanceFallOff` is the one AO number that is counter-named. GTAOShader
// weights each step's horizon update by
//     mix( 1.0, 2.0 / ( j + 2 ), distanceFallOff )
// so a HIGHER value DISCARDS more of the far samples. Pipeline's tier default
// is 0.5, which is right for the character kernel: there the far rings are
// where a low-frequency wash comes from, and a wash is what round 3 rejected.
//
// It is exactly wrong for architecture. At 84 px / exponent 1.6 the outermost
// two rings sit at 40.6 cm and 58.0 cm at 8 m — those two rings ARE the
// wall/floor corner, and at 0.5 the fifth one was contributing 70 % of its
// horizon delta and the fourth 75 %. At 0.30 they contribute 82 % and 85 %.
// That is a ~17 % deeper corner gradient for zero cost and zero change to the
// crevice end (the first ring's weight is 1.0 at any falloff, because
// 2/(j+2) = 1 at j = 0).
//
// ---------------------------------------------------------------------------
// ROUND 9 — THE KERNEL WAS RIGHT AND STILL DID NOT REGISTER. WHY, AND WHAT
// MOVED.
//
// Round 8 landed the wiring (Pipeline.setMood consumes this profile and asserts
// it in `stats().mood.aoProfileApplied`) and the junctions STILL measured flat:
// plinth base to open floor, delta zero at contact; the stanchion post at
// luma 9 with the adjacent floor pixel at 175 and no band at all. So the
// remaining failure is not "the profile is not applied", it is "the applied
// profile is too weak to survive a half-resolution buffer, a Poisson denoise
// and a multiply into an already-bright floor".
//
// THE GEOMETRY OF THE FAILURE. GTAOShader offsets its samples in the VIEW-SPACE
// XY PLANE at constant view Z and then rejects any sample whose depth differs
// by more than `thickness * radiusScale`. A fighting-game camera looks along
// the floor at roughly 12-16 degrees, so for a FLOOR pixel a sample offset
// toward the horizon lands metres away in Z and is rejected — correctly, that
// is the anti-halo test — but at thickness 1.30 the tolerance at 8 m was only
// 0.75 m, which also rejected the near-horizontal half of a genuine
// floor-meets-plinth corner. Grazing angles need a LOOSER depth tolerance than
// a portrait crevice does, and thickness is a multiple of the radius, so
// raising it does not widen the kernel — it only stops discarding the corner.
//
// FOUR NUMBERS MOVED, each for its own reason:
//   aoScreenScale     84 -> 96    R(8 m) 0.580 -> 0.663 m. The outermost ring
//                                 now reaches 66 cm, which is a room corner
//                                 rather than a plinth edge.
//   aoThickness       1.30 -> 1.90  Depth tolerance at 8 m 0.75 -> 1.26 m. A
//                                 wall or plinth at the same station qualifies;
//                                 a background building 30 m back still does
//                                 not, so the round-4 silhouette halo stays
//                                 dead. This is the grazing-angle fix.
//   aoDistanceExponent 1.6 -> 1.45  Rings move to 9.4/25.3/45.5/70.6/100 % of
//                                 R: at 8 m that is 6.2/16.8/30.2/46.8/66.3 cm,
//                                 three rings inside the half-metre band where
//                                 a corner gradient actually lives instead of
//                                 two.
//   aoDistanceFallOff 0.30 -> 0.15  The far rings now contribute 91 % and 92 %
//                                 of their horizon delta instead of 82/85 %.
//   aoScale           1.75 -> 2.45  pow() on the AO term. This is the amplifier
//                                 of last resort and it is the honest one: it
//                                 deepens what the kernel found without
//                                 widening it or inventing occlusion where
//                                 there is none. 0.90 -> 0.77, 0.80 -> 0.60.
// Blend ceiling is unchanged: Pipeline clamps intensity at 1.3 because
// GTAOPass's blend is `mix(1, ao, i)` and above 1.3 a dark texel goes negative.
// ---------------------------------------------------------------------------
const AO_ARCH = { aoScreenScale: 96, aoThickness: 1.90, aoDistanceExponent: 1.45, aoDistanceFallOff: 0.15, aoScale: 2.45 }

// Per-mood departures from AO_ARCH. Only two moods need one.
const MOOD_AO = {
  // The vault is one emissive glyph in a near-black room; the full 2.45 pow on
  // top of an already crushed shadow end turns corners into the pure-zero holes
  // the round-5 P0 is about. Keep the wider kernel, keep the shallower pow.
  'reserve-core': { aoScreenScale: 96, aoThickness: 1.90, aoDistanceExponent: 1.45, aoDistanceFallOff: 0.15, aoScale: 1.75 },
  // meme-plaza is the P0 black-hole arena. Same reasoning, harder.
  'meme-plaza': { aoScreenScale: 96, aoThickness: 1.80, aoDistanceExponent: 1.45, aoDistanceFallOff: 0.15, aoScale: 1.80 },
}

/** Per-mood GTAO request. Shaped for `RenderPipeline.setAO()`. */
export function moodAO(name = 'studio') {
  const t = Object.assign({}, EXPOSURE_DEFAULT, MOOD_EXPOSURE[name] || {})
  const arch = name === 'studio' ? null : (MOOD_AO[name] || AO_ARCH)
  const out = { intensity: Math.min(1.3, t.ao ?? 1) }
  if (!arch) return out
  if (arch.aoScreenScale != null) out.screenScale = arch.aoScreenScale
  if (arch.aoThickness != null) out.thickness = arch.aoThickness
  if (arch.aoDistanceExponent != null) out.distanceExponent = arch.aoDistanceExponent
  if (arch.aoDistanceFallOff != null) out.distanceFallOff = arch.aoDistanceFallOff
  if (arch.aoScale != null) out.scale = arch.aoScale
  if (arch.aoRadius != null) out.radius = arch.aoRadius
  return out
}

/**
 * moodGrade(mood) -> { exposure, grade, bloom, ao }
 *
 * `grade` and `bloom` are shaped exactly for `RenderPipeline.setGrade()` /
 * `.setBloom()`. Unknown moods fall back to the pipeline's own defaults, so a
 * new arena mood is a no-op rather than a regression.
 */
export function moodGrade(name = 'studio') {
  const t = Object.assign({}, EXPOSURE_DEFAULT, MOOD_EXPOSURE[name] || {})
  return {
    mood: name,
    exposure: t.exposure,
    ao: t.ao,
    grade: {
      contrast: t.contrast,
      black: t.black,
      saturation: t.saturation,
      temperature: t.temperature,
      split: t.split,
      shadowTint: t.shadowTint,
      highTint: t.highTint,
    },
    bloom: { threshold: t.bloomThreshold, strength: t.bloomStrength },
    // Shaped for `RenderPipeline.setTone()`. null = inherit the house tone.
    tone: t.tone || null,
    // Shaped for `RenderPipeline.setAO()`. See the GTAO note above `moodAO`.
    aoParams: moodAO(name),
  }
}

// ---------------------------------------------------------------------------
// THERE IS NO applyMoodGrade(). DELETED IN ROUND 9, AND THE DELETION IS THE
// DOCUMENTATION.
//
// It existed from round 5 to round 8 with a comment claiming it was "the
// wiring" for the per-mood AO kernel. It never was — nothing in the tree ever
// called it — and a function that LOOKED like the fix sitting next to the
// thing that actually needed fixing is exactly how the architectural AO profile
// came to be published, returned by moodGrade(), and dropped on the floor for
// two whole critic rounds. Round 8 demoted it to a thin delegator and left it
// exported, which kept the trap: a second door into the same room, reachable
// by name, that nobody walks through.
//
// THE WIRING IS `RenderPipeline.setMood()`, and it is automatic. The pipeline
// reads the mood off `scene.environment.name` once per frame — buildEnvironment
// tags every PMREM `env:<mood>` — so an arena that calls `applyEnvironment()`
// is calibrated with no integration work at all. To take manual ownership of a
// mood (photo mode, a KO cinematic), call it directly:
//
//     game.pipeline.setMood('reserve-core', { exposureScale: 0.9 })
//
// and to read what a mood asks for without applying it, call `moodGrade(name)`
// above. Both are exported; there is nothing else to import.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The sky shader. Runs six times per environment, then never again.
// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  // The box is a unit cube at the origin and the cube camera sits inside it, so
  // object-space position IS the sampling direction. No matrices needed.
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;

uniform vec3 uZenith, uHorizon, uGround, uHaze, uAmbient;
uniform float uGradPow, uGroundPow, uHazeStrength, uHazeFalloff;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunCos, uSunEdge, uSunRadiance, uGlowStrength, uGlowPower;
uniform vec3 uCloudLit, uCloudShade;
uniform float uCloudCoverage, uCloudSharp, uCloudScale, uCloudBand, uCloudSun;
uniform vec2 uCloudDrift;
uniform float uSeed, uContrast, uSaturation, uGain;
uniform int uPanelCount;
uniform vec3 uPanelDir[${MAX_PANELS}];
uniform vec3 uPanelColor[${MAX_PANELS}];
uniform vec2 uPanelCos[${MAX_PANELS}];   // x = cos(half angle), y = cos(soft edge)

float hash21( vec2 p ) {
  p = fract( p * vec2( 127.1, 311.7 ) + uSeed * 0.017 );
  p += dot( p, p + 34.23 );
  return fract( p.x * p.y * 43.7585 );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float fbm( vec2 p ) {
  float s = 0.0;
  float a = 0.5;
  float norm = 0.0;
  for ( int i = 0; i < 5; i ++ ) {
    s += a * vnoise( p );
    norm += a;
    p = p * 2.07 + 19.31;
    a *= 0.5;
  }
  return s / norm;
}

void main() {
  vec3 d = normalize( vDir );
  float h = d.y;

  // --- base gradient: zenith -> horizon above, horizon -> ground below.
  // Both halves meet at exactly uHorizon so there is no seam to band on.
  vec3 above = mix( uHorizon, uZenith, pow( clamp( h, 0.0, 1.0 ), uGradPow ) );
  vec3 below = mix( uHorizon, uGround, pow( clamp( -h, 0.0, 1.0 ), uGroundPow ) );
  vec3 col = mix( above, below, step( h, 0.0 ) );

  // --- cloud bands. Projecting d.xz / d.y puts the noise on a flat deck, which
  // is what makes the bands converge at the horizon instead of ringing the sky.
  if ( uCloudCoverage > 0.001 ) {
    float hh = max( h, 0.045 );
    vec2 cp = ( d.xz / hh ) * uCloudScale + uCloudDrift;
    cp.y *= uCloudBand;
    float n = fbm( cp );
    float lo = 1.0 - uCloudCoverage - uCloudSharp;
    float hi = 1.0 - uCloudCoverage + uCloudSharp;
    float shape = smoothstep( lo, hi, n );
    float a = shape * smoothstep( 0.0, 0.3, h ) * step( 0.0, h );
    vec3 cc = mix( uCloudShade, uCloudLit, smoothstep( 0.32, 0.95, n ) );
    cc += uSunColor * ( uCloudSun * pow( max( dot( d, uSunDir ), 0.0 ), 6.0 ) );
    col = mix( col, cc, a );
  }

  // --- horizon haze. Applied before the emitters so it never eats the sun.
  col = mix( col, uHaze, exp( -abs( h ) * uHazeFalloff ) * uHazeStrength );

  // --- sun disc at its real angular size, with limb darkening.
  float mu = dot( d, uSunDir );
  float disc = smoothstep( uSunEdge, uSunCos, mu );
  float r = clamp( ( 1.0 - mu ) / max( 1.0 - uSunCos, 1e-6 ), 0.0, 1.0 );
  disc *= mix( 1.0, 0.7, r * r );
  col += uSunColor * ( uSunRadiance * disc );
  col += uSunColor * ( uGlowStrength * pow( max( mu, 0.0 ), uGlowPower ) );

  // --- interior softboxes / neon walls / strip lights.
  for ( int i = 0; i < ${MAX_PANELS}; i ++ ) {
    float on = step( float( i ) + 0.5, float( uPanelCount ) );
    float pm = dot( d, uPanelDir[ i ] );
    col += uPanelColor[ i ] * ( smoothstep( uPanelCos[ i ].y, uPanelCos[ i ].x, pm ) * on );
  }

  col += uAmbient;

  // --- grade. Contrast pivots on scene-linear mid grey, not on 0.5.
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, uSaturation );
  col = max( ( col - 0.18 ) * uContrast + 0.18, vec3( 0.0 ) );
  col *= uGain;

  gl_FragColor = vec4( col, 1.0 );
}
`

// ---------------------------------------------------------------------------
// Build / cache.
// ---------------------------------------------------------------------------

// One PMREMGenerator per renderer. It owns a ping-pong target and LOD planes,
// so making a second one and disposing it would break the first.
const pmremByRenderer = new WeakMap()
// key -> { texture, target, mood, key, refs }
const envCache = new Map()

// A GPU texture belongs to the GL context that created it. ReplayUI runs a
// SECOND WebGLRenderer on its own canvas, so a cache keyed on mood alone would
// hand that renderer a texture from the main context — which reads as a black
// or missing environment rather than as an error. Tagging each renderer and
// folding the tag into the cache key keeps the two contexts' caches disjoint.
let rendererSeq = 0
const rendererIds = new WeakMap()

function rendererId(renderer) {
  let id = rendererIds.get(renderer)
  if (id === undefined) { id = ++rendererSeq; rendererIds.set(renderer, id) }
  return id
}

function getPMREM(renderer) {
  let g = pmremByRenderer.get(renderer)
  if (!g) {
    g = new THREE.PMREMGenerator(renderer)
    g.compileCubemapShader()
    pmremByRenderer.set(renderer, g)
  }
  return g
}

function setColorUniform(u, hex) {
  u.value.setHex(hex, THREE.SRGBColorSpace)
}

function makeSkyMaterial(mood) {
  const half = THREE.MathUtils.degToRad(mood.sunSize) * 0.5
  const sunCos = Math.cos(half)
  // Feather the disc over ~35% of its own radius so a 0.53-degree sun still
  // antialiases at 256px/face instead of stair-stepping.
  const sunEdge = Math.cos(Math.min(Math.PI * 0.5, half * 1.35))

  const panelDir = []
  const panelColor = []
  const panelCos = []
  for (let i = 0; i < MAX_PANELS; i++) {
    const p = mood.panels[i]
    if (p) {
      const v = new THREE.Vector3(p.dir[0], p.dir[1], p.dir[2]).normalize()
      const ph = THREE.MathUtils.degToRad(p.size ?? 30) * 0.5
      panelDir.push(v)
      panelColor.push(new THREE.Color().setHex(p.color ?? 0xffffff, THREE.SRGBColorSpace).multiplyScalar(p.intensity ?? 1))
      panelCos.push(new THREE.Vector2(Math.cos(ph), Math.cos(Math.min(Math.PI * 0.5, ph * 1.7))))
    } else {
      panelDir.push(new THREE.Vector3(0, 1, 0))
      panelColor.push(new THREE.Color(0, 0, 0))
      panelCos.push(new THREE.Vector2(1, 1))
    }
  }

  const cl = mood.clouds
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uAmbient: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(mood.sunDir[0], mood.sunDir[1], mood.sunDir[2]).normalize() },
      uSunCos: { value: sunCos },
      uSunEdge: { value: sunEdge },
      uSunRadiance: { value: mood.sunIntensity },
      uGlowStrength: { value: mood.glowStrength },
      uGlowPower: { value: mood.glowPower },
      uGradPow: { value: mood.gradPow },
      uGroundPow: { value: mood.groundPow },
      uHazeStrength: { value: mood.hazeStrength },
      uHazeFalloff: { value: mood.hazeFalloff },
      uCloudCoverage: { value: cl.coverage },
      uCloudSharp: { value: Math.max(0.01, cl.sharpness) },
      uCloudScale: { value: cl.scale },
      uCloudBand: { value: cl.band },
      uCloudSun: { value: cl.sunGlow },
      uCloudDrift: { value: new THREE.Vector2(cl.drift[0], cl.drift[1]) },
      uSeed: { value: mood.seed },
      uContrast: { value: mood.contrast },
      uSaturation: { value: mood.saturation },
      uGain: { value: mood.gain },
      uPanelCount: { value: Math.min(MAX_PANELS, mood.panels.length) },
      uPanelDir: { value: panelDir },
      uPanelColor: { value: panelColor },
      uPanelCos: { value: panelCos },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    // DoubleSide + no depth: the cube camera uses a negative fov (three's cube
    // convention) which flips winding. DoubleSide makes culling a non-issue.
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })

  setColorUniform(mat.uniforms.uZenith, mood.sky)
  setColorUniform(mat.uniforms.uHorizon, mood.horizon)
  setColorUniform(mat.uniforms.uGround, mood.ground)
  setColorUniform(mat.uniforms.uHaze, mood.haze)
  setColorUniform(mat.uniforms.uAmbient, mood.ambient)
  setColorUniform(mat.uniforms.uSunColor, mood.sun)
  setColorUniform(mat.uniforms.uCloudLit, cl.lit)
  setColorUniform(mat.uniforms.uCloudShade, cl.shade)
  return mat
}

/**
 * buildEnvironment(renderer, mood, opts) -> THREE.Texture (PMREM cubeUV)
 *
 * opts: { resolution = 256, overrides = null, key = null, force = false }
 *
 * Cached by mood + resolution + overrides. The returned texture is SHARED —
 * never dispose it directly, and never let a scene-teardown walk dispose it
 * (it is tagged userData.__shared). Use disposeEnvironments() at shutdown.
 */
export function buildEnvironment(renderer, mood = 'studio', opts = {}) {
  if (!renderer) {
    console.warn('[env] buildEnvironment called without a renderer')
    return null
  }
  const res = opts.resolution ?? 256
  const rid = rendererId(renderer)
  const cacheKey = `r${rid}|${opts.key || `${mood}|${res}|${opts.overrides ? JSON.stringify(opts.overrides) : ''}`}`
  if (!opts.force) {
    const hit = envCache.get(cacheKey)
    if (hit) return hit.texture
  }

  const m = getMood(mood, opts.overrides)
  const pmrem = getPMREM(renderer)

  // Half-float so the sun disc can sit well above 1.0. An LDR cube would clamp
  // it and the whole point of the IBL (real specular range) would be lost.
  const cubeRT = new THREE.WebGLCubeRenderTarget(res, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  })

  const geo = new THREE.BoxGeometry(2, 2, 2)
  const mat = makeSkyMaterial(m)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  const skyScene = new THREE.Scene()
  skyScene.add(mesh)

  let texture = null
  let target = null
  try {
    const cam = new THREE.CubeCamera(0.1, 10, cubeRT)
    cam.update(renderer, skyScene)
    target = pmrem.fromCubemap(cubeRT.texture)
    texture = target.texture
  } catch (err) {
    console.warn('[env] cube path failed, falling back to PMREM.fromScene()', err)
    try {
      target = pmrem.fromScene(skyScene, 0, 0.1, 10)
      texture = target.texture
    } catch (err2) {
      console.warn('[env] environment generation failed entirely', err2)
      texture = null
    }
  }

  cubeRT.dispose()
  geo.dispose()
  mat.dispose()
  skyScene.clear()

  if (!texture) return null

  texture.name = `env:${mood}`
  texture.userData.__shared = true   // dispose-walk guard, see roster.js:19-29
  envCache.set(cacheKey, { texture, target, mood, key: cacheKey })
  return texture
}

/**
 * applyEnvironment(scene, mood, renderer, opts) -> handle
 *
 * opts: { resolution, overrides, intensity = 1, background = false,
 *         backgroundBlurriness = 0.35, rotationY = 0 }
 *
 * handle: { mood, texture, intensity, setIntensity(v), dispose() }
 * dispose() restores whatever the scene had before — it never disposes the
 * shared texture.
 */
export function applyEnvironment(scene, mood = 'studio', renderer = null, opts = {}) {
  const texture = buildEnvironment(renderer, mood, opts)
  const prevEnv = scene ? scene.environment : null
  const prevBg = scene ? scene.background : null
  const prevInt = scene ? scene.environmentIntensity : 1

  if (scene && texture) {
    scene.environment = texture
    scene.environmentIntensity = opts.intensity ?? 1
    if (opts.rotationY) scene.environmentRotation.set(0, opts.rotationY, 0)
    if (opts.background) {
      scene.background = texture
      scene.backgroundBlurriness = opts.backgroundBlurriness ?? 0.35
      scene.backgroundIntensity = opts.intensity ?? 1
    }
  }

  return {
    mood, texture,
    get intensity() { return scene ? scene.environmentIntensity : 1 },
    setIntensity(v) { if (scene) scene.environmentIntensity = v },
    dispose() {
      if (!scene) return
      scene.environment = prevEnv
      scene.environmentIntensity = prevInt
      if (opts.background) scene.background = prevBg
    },
  }
}

export function environmentCacheStats() {
  let bytes = 0
  for (const e of envCache.values()) {
    const t = e.target
    if (t) bytes += t.width * t.height * 8   // RGBA16F
  }
  return { count: envCache.size, bytes, moods: [...envCache.values()].map((e) => e.mood) }
}

/** Drops every cached environment. Call at shutdown / quality rebuild, not per match. */
export function disposeEnvironments(renderer = null) {
  for (const e of envCache.values()) e.target?.dispose()
  envCache.clear()
  if (renderer) {
    const g = pmremByRenderer.get(renderer)
    if (g) { g.dispose(); pmremByRenderer.delete(renderer) }
  }
}
