# KWLWP

A desktop editor for [KLWP](https://play.google.com/store/apps/details?id=org.kustom.wallpaper) presets with a live preview, and a Windows app that runs those presets as your live desktop wallpaper.

![The editor with a phone and a tablet preview side by side](docs/images/editor.png)

KWLWP is an independent project. It is not made by, affiliated with or endorsed by Kustom Industries, and it contains none of KLWP's code. You need KLWP itself to use the presets on Android.

## What's in here

**The editor** (`editor/`) is a single HTML file that runs in any modern browser, with no server and no install.

- Opens and saves `.klwp` and `.komp` files. Anything it does not understand is kept as it is, so a preset survives a round trip unchanged.
- Live preview at any resolution or aspect ratio, with several devices side by side. The size list has phones,
  common desktop sizes and the monitors plugged into your PC.
- Per-theme editor settings: ☆ in the preview bar makes the current size the theme's default preview size, and
  desktop sizes get a **Scale** box (for example 60% so a phone theme is not oversized on a monitor; the desktop
  wallpaper uses it too). These are stored in an extra `kwlwp.json` entry inside the `.klwp`, which KLWP never reads:
  the phone loads the theme as normal and leaves the entry out when it saves. A copy is also kept on the PC.
- Preset info (click the title) sets the title and the file name; the file name follows the title until you change it.
- Open shows your wallpapers and komponents as a grid of thumbnails (choose your Kustom folder, or any folder of
  presets). Only the thumbnail is read from each file, so large presets open the grid instantly.
- Exports include thumbnails made the way KLWP makes them: 1024 pixels on the long side, portrait and landscape
  (a komponent gets one cropped to the komponent).
- The same structure as KLWP's editor: items, tabs per item, globals, formulas, animations and touch actions.
- A simulated-device panel for battery, weather, music, notifications and the clock, using KLWP 3.82's own
  parameter names for every function. The phone button under the preview switches the preview between the
  simulated data and this PC's real data.
- KLWP's built-in default font (Roboto) and default icon set (Material Icons) are included, so items that leave
  them empty look as they do on the phone. Icon names match regardless of case, and Iconify icons (the SVG kept
  in the icon name) are drawn.
- Animated Image items play their GIFs.
- Right-click an item in the preview (select mode) for Bring forward / Send backward / Bring to front / Send to back,
  Duplicate, Copy, Delete and more; Ctrl+] / Ctrl+[ (with Shift for front/back), Ctrl+D and Delete do the same.
- Item and global lists show a small picture of each type; image fields show thumbnails of every image.
- The Open screen has a search box; Save has an arrow beside it for Save as… (and, in the Windows app, Save and use
  as desktop wallpaper, and Download a copy).
- Touch mode (on by default) and a fullscreen preview: swipe between launcher pages and tap things like on a phone.
  Turn touch mode off to select and drag items.
- Dragging snaps edges and centres to the screen and to other items, with cyan guides; the magnet button turns it off
  and holding Alt moves freely.
- The pointer button on each item row makes the item click-through in the preview, so you can reach what it covers.
- The formula editor lists errors as you type, in KLWP's own wording (`err: parentheses mismatched`,
  `err: invalid argument count for df`, ...). Formulas follow KLWP 3.82's rules: its function list and argument
  counts, `&` and `|` at the same precedence, `/* comments */`, and a `$…$` block that cannot be parsed shows nothing.
- Settings (the gear) shared by every theme: weather provider (simulated, Open-Meteo with no key, or OpenWeatherMap
  with your key), location, temperature and wind units, 12/24-hour clock and time zone.

**The Windows app** (`windows/`) puts a preset behind your desktop icons, the way other live-wallpaper apps do.

- Swipe on the empty desktop (or scroll) to move between pages; click, double-click and hold run the preset's touch actions.
- The wallpaper uses this PC's real data: processor, memory and storage for `rm()`, network and Wi-Fi for `nc()`,
  traffic for `ts()`, volume, dark mode, accent colour, screen and model for `si()`, sun, moon and season for `ai()`,
  weather and air quality from the chosen provider, and `wg()` downloads the address for real. The tray menu's
  "Use the editor's simulated data" switches it to the simulated data instead. Phone-only data (notifications,
  calendar, fitness, unread counts) is empty, as on a phone without those permissions.
- Music touch actions control what is playing on the PC through Windows' media controls (falling back to the media
  keys), and `mi(...)` shows the real song, artist, album, progress and cover art. Link actions open the browser,
  and the clock, battery and (with a weather provider set) weather and location are real.
