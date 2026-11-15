# How the Windows app works

The app is a small tray program around Microsoft's WebView2. The wallpaper and the editor are the same page: the editor's HTML file, started with `?wallpaper=1` for the wallpaper.

## Behind the icons

`WallpaperForm` is a borderless window. On start it asks the desktop (`Progman`) to create its wallpaper layer, finds that `WorkerW` window, and makes itself a child of it, so it draws under the desktop icons. Both the classic layout and the Windows 11 24H2 layout are handled. If Explorer restarts, the layer disappears and the window is created again.

## Input

A window under the icons never receives the mouse, so the app listens with a low-level mouse hook. When a press starts on the desktop, the press, the drag and the release are passed to the page as pointer events; the wheel changes page. Nothing is swallowed, so the desktop behaves as usual.

## The Kustom folder as a web origin

The Kustom folder is mapped to `https://klwp.wallpaper/` inside WebView2, so the page can fetch presets, fonts, icon sets and images from it directly. The app keeps its own copy of the page in a `.app` folder there.

## Talking to the page

The app calls functions on the page:

| Call | Purpose |
| --- | --- |
| `KWall.load(url, pages)` | Load a preset; `pages` 0 means work it out from the preset |
| `KWall.ptr(type, x, y)` / `KWall.wheel(delta)` | Mouse input, in physical pixels |
| `KWall.fit(mode)` | `fill` or `phone` layout |
| `KWall.pause(on)` | Stop or resume rendering |
| `KWall.data(obj)` | Real device data, for example the battery |
| `KHost.onList(files)` | Answer to a request for the Kustom folder listing |

The page sends short text messages back: `ready`, `loaded:<pages>`, `error:<text>`, `list`, `save:<flag>|<name>|<base64>`, `pickkustom`, `music:<action>`, `link:<url>`.

## Where things are kept

| Path | Contents |
| --- | --- |
| `%LOCALAPPDATA%\Programs\KLWP Wallpaper` | The installed program |
| `%APPDATA%\KLWPWallpaper` | `config.txt`, `log.txt` and the browser profile |
| The Kustom folder (default `%APPDATA%\Kustom`) | Your presets and resources |
