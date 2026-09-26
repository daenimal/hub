# PSX Texture Converter — Hardware & Preset Reference

This doc explains what a texture must actually satisfy to be used in a game on
the ORIGINAL PlayStation (and in "modern" PSX-style projects, be they real
homebrew on the console or PSX-look games in an engine), so presets and
pipeline decisions are grounded in the hardware instead of "retro look"
approximations.

## Hardware constraints (what the console actually does)

| Constraint | Value | Notes |
| --- | --- | --- |
| VRAM | 1 MB (1024×512 at 16-bit), 2 MB on later GPUs | Shared by framebuffer(s) + all texture pages + all CLUTs. |
| Texture page | 256×256 max | **Hard limit:** U/V coordinates only span 0..255, so no texture can exceed 256×256 regardless of color depth. The GPU pages VRAM in 256×256 areas (LibPSn00b splits the frame buffer in 64×256 pixel pages relevant to textures). Larger images must be split across pages. |
| VRAM alignment | 8-bit: width multiple of 2; 4-bit: multiple of 4 | VRAM addresses pixels in 16-bit words, so 4/8-bit textures are stored at ¼/½ of their actual width; widths must stay word-aligned. |
| Texture modes | Mode 4 = 4-bit CLUT (16 colors), Mode 8 = 8-bit CLUT (256 colors), Mode 15 = 15-bit direct (BGR 5:5:5 + 1 STP bit), Mode 24 = 24-bit (rare) | Texture pixels in modes 4/8 are palette **indices**, not colors. CLUT entry = 16-bit word, 5:5:5 + STP. |
| Color pipeline | 24-bit in → 15-bit framebuffer | The GPU keeps 24-bit accuracy internally but the framebuffer (and the on-screen result) is 15-bit. |
| GPU dithering | Per-texpage flag (GP0(E1h) bit 9) | "Dither 24bit to 15bit": 0 = strip LSBs, 1 = ordered dither (the classic 4×4 Bayer cross-hatch). This is a runtime flag, not baked into the texture. |
| Filtering / mipmaps | None | The PSX always samples textures with **nearest** (point) filtering — no bilinear, no trilinear, no mipmaps. |
| UV wrapping | Power-of-two mask | Wrap coordinates are masked modulo a power of two, so power-of-two dimensions avoid edge bleeding with wrapping UVs. Non-power-of-two works if UVs stay in [0,1] (clamped); many real games shipped non-square textures (e.g. 32×64). |
| Alpha | 1-bit STP flag per CLUT entry | Modes 4/8/15 offer per-texel 1-bit transparency (semi-transparent vs opaque) plus 4 runtime blending modes — not 8-bit alpha. |
| Sprite/primitive size | Width/height up to 1023×511 (even width for rectangles) | Max texture window/wrap stays 256×256; larger UVs repeat the page. |

Recommended sizes used by the community: 16, 32, 64, 128, 256 in each
dimension (non-square allowed, e.g. 256×128, 64×32).

## The two things to keep pixel-art-accurate

### 1. Nearest (point) filtering — never let the texture be smoothed

- On the console this is inherent: the GPU does **no** filtering. Blurred or
  mipmapped textures are physically impossible there.
- The danger is everywhere *around* the conversion: engines/emulators rescale
  with bilinear/trilinear by default, which instantly melts the pixel look.
  When you put the converted texture into a modern engine (Unity, Godot,
  WebGL, OpenGL), the sampler **must** be `Point`/`Nearest`, with no mipmaps.
- In this converter the downscale already draws with
  `ctx.imageSmoothingEnabled = false` (workers/optimizer.worker.ts), so the
  output keeps hard edges instead of blurring like a bilinear resize. Keep the
  export lossless (paletted PNG/TIM); a lossy re-encode (JPEG) reintroduces
  smearing and banding.

### 2. Dithering — know which one you are relying on

There are two independent dithering stages. They can be combined or used
separately:

| Stage | Where it happens | Controlled by | Effects |
| --- | --- | --- | --- |
| Texture pre-dithering | Baked into the texture pixels by you (this tool: floyd-steinberg / bayer / ordered) | `dithering` + `ditherStrength` | Always visible, on real HW and emulators, on CRT and modern panels. |
| GPU 24→15-bit dithering | Runtime, in the GPU when drawing | Per-texpage flag GP0(E1h) bit 9 | The signature 4×4 Bayer cross-hatch; only 15-bit output, only when the flag is set (most retail games left it on). |

- On a CRT with composite video the two stages visually blend together (MVG
  and psx-undither explain this well) — gradient steps become almost invisible.
- On modern flat-panels the GPU cross-hatch reads as obvious noise, which is
  why `psx-undither`-style patches exist and many modern PSX-look projects turn
  the runtime flag off.
- **Recommendation for a "modern" PSX texture:** pre-dither with error
  diffusion (floyd-steinberg) at full strength so gradients hold their shape on
  LCDs regardless of the GPU flag, and treat GPU dithering as an optional
  full-screen effect. For flat UI with clean bands, dither `none` + GPU flag is
  the classic combo.
- 15-bit color (32 levels per channel) matters regardless: any 24-bit color
  the GPU draws is reduced to 5 bits per channel on its way to the framebuffer.

## What the converter enforces in code

- **15-bit snapping**: `snapTo15bit()` in `workers/optimizer.worker.ts` rounds
  every CLUT color to the nearest 5-bit level, so each exported color is
  exactly representable on the PSX and survives a BGR555 CLUT conversion.
