# The KLWP preset format

Notes from reading presets. Nothing here is official.

## The archive

A `.klwp` file is a zip. KLWP writes entries with the preset first:

| Entry | Contents |
| --- | --- |
| `preset.json` | The whole preset (`komponent.json` in a `.komp`) |
| `preset_thumb_portrait.jpg`, `preset_thumb_landscape.jpg` | Thumbnails shown in KLWP's loader |
| `bitmaps/IMG<hash>` | Images, with no file extension |
| `fonts/<name>.ttf` / `.otf` | Fonts |
| `icons/<set>.ttf` + `icons/<set>.json` | Icon fonts and their glyph maps |

There are no directory entries. The editor writes the same layout and the same zip header fields as KLWP's own files (version 2.0, data descriptors, UTF-8 flag).

### What the editor adds

- `kwlwp.json`, only when a theme has editor settings: `{"kwlwp":1, "view":{"name","w","h","desk"}, "deskScale":60}`.
  KLWP opens entries by name (`preset.json`, `fonts/...`), so it never reads this one, and it is not written back
  when the phone saves the theme.
- `"kwlwp_noselect": true` on an item that should be click-through in the editor's preview. KLWP's settings writer
  drops keys it has no spec for ("Purging non existing key"), so this also disappears harmlessly after a phone save.

## preset.json

```json
{
  "preset_info": { "version": 15, "title": "...", "width": 540, "height": 1200, "xscreens": 2, "features": "", "release": 381531008, "locked": false, "pflags": 0 },
  "preset_root": { "internal_type": "RootLayerModule", "viewgroup_items": [ ... ] }
}
```

Newer versions of KLWP also write `archive`, `id`, `hash` and `ts` into `preset_info`. Only values that differ from the default are stored, so a missing key means "default".

### Items

Every item is an object with an `internal_type`:

`RootLayerModule`, `OverlapLayerModule`, `StackLayerModule`, `KomponentModule`, `TextModule`, `CurvedTextModule` (shown as "Morphing Text"), `ShapeModule`, `BitmapModule`, `MovieModule`, `FontIconModule`, `ProgressModule`.

Groups hold their children in `viewgroup_items`. Animations are in `internal_animations`, touch actions in `internal_events`.

### Formulas and globals

`internal_toggles[key]` says how a property gets its value:

| Toggle | Meaning | Where the value is |
| --- | --- | --- |
| `0` or absent | A plain value | The property itself |
| `10` | A formula | `internal_formulas[key]` |
| `100` | Bound to a global | `internal_globals[key]` |

Formula syntax follows KLWP 3.82's evaluator (`org.kustom.lib.parser`, built on javaluator): operators `&` `|`
(lowest, same level), `=` `!=` `<` `<=` `>` `>=` `~=`, `+` `-`, `*` `/` `%`, `^`, then unary minus; `/* comments */`
inside `$...$`; and only the 33 registered functions, each with a fixed argument range (for example `df` 1-2,
`tc` 2-4, `if` 2-99). A block that cannot be parsed gives an empty string and an error such as
`err: parentheses mismatched`; a function that fails gives an empty string and `<name>: <message>` while the rest
of the expression still runs.

Globals live in `globals_list` on the root or on a komponent. Types: `TEXT`, `NUMBER`, `COLOR`, `SWITCH`, `LIST`, `BITMAP`, `FONT`, `FOLDER`. A global can itself be a formula (`toggles: 10` with `global_formula`) or point at another global (`toggles: 100` with `global`).

### File references

Files are referenced as `kfile://org.kustom.provider/<folder>/<name>`, for example `kfile://org.kustom.provider/fonts/Roboto.ttf`. The path is looked up inside the preset's own archive first and then in the Kustom folder. A reference to a file inside another archive has the archive's path in front: `kfile://org.kustom.provider/wallpapers/other.klwp/icons/set.ttf`.

## Units

Sizes and offsets are in Kustom points: the short side of the screen is always 720. Items directly on the root are anchored to the top by default; items inside groups to the centre. Offsets are mirrored for right and bottom anchors.