- Clicks on desktop icons stay with the icons. Settings can turn off the blue selection box that a drag on the
  desktop normally draws.
- A "Launch app" touch action can open anything on the PC: put a Windows path in its App / intent field, for example
  `C:\Games\game.exe`, `"C:\Program Files\App\app.exe" --flag` or `%APPDATA%\Spotify\Spotify.exe`.
  The app asks once per program before it ever starts one.
- Rendering pauses while a maximised or fullscreen window covers the monitor.
- The editor is included as its own window that looks and behaves like a desktop app (its own title bar, no browser
  menus or shortcuts). It opens straight to the wallpaper that is on the desktop, and shares one **Kustom folder** with the wallpaper, laid out like the folder on your phone (`wallpapers`, `komponents`, `fonts`, `icons`, `bitmaps`).
- A per-user installer, with no administrator rights needed.

![A preset running as the desktop wallpaper](docs/images/wallpaper-syrup-glass.png)

## Getting started

### Just the editor

Build it (see below), then open `KLWP Desktop Editor.html` in a browser. Try it with `examples/KWLWP_Demo.klwp`.

To get a preset onto your phone, copy the exported file into `Kustom/wallpapers`. KLWP only notices files copied in from outside after it restarts, so force-stop KLWP (or reboot) before loading it; otherwise it reports "File not found".

### The Windows app

Requirements: Windows 10 or 11 (64-bit) with the Microsoft Edge WebView2 runtime, which Windows 11 includes and Windows 10 normally already has.

1. Double-click `build.bat`.
2. Run `dist\KLWP Wallpaper Setup.exe` and choose your Kustom folder (the default is `%APPDATA%\Kustom`).
3. Right-click the pink **K** icon near the clock to pick a wallpaper, set the number of pages, choose the layout and monitor, or open the editor.

To remove it, use Windows Settings > Apps. Your Kustom folder is left alone.

## Building

`build.bat` needs nothing installed. It uses the C# compiler and PowerShell that ship with Windows, and downloads Microsoft's WebView2 library from nuget.org the first time. Everything lands in `dist/`:

| File | What it is |
| --- | --- |
| `KLWP Wallpaper Setup.exe` | The installer, self-contained |
| `KLWPWallpaper.exe` (+ three DLLs) | The app, runnable in place |
| `KLWP Desktop Editor.html` | The editor on its own |

To build only the editor on any OS: `python3 editor/build.py` (output in `editor/dist/`).

The Windows code is deliberately limited to C# 5, because that is what the compiler built into Windows understands.

## Repository layout

```
editor/
  src/            the editor and renderer
    index.html      page shell
    style.css       styles
    app.js          editor UI, file handling, touch mode, wallpaper mode
    render.js       layout and canvas rendering of a preset
    formula.js      Kustom formula parser and evaluator, simulated device data
    schema.js       item types, their tabs and properties
    labels.js       display labels for option values
    defaults.js     KLWP's default value for every setting
  vendor/         JSZip
  build.py        bundles src/ into one HTML file
  build.ps1       the same, for Windows without Python
windows/
  app/            the tray app (wallpaper window, editor window, uninstaller)
  installer/      the setup program
  assets/         icon and manifests
docs/             notes on the preset format, the renderer and the Windows app
tools/            dex disassembler and the script that extracts KLWP's setting defaults
examples/         a small demo preset
build.bat         builds everything into dist/
```

## How accurate is it?

The renderer follows KLWP's own rules wherever they could be read out of KLWP 3.82: scroll animations, shadows,
gradients, image filters and the default value of every setting. The rest was matched against screenshots from a
real phone. [docs/rendering-notes.md](docs/rendering-notes.md) lists the rules and which ones are still measured;
[docs/preset-format.md](docs/preset-format.md) describes the file format.

Known gaps:

- Layer effects, colour filters on groups and inner shadows are not drawn.
- Gyroscope-driven values are not simulated.
- "Morphing Text" and "Series" items render and are preserved, but cannot be added from the editor.
- Flows are edited as raw JSON.
- In the wallpaper, notifications, calendar and similar phone data still come from the simulated-data defaults.
- With the selection box turned off, clicking empty desktop space no longer clears the icon selection.

## License

[MIT](LICENSE). JSZip (`editor/vendor/`) is included under its own MIT license. "KLWP" and "Kustom" are names of Kustom Industries' products and are used here only to say what this project works with.
