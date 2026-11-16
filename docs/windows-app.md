# How the Windows app works

The app is a small tray program around Microsoft's WebView2. The wallpaper and the editor are the same page: the editor's HTML file, started with `?wallpaper=1` for the wallpaper.

## Behind the icons

`WallpaperForm` is a borderless window. On start it asks the desktop (`Progman`) to create its wallpaper layer, finds that `WorkerW` window, and makes itself a child of it, so it draws under the desktop icons. Both the classic layout and the Windows 11 24H2 layout are handled. If Explorer restarts, the layer disappears and the window is created again.

## Input

A window under the icons never receives the mouse, so the app listens with a low-level mouse hook. When a press starts on empty desktop space, the press, the drag and the release are passed to the page as pointer events; the wheel changes page. To tell an icon from empty space the app asks Explorer's desktop list view directly (`LVM_HITTEST`), so a click on an icon stays with the icon.

With "turn off the blue selection box" on, the press on empty space is passed to the wallpaper but not to the desktop, which is what stops Windows from starting its selection rectangle.

## Media

Music touch actions use Windows' media session controls (`Windows.Media.Control`, the same ones behind the volume flyout) to play, pause and skip, falling back to the media keys. The same API supplies the song, artist, album, position and cover art for `mi(...)`, sent to the page once a second while something changes. `build.bat` compiles this part against the WinRT metadata in `System32\WinMetadata`; if that is not possible on a PC, it builds without it and music actions use the media keys only.

## Real data

`SystemInfo.cs` reads what the KLWP functions need from Windows every few seconds and sends it with `KData`:
processor load (`GetSystemTimes`), memory (`GlobalMemoryStatusEx`), the system drive, network interfaces, Wi-Fi
name and signal (`netsh wlan show interfaces`), bytes sent and received, the speakers' volume (Core Audio), dark
mode and accent colour (registry), the screen and the PC model. `wg()` downloads go through the app (`wg:<id>|<url>`,
answered with `KHost.wg(id, ok, text)`), because a page cannot read most sites itself. The page works out sun, moon
and season from the location in Settings, and fetches weather and air quality from the chosen provider.

## The editor window

The editor window has no Windows caption: `WM_NCCALCSIZE` removes it while keeping Windows' own frame, shadow, resizing and snapping. The page's app bar is the title bar (`app-region: drag`, with WebView2's non-client region support) and carries minimise, maximise and close buttons. Edge's context menu, browser shortcuts, pinch zoom, swipe navigation and autofill are switched off; text fields get a small cut/copy/paste menu of their own, and "Download a copy" uses a normal Save As box.

When the editor opens, the app passes it the monitors (`mon=2560x1440p,1920x1080`) and the wallpaper currently on the desktop (`current=` and `name=`), which it opens straight away.

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
| `KData(obj)` | Real data for the wallpaper or the editor, for example `{mi: {...}}` for the music |
| `KHost.win({max})` | Tells the editor whether its window is maximised |
| `KHost.onList(files)` | Answer to a request for the Kustom folder listing |

The page sends short text messages back: `ready`, `loaded:<pages>`, `error:<text>`, `list`, `save:<flag>|<name>|<base64>`, `pickkustom`, `music:<action>`, `link:<url>`, `launch:<path>`, `setting:noselectrect:<0|1>`, and from the editor `win:min`, `win:max`, `win:close`, `win:drag`, `win:size:top`, `win:hello`.

## Where things are kept

| Path | Contents |
| --- | --- |
| `%LOCALAPPDATA%\Programs\KLWP Wallpaper` | The installed program |
| `%APPDATA%\KLWPWallpaper` | `config.txt`, `log.txt` and the browser profile |
| The Kustom folder (default `%APPDATA%\Kustom`) | Your presets and resources |
