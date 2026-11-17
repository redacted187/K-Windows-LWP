# Rendering rules

Most of these rules were read out of KLWP 3.82's own code (class names are given so they can be checked again
against a newer version; see [tools/](../tools) for how). A few still come from comparing renders with screenshots
from a real phone; those are marked *measured*.

## Units

- One Kustom point is `min(screen width, screen height) / 720` device pixels (`config.u1`).
- Sizes and offsets are converted with that factor. Shadow blur is not: it is in raw device pixels.

## Defaults

A setting that is missing from `preset.json` has KLWP's default value. All of them are in
[`editor/src/defaults.js`](../editor/src/defaults.js), extracted from KLWP's module spec (`render.spec`, `ye.*`).
Some that matter often:

| Setting | Default |
| --- | --- |
| `fx_shadow_blur` / `_distance` / `_direction` / `_color` | 30 / 15 / 45 / `#FF000000` |
| `fx_gradient_offset`, `fx_gradient_offset_x`, `fx_gradient_offset_y` | 50 |
| `shape_width` / `shape_height` | 20 / 20 |
| `paint_stroke` | 1 |
| `text_size` / `text_width` / `text_height` | 20 / 200 / 200 |
| `paint_color` | `#FFFFFFFF`; progress background `#FFAAAAAA` |
| `background_color` (wallpaper) | `#FF333333` |
| `*_filter_amount` / `*_filter_color` | 0 / `#FFFF0000` |
| `position_anchor` | TOP for items on the root, CENTER inside groups |

## Positions

- Only items directly on the root use X/Y offsets; inside groups items are placed by anchor and padding.
- Stacks default to `VERTICAL_LEFT`.

## Scroll animations (`render.AnimationModule`, `options.AnimationRule`, `options.AnimationCenter`)

Let `last` be the highest page index and `offset` the launcher's scroll position from 0 to 1.

- Centre screen: `SCREENn` is page `n − 1`; `CENTER` is `ceil(last / 2)`; `FIRST` / `LAST` are 0 / `last`;
  `CENTER_M1..3` / `CENTER_P1..3` count from the centre.
- Raw distance from the centre page `c`: `d = offset − c / last`.
- Scroll action: translation = `screen width × (c − page) / last × speed / 100`, clamped to ±`limit` points, along
  `angle`. With one page nothing moves. Scroll inverted runs the other way.
- Rules: CENTER is always active; UP_TO_CENTER and BEFORE_CENTER act while `d ≤ 0`, FROM_CENTER and AFTER_CENTER while
  `d ≥ 0`; BEFORE / AFTER use the page before / after the centre.
- Other actions use an amount `A` that is 100 on the centre page and falls to 0 after `100 / speed` pages:
  scale = `max(100 − amount, A) / 100`; scale in = `15 − 14 × that / 100`; fade = `max(100 − amount, A)` (fade in is
  100 minus that); rotate = `A × 3.6` degrees, limited by `amount`; skew = `(100 − max(100 − amount, |A|)) × 0.02`.

## Shadows (`render.view.q`, `render.PaintModule`)

- KLWP calls Android's `Paint.setShadowLayer(max(1, blur / 4), dist·cos(360° − dir), dist·sin(360° − dir), colour)`.
  Android turns that radius into a Gaussian sigma of `0.57735 × radius + 0.5` device pixels.
- The shadow pass repaints the item with the shadow colour in place of the paint colour, underneath the item:
  - Without a texture the shadow is the shadow colour; a fully opaque shadow colour takes the paint's alpha.
  - With a gradient or bitmap texture the paint has a shader, so only the shadow colour's alpha counts and the
    shadow is a blurred copy of the texture itself.
- The item's box is padded by `distance × (1 + 0.015 × blur)` on the side the shadow falls.

## Gradients (`render.view.q.p`)

- Centre: item centre + (`centre X / Y` − 50)% of the item's size. Colour change from `offset − width/2` to
  `offset + width/2`.
- Radial radius: distance from the centre to the farthest corner; for a circle shape, distance to the circle's
  centre + width / 1.98.
- Sweep gradients start at the bottom (Android's sweep turned 90°).
- Colours blend with premultiplied alpha (*measured*: a fade to a transparent colour is linear).

## Morphing Text (`render.view.f`)

- Every letter is its own glyph outline at the origin (`Paint.getTextPath` for that one letter).
- Ratio `r`: above 0 the letter is squashed to `(100 − r)%` of its height, below 0 to `(100 + r)%` of its width,
  both about the baseline origin. Skew `k` then slants it by `−k / 100` horizontally per unit of height.
- Letter `i` starts at the sum of the advances before it plus `i × spacing`. Advances are `Paint.getTextWidths`:
  measured along the whole line, so kerning counts and a ligature's width (fi, fl, ff…) goes to its first letter.
- Justify: spacing = `(text width − ink width of the line) / letter count`.
- Angle `a`: the letters are laid on an arc whose length is the line length and that spans `a` degrees (centre
  below for positive angles, above for negative), each letter turned to follow it.
- The item's box is the ink outline of all letters together, plus the stroke width.

## Image filters (`options.BitmapColorFilter`, `utils.p`)

The amount is a 0–100 slider used as `a = amount / 100`.

| Filter | Effect |
| --- | --- |
| BW | saturation 0 |
| SEPIA | saturation 0.95, then R/G/B × 1 / 0.95 / 0.82 (amount ignored) |
| DESATURATE | saturation `1 − a` |
| INVERT | inverted (amount ignored) |
| COLORIZE | grey, then multiplied by the filter colour including its alpha (amount ignored) |
| HUE | hue rotated by `π × a` |
| CONTRAST | scale `1 + a` around mid-grey |
| BRIGHTEN | `a × 255` added to each channel |
| DARKEN | scale `1 − a` |

"Dim" is applied afterwards as a darken by `dim / 100`.

## Advanced animations

From `org.kustom.lib.animator`: each property's keyframes sit in a sorted map. When the first keyframe is after
position 0, KLWP adds one at 0 holding the property's untouched value (1 for SCALE_X / SCALE_Y / SCALE_XY, 0 for
everything else), so a single keyframe at 100 animates from nothing to that value. The pair of keyframes is chosen
with the position floored to a whole number, but the value in between uses the exact position (flooring it as well
makes slow loops move in visible steps); the ease between two keyframes is the later keyframe's, and past the last keyframe the value holds.
OPACITY is "how transparent": the item is drawn at `100 − value` percent.

## Missing letters in a font

Android draws any character a font lacks with the system font (Roboto), so an icon font used for ordinary text
still shows its digits. The editor gives every text font KLWP's built-in Roboto as a fallback for the same result.

## Still measured, not read from the code

- Text box padding and FIT_TO_BOX sizing for ordinary Text items.
- The blur strength of the "blurred background" mask (`≈ 0.34 × blur` points).
- Timed animation easing curves (Android interpolators).