- **≤ 256×256 output**: `maxWidth`/`maxHeight` cap the preset at one texture
  page. Sizes are NOT force-snapped to power-of-two — that would distort
  non-square aspect ratios. Power-of-two is a recommendation (wrap-safe), not a
  hard requirement.
- **Nearest downscale**: the worker resizes with `imageSmoothingEnabled =
  false`, keeping crisp pixels.
- **CLUT-sized color count**: the preset uses 256 colors (8-bit CLUT). 16
  (4-bit CLUT) is the other valid size and halves VRAM; `quantizeColors` is
  clamped to 2..256 in the worker for custom settings.
- **Pre-dithering**: applied before the nearest-color mapping, at 0..1
  strength — the baked-in stage that survives modern displays.

## Current free preset

| id | Name | Size | Colors | Dithering | Rationale for a modern PSX game |
| --- | --- | --- | --- | --- | --- |
| `preset-psx-8bit` | PSX 8-bit | 256×256 | 256 | floyd-steinberg @ 1 | Full 8-bit CLUT inside the 256×256 hard limit; error diffusion baked in so gradients survive LCDs without relying on the GPU dither flag; nearest-sampled, lossless, 15-bit-clean colors. Word-aligned and ready for `img2tim`/TIMedit (`-tim 1`, 8-bit). |

**Preset coherence check (research, 2026):** 256×256 = hardware maximum (UV range 0..255, PSn00bSDK docs ch 1.3); 256 colors = complete 8-bit CLUT (`breck-mckye` PSn00bSDK docs, TIM header docs); 15-bit snapping matches how PSX tooling converts 8:8:8 → 5:5:5 on TIM import (ps-image); baked dithering is the robust choice on modern flat-panels (GPU cross-hatch reads as noise on LCDs, see MVG/psx-undither).

`FREE_PRESETS[0]` is pre-selected on load and used as `DEFAULT_PRESET` in the
UI (see `components/tools/texture-optimizer/optimizer-ui.tsx`).

## Adding a preset later

1. Add an object to `FREE_PRESETS` in `lib/texture-optimizer/presets.ts`:
   `{ id, name, settings: { maxWidth, maxHeight, quantizeColors, dithering, ditherStrength } }`.
2. Checklist for a *real* PSX preset:
   - `maxWidth`/`maxHeight` ≤ 256 (the hardware limit; prefer a power-of-two
     value) and word-aligned — an 8-bit texture needs an even width, a 4-bit
     one a width that is a multiple of 4.
   - `quantizeColors` ∈ { 16 (4-bit CLUT, half VRAM), 256 (8-bit CLUT) }.
   - `dithering` ∈ { "none", "floyd-steinberg", "bayer", "ordered" },
     `ditherStrength` 0..1. Pick the dither stage deliberately (see above).
   - Verify VRAM budget: 1 MB holds the framebuffer, every texture page and
     every CLUT. A 256×256 8-bit texture is 64 KB (half of the page scanline
     width, 256×256 indices at 8-bit); a 4-bit one is 32 KB.
3. Add a row to the table in this doc so the reasoning survives.

## Using the output on a real console

1. Convert the paletted PNG to a **TIM** with a TIM toolchain (PSn00bSDK
   `img2tim`, `tim-cli`, TIMedit, etc.). CLUT entries are 16-bit
   BGR 5:5:5 + STP — with the 15-bit snapping above they convert cleanly.
2. Upload texture + CLUT into VRAM (DMA), reference them through a texpage and
   CLUT address in every draw; split anything > 256 px across pages. Modes 4/8
   map 1-bit PNG alpha → STP flag (no 8-bit alpha).
3. In any *engine/emulator* path, force `Nearest`/point sampling with no
   mipmaps; decide deliberately whether the GPU dither flag is on (SS-style
   banding fix) or off (clean modern look).

## Sources

- psx-spx — GPU, texpage + dither bit (GP0(E1h) bit 9, 24→15-bit), texture window: https://psx-spx.consoledev.net/graphicsprocessingunitgpu/
- PSDevwiki — GPU overview, texture modes 4/8/15/24, 256×256 max: https://www.psdevwiki.com/ps1/GPU
- PSXSPX GPU rendering attributes — texpage/CLUT/STP bits: https://problemkaputt.de/psxspx-gpu-rendering-attributes.htm
- PSn00bSDK docs — Textures, TPages and CLUTs (hard 256×256 limit, VRAM word alignment, img2tim/TIMedit): https://www.breck-mckye.com/psnoobsdk-docs/chapter1/3-textures.html
- LibPSn00b reference — VRAM page/tile layout: https://psx.arthus.net/sdk/PSn00SDK/Docs/libn00bref.pdf
- PSn00bSDK `img2tim` — TIM conversion: https://github.com/Lameguy64/PSn00bSDK
- TIMedit — TIM/CLUT editor: https://github.com/Lameguy64/TIMedit
- ps-image — PSX texture converter that reduces 8:8:8 → 5:5:5 on import, previews GPU dithering: https://github.com/MeganGrass/ps-image
- psx-undither — GPU dither flag on/off, CRT-era rationale: https://github.com/alex-free/psx-undither
- MVG — PlayStation dithering explained (CRT blend vs flat-panel noise): https://retrorgb.com/mvg-playstation-dithering-explained.html
- ReShade "Posterize Pixelate PSX" — 4×4 Bayer matrix = the PSX framebuffer pattern, 32 levels/channel: https://github.com/FireDragon761138/Reshade_shaders
- OpenVIII TIM/VRAM format docs: https://wiki.ffrtt.ru/index.php?title=TIM