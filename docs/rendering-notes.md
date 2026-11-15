# Rendering notes

These are the rules the renderer follows. They were fitted against screenshots, thumbnails and screen recordings from a real device, so treat them as observations, not a specification. Constants that were fitted to few samples are marked.

## Layout

- 720 Kustom points span the short side of the screen.
- Default anchor: top for children of the root, centre elsewhere. A stack defaults to vertical, left-aligned.
- Text set to "fit to box" takes its size from the box height, is left-aligned, and is cut with an ellipsis when too wide.
- A linear progress bar's length is `style_size` and its thickness `style_height`.

## Shadows

- An item with an outer shadow reserves room for it: its box grows by twice the shadow's offset in each direction, and the item sits on the side away from the shadow. Stroked shapes also add their stroke width.
- Blur: sigma in points is `blur * 0.115 + 0.5`.
- The shadow takes the item's paint colour unless a shadow colour is set.
- A filled shape's shadow is hollow (cut where the shape is). Text, icons, strokes and fully transparent "glow only" shapes keep the whole blurred copy.
- KLWP only offers a shadow for items inside a group, not directly on the root.

## Masks and textures

- "Background" and "Blurred background" masks replace the item's paint with the wallpaper background behind it. They are exclusive with Texture and Shadow, and add Filter, Dim and (blurred only) Blur.
- Background blur: sigma in points is about `blur * 0.34`. Hue filter: `amount * 1.8` degrees. Both fitted to one sample.
- Radial and sweep gradients are centred at `width * (0.5 - offsetX / 100)`, `height * (0.5 - offsetY / 100)`.
- Paint modes act within the nearest group. Multiply only tints what is already there.

## Scroll animations

- `SCREENn` is page `n` (counting from 1).
- "From centre" and "Up to centre" are zero on the centre page and grow away from it. "Before centre" and "After centre" are complete on the centre page.
- The "In" actions (scale in, fade in, colour filter in) with a one-sided rule run on the opposite side.
- Distance scrolled per page: `720 * speed * (xscreens - 1) / (screens - 1)`.

## Timed animations

- Durations are in tenths of a second.
- Easing follows Android's interpolators. A two-way loop plays the eased move out and then the same eased move back.

## Morphing Text

Drawn as a straight line: vertical scale `sqrt(ratio / 100)`, skew as a shear, spacing in points between letters. Fitted to one sample.
