// The tray application: settings, the Kustom folder, the tray menu, mouse forwarding and
// the conversation with the page running inside WebView2.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Win32;

namespace KlwpWallpaper
{
    class App : ApplicationContext
    {
        public const string Origin = "https://klwp.wallpaper";
        public string DataDir, ExeDir;
        public Icon AppIcon;
        EditorForm editor;
        Task<CoreWebView2Environment> envTask;
        System.Threading.EventWaitHandle openEvt;
        readonly Dictionary<string, string> cfg = new Dictionary<string, string>();
        NotifyIcon tray;
        WallpaperForm form;
        Timer timer;
        IntPtr hook = IntPtr.Zero;
        Native.HookProc hookProc;   // kept in a field so it is not collected
        bool dragging, userPaused, covered, pausedSent;
        int lastMoveTick, tickCount;
        DateTime presetStamp = DateTime.MinValue;
        string logPath;

        public App(bool openEditor, System.Threading.EventWaitHandle evt)
        {
            openEvt = evt;
            ExeDir = Path.GetDirectoryName(Application.ExecutablePath);
            DataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KLWPWallpaper");
            Directory.CreateDirectory(DataDir);
            logPath = Path.Combine(DataDir, "log.txt");
            try { File.WriteAllText(logPath, "started " + DateTime.Now + "\r\n"); } catch (Exception) { }
            LoadConfig();
            userPaused = Get("paused", "0") == "1";

            tray = new NotifyIcon();
            try { AppIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
            if (AppIcon == null) AppIcon = MakeIcon();
            tray.Icon = AppIcon;
            tray.Text = "KLWP Wallpaper";
            tray.Visible = true;
            tray.ContextMenuStrip = new ContextMenuStrip();
            tray.ContextMenuStrip.Opening += delegate { BuildMenu(); };
            tray.DoubleClick += delegate { OpenEditor(); };
            BuildMenu();

            if (EditorPath() == null) Balloon("KLWP Wallpaper", "\"KLWP Desktop Editor.html\" was not found next to KLWPWallpaper.exe.");
            CreateForm();

            hookProc = new Native.HookProc(MouseHook);
            hook = Native.SetWindowsHookEx(14, hookProc, Native.GetModuleHandle(null), 0);   // WH_MOUSE_LL
            Log("hook=" + hook);

            timer = new Timer();
            timer.Interval = 1000;
            timer.Tick += delegate { Tick(); };
            timer.Start();

            if (openEditor) OpenEditor();
            else if (Get("preset", "") == "" || !File.Exists(Get("preset", "")))
            {
                string[] have = new string[0];
                try { have = Directory.GetFiles(Path.Combine(KustomDir, "wallpapers"), "*.klwp"); } catch (Exception) { }
                if (have.Length > 0) Balloon("KLWP Wallpaper", "Right-click the K icon near the clock and pick one of your wallpapers.");
                else Balloon("KLWP Wallpaper", "Right-click the K icon near the clock to choose a wallpaper, or open the editor to make one.");
            }
        }

        // ---------------------------------------------------------------- settings
        string ConfigPath { get { return Path.Combine(DataDir, "config.txt"); } }
        void LoadConfig()
        {
            try
            {
                if (!File.Exists(ConfigPath)) return;
                foreach (string line in File.ReadAllLines(ConfigPath))
                {
                    int i = line.IndexOf('=');
                    if (i > 0) cfg[line.Substring(0, i)] = line.Substring(i + 1);
                }
            }
            catch (Exception) { }
        }
        void SaveConfig()
        {
            try
            {
                List<string> lines = new List<string>();
                foreach (KeyValuePair<string, string> kv in cfg) lines.Add(kv.Key + "=" + kv.Value);
                File.WriteAllLines(ConfigPath, lines.ToArray());
            }
            catch (Exception) { }
        }
        string Get(string k, string d) { string v; return cfg.TryGetValue(k, out v) ? v : d; }
        void Set(string k, string v) { cfg[k] = v; SaveConfig(); }
        int GetInt(string k, int d) { int n; return int.TryParse(Get(k, ""), out n) ? n : d; }

        public void Log(string s)
        {
            try { File.AppendAllText(logPath, DateTime.Now.ToString("HH:mm:ss") + " " + s + "\r\n"); } catch (Exception) { }
        }
        public void Balloon(string title, string text)
        {
            try { tray.ShowBalloonTip(5000, title, text, ToolTipIcon.Info); } catch (Exception) { }
        }

        public Screen TargetScreen()
        {
            Screen[] all = Screen.AllScreens;
            int i = GetInt("monitor", -1);
            if (i >= 0 && i < all.Length) return all[i];
            return Screen.PrimaryScreen;
        }

        // ---------------------------------------------------------------- the Kustom folder
        public string KustomDir
        {
            get
            {
                string d = Get("kustom", "");
                if (d == "") d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kustom");
                try
                {
                    foreach (string sub in new string[] { "wallpapers", "komponents", "fonts", "icons", "bitmaps" }) Directory.CreateDirectory(Path.Combine(d, sub));
                }
                catch (Exception) { }
                return d;
            }
        }
        // the app's own files inside the Kustom folder (the page and a copy of a wallpaper picked from elsewhere)
        public string AppDir
        {
            get
            {
                string d = Path.Combine(KustomDir, ".app");
                try
                {
                    if (!Directory.Exists(d)) Directory.CreateDirectory(d);
                }
                catch (Exception) { }
                return d;
            }
        }

        // both windows share one browser environment and see the Kustom folder as their web origin
        public async Task SetupWeb(WebView2 web, object sender, bool isEditor)
        {
            if (envTask == null) envTask = CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "webview"), null);
            CoreWebView2Environment env = await envTask;
            await web.EnsureCoreWebView2Async(env);
            CoreWebView2 core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            if (!isEditor) core.Settings.AreDefaultContextMenusEnabled = false;
            InstallPlayer();
            core.SetVirtualHostNameToFolderMapping("klwp.wallpaper", KustomDir, CoreWebView2HostResourceAccessKind.Allow);
            core.WebMessageReceived += delegate(object s, CoreWebView2WebMessageReceivedEventArgs e)
            {
                string m = null;
                try { m = e.TryGetWebMessageAsString(); } catch (Exception) { }
                if (m == null) return;
                try { OnPageMessage(m, isEditor); } catch (Exception ex) { Log("message: " + ex.Message); }
            };
        }

        void ScriptTo(bool toEditor, string js)
        {
            if (toEditor) { if (editor != null && !editor.IsDisposed) editor.Script(js); }
            else if (form != null && !form.IsDisposed) form.ScriptAlways(js);
        }

        static string JsonString(string v)
        {
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in v)
            {
                if (c == '"' || c == '\\') { sb.Append('\\'); sb.Append(c); }
                else if (c < 32 || c == '\u2028' || c == '\u2029') sb.Append("\\u" + ((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
            return sb.ToString();
        }

        // every file in the Kustom folder, as JSON for the page
        string ListKustom()
        {
            StringBuilder sb = new StringBuilder("[");
            string root = KustomDir;
            int count = 0;
            DateTime epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            Stack<string> dirs = new Stack<string>();
            dirs.Push(root);
            while (dirs.Count > 0 && count < 8000)
            {
                string dir = dirs.Pop();
                try
                {
                    foreach (string sub in Directory.GetDirectories(dir))
                    {
                        if (Path.GetFileName(sub).StartsWith(".")) continue;
                        dirs.Push(sub);
                    }
                    foreach (string f in Directory.GetFiles(dir))
                    {
                        FileInfo fi = new FileInfo(f);
                        string rel = f.Substring(root.Length).TrimStart('\\', '/').Replace('\\', '/');
                        if (count++ > 0) sb.Append(',');
                        sb.Append("{\"p\":").Append(JsonString(rel)).Append(",\"s\":").Append(fi.Length).Append(",\"m\":").Append((long)(fi.LastWriteTimeUtc - epoch).TotalMilliseconds).Append('}');
                    }
                }
                catch (Exception) { }
            }
            sb.Append(']');
            return sb.ToString();
        }

        void PickKustom()
        {
            using (FolderBrowserDialog d = new FolderBrowserDialog())
            {
                d.Description = "Choose your Kustom folder. Wallpapers go in its \"wallpapers\" folder; fonts, icon sets and images in \"fonts\", \"icons\" and \"bitmaps\".";
                d.SelectedPath = KustomDir;
                d.ShowNewFolderButton = true;
                if (d.ShowDialog() != DialogResult.OK) return;
                Set("kustom", d.SelectedPath);
                Log("kustom folder: " + d.SelectedPath);
                CreateForm();
                if (editor != null && !editor.IsDisposed)
                {
                    try
                    {
                        InstallPlayer();
                        editor.Web.CoreWebView2.SetVirtualHostNameToFolderMapping("klwp.wallpaper", KustomDir, CoreWebView2HostResourceAccessKind.Allow);
                        editor.Navigate();
                    }
                    catch (Exception ex) { Log("remap: " + ex.Message); }
                }
            }
        }

        void SaveFromEditor(string body)
        {
            // "<0|1>|<file name>|<base64>"
            int a = body.IndexOf('|'), b = body.IndexOf('|', a + 1);
            if (a < 0 || b < 0) return;
            bool use = body.Substring(0, a) == "1";
            string name = Path.GetFileName(body.Substring(a + 1, b - a - 1));
            foreach (char c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            if (name == "") name = "Untitled.klwp";
            string sub = name.EndsWith(".komp", StringComparison.OrdinalIgnoreCase) ? "komponents" : "wallpapers";
            string path = Path.Combine(Path.Combine(KustomDir, sub), name);
            try
            {
                File.WriteAllBytes(path, Convert.FromBase64String(body.Substring(b + 1)));
                Log("saved " + path);
                if (use && sub == "wallpapers") { Set("preset", path); presetStamp = DateTime.MinValue; LoadPreset(); }
            }
            catch (Exception ex)
            {
                Log("save: " + ex.Message);
                ScriptTo(true, "KHost.say(" + JsonString("Could not save: " + ex.Message) + ");");
            }
        }

        // ---------------------------------------------------------------- page files
        string EditorPath()
        {
            string a = Path.Combine(ExeDir, "KLWP Desktop Editor.html");
            if (File.Exists(a)) return a;
            string b = Path.Combine(Path.GetDirectoryName(ExeDir) ?? ExeDir, "KLWP Desktop Editor.html");
            return File.Exists(b) ? b : null;
        }
        // the wallpaper page is the editor itself, started in its wallpaper mode
        bool InstallPlayer()
        {
            try
            {
                string src = EditorPath();
                if (src == null) return false;
                File.Copy(src, Path.Combine(AppDir, "player.html"), true);
                return true;
            }
            catch (Exception ex) { Log("player: " + ex.Message); return false; }
        }

        void CreateForm()
        {
            try
            {
                if (form != null && !form.IsDisposed) form.Dispose();
            }
            catch (Exception) { }
            dragging = false;
            pausedSent = false;
            form = new WallpaperForm(this);
            form.Bounds = TargetScreen().Bounds;
            IntPtr h = form.Handle;        // create the window, then move it behind the icons before it is ever shown
            form.AttachToDesktop();
            form.Show();
            form.Place();
            form.InitWeb();
        }

        public void OnPageMessage(string m, bool fromEditor)
        {
            if (m == "list") { ScriptTo(fromEditor, "KHost.onList(" + ListKustom() + ");"); }
            else if (m.StartsWith("save:")) SaveFromEditor(m.Substring(5));
            else if (m == "pickkustom") PickKustom();
            else if (fromEditor) { }
            else if (m == "ready")
            {
                form.Ready = true;
                SendBattery();
                LoadPreset();
            }
            else if (m.StartsWith("loaded:")) Log("page " + m);
            else if (m.StartsWith("error:")) { Log("page " + m); Balloon("KLWP Wallpaper", "Could not load the wallpaper: " + m.Substring(6)); }
            else if (m.StartsWith("music:")) Media(m.Substring(6));
            else if (m.StartsWith("link:"))
            {
                string url = m.Substring(5).Trim();
                if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    try { Process.Start(url); } catch (Exception) { }
                }
            }
        }

        // music touch actions drive whatever is playing on the PC through the media keys
        void Media(string action)
        {
            byte vk = 0;
            if (action.IndexOf("PLAY", StringComparison.Ordinal) >= 0 || action.IndexOf("PAUSE", StringComparison.Ordinal) >= 0) vk = 0xB3;
            else if (action.IndexOf("NEXT", StringComparison.Ordinal) >= 0) vk = 0xB0;
            else if (action.IndexOf("PREV", StringComparison.Ordinal) >= 0) vk = 0xB1;
            else if (action.IndexOf("VOLUME_UP", StringComparison.Ordinal) >= 0) vk = 0xAF;
            else if (action.IndexOf("VOLUME_DOWN", StringComparison.Ordinal) >= 0) vk = 0xAE;
            if (vk == 0) return;
            Native.keybd_event(vk, 0, 0, UIntPtr.Zero);
            Native.keybd_event(vk, 0, 2, UIntPtr.Zero);
        }

        void LoadPreset()
        {
            string src = Get("preset", "");
            if (src == "" || !File.Exists(src) || form == null || !form.Ready) return;
            string url;
            try
            {
                string root = KustomDir.TrimEnd('\\') + "\\";
                if (src.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                {
                    string[] parts = src.Substring(root.Length).Split('\\');
                    for (int i = 0; i < parts.Length; i++) parts[i] = Uri.EscapeDataString(parts[i]);
                    url = "/" + string.Join("/", parts);
                }
                else
                {
                    File.Copy(src, Path.Combine(AppDir, "preset.klwp"), true);
                    url = "/.app/preset.klwp";
                }
                presetStamp = File.GetLastWriteTimeUtc(src);
            }
            catch (Exception ex) { Log("copy preset: " + ex.Message); return; }
            string fit = Get("fit", "fill") == "phone" ? "phone" : "fill";
            form.Script("KWall.fit('" + fit + "');KWall.load('" + url + "?v=" + DateTime.UtcNow.Ticks + "'," + GetInt("pages", 0) + ");");
            Log("load " + src);
        }

        void SendBattery()
        {
            try
            {
                PowerStatus ps = SystemInformation.PowerStatus;
                bool noBattery = (ps.BatteryChargeStatus & BatteryChargeStatus.NoSystemBattery) != 0 || ps.BatteryLifePercent > 1.0f;
                int level = noBattery ? 100 : (int)Math.Round(ps.BatteryLifePercent * 100);
                int plugged = (noBattery || ps.PowerLineStatus == PowerLineStatus.Online) ? 1 : 0;
                int charging = (!noBattery && (ps.BatteryChargeStatus & BatteryChargeStatus.Charging) != 0) ? 1 : 0;
                form.Script("KWall.data({bi:{level:" + level + ",charging:" + charging + ",plugged:" + plugged + ",source:'" + (plugged == 1 ? "AC" : "Battery") + "'}});");
            }
            catch (Exception) { }
        }

        // ---------------------------------------------------------------- housekeeping, once a second
        void Tick()
        {
            tickCount++;
            try
            {
                if (openEvt != null && openEvt.WaitOne(0)) OpenEditor();
                // Explorer restarting takes the desktop layer (and our window) with it: start again
                if (form == null || form.IsDisposed || !Native.IsWindow(form.Handle) || !Native.IsWindow(form.DesktopLayer))
                {
                    Log("window lost, recreating");
                    CreateForm();
                    return;
                }
                form.Place();
                // rest while something maximised or fullscreen hides the desktop on that monitor
                bool cov = IsCovered();
                if (cov != covered) { covered = cov; }
                bool want = userPaused || covered;
                if (want != pausedSent && form.Ready) { pausedSent = want; form.Script("KWall.pause(" + (want ? "true" : "false") + ");"); }
                // pick up a re-exported preset
                string src = Get("preset", "");
                if (form.Ready && src != "" && File.Exists(src) && File.GetLastWriteTimeUtc(src) != presetStamp && tickCount % 2 == 0) LoadPreset();
                if (tickCount % 30 == 0) SendBattery();
            }
            catch (Exception ex) { Log("tick: " + ex.Message); }
        }

        bool IsDesktopClass(string c) { return c == "Progman" || c == "WorkerW" || c == "SHELLDLL_DefView" || c == "SysListView32" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd"; }

        bool IsCovered()
        {
            IntPtr fg = Native.GetForegroundWindow();
            if (fg == IntPtr.Zero || fg == form.Handle || Native.IsIconic(fg)) return false;
            if (IsDesktopClass(Native.ClassOf(fg))) return false;
            Screen target = TargetScreen();
            if (Screen.FromHandle(fg).DeviceName != target.DeviceName) return false;
            if (Native.IsZoomed(fg)) return true;
            Native.RECT r;
            if (!Native.GetWindowRect(fg, out r)) return false;
            Rectangle b = target.Bounds;
            return r.Left <= b.Left && r.Top <= b.Top && r.Right >= b.Right && r.Bottom >= b.Bottom;
        }

        // ---------------------------------------------------------------- mouse: the desktop gets the clicks, so pass them on
        bool OnDesktop(Native.POINT pt)
        {
            IntPtr h = Native.WindowFromPoint(pt);
            if (h == IntPtr.Zero) return false;
            if (h == form.Handle || Native.IsChild(form.Handle, h)) return true;
            string c = Native.ClassOf(h);
            if (c == "SysListView32") return Native.ClassOf(Native.GetParent(h)) == "SHELLDLL_DefView";
            return c == "WorkerW" || c == "Progman" || c == "SHELLDLL_DefView";
        }

        IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam)
        {
            try
            {
                if (nCode >= 0 && form != null && form.Ready && !form.IsDisposed && !userPaused)
                {
                    int msg = wParam.ToInt32();
                    if (msg == 0x0201 || msg == 0x0202 || msg == 0x020A || (msg == 0x0200 && dragging))
                    {
                        Native.MSLLHOOKSTRUCT d = (Native.MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(Native.MSLLHOOKSTRUCT));
                        Native.RECT r;
                        Native.GetWindowRect(form.Handle, out r);
                        int x = d.pt.X - r.Left, y = d.pt.Y - r.Top;
                        bool inside = d.pt.X >= r.Left && d.pt.X < r.Right && d.pt.Y >= r.Top && d.pt.Y < r.Bottom;
                        if (msg == 0x0201)
                        {
                            if (inside && OnDesktop(d.pt)) { dragging = true; form.Script("KWall.ptr('down'," + x + "," + y + ");"); }
                        }
                        else if (msg == 0x0200)
                        {
                            int now = Environment.TickCount;
                            if (now - lastMoveTick >= 8) { lastMoveTick = now; form.Script("KWall.ptr('move'," + x + "," + y + ");"); }
                        }
                        else if (msg == 0x0202)
                        {
                            if (dragging) { dragging = false; form.Script("KWall.ptr('move'," + x + "," + y + ");KWall.ptr('up'," + x + "," + y + ");"); }
                        }
                        else if (msg == 0x020A)
                        {
                            if (inside && OnDesktop(d.pt))
                            {
                                int delta = (short)((d.mouseData >> 16) & 0xFFFF);
                                form.Script("KWall.wheel(" + (-delta) + ");");
                            }
                        }
                    }
                }
            }
            catch (Exception) { }
            return Native.CallNextHookEx(hook, nCode, wParam, lParam);
        }

        // ---------------------------------------------------------------- tray menu
        ToolStripMenuItem Item(string text, EventHandler click, bool check)
        {
            ToolStripMenuItem it = new ToolStripMenuItem(text);
            it.Checked = check;
            if (click != null) it.Click += click;
            return it;
        }

        void BuildMenu()
        {
            ContextMenuStrip m = tray.ContextMenuStrip;
            m.Items.Clear();
            string cur = Get("preset", "");
            ToolStripMenuItem head = new ToolStripMenuItem(cur == "" ? "No wallpaper chosen" : Path.GetFileName(cur));
            head.Enabled = false;
            m.Items.Add(head);
            ToolStripMenuItem walls = new ToolStripMenuItem("Wallpapers");
            try
            {
                List<FileInfo> files = new List<FileInfo>();
                foreach (string f in Directory.GetFiles(Path.Combine(KustomDir, "wallpapers"), "*.klwp")) files.Add(new FileInfo(f));
                files.Sort(delegate(FileInfo x, FileInfo y) { return y.LastWriteTimeUtc.CompareTo(x.LastWriteTimeUtc); });
                int shown = 0;
                foreach (FileInfo fi in files)
                {
                    if (shown++ >= 30) break;
                    string full = fi.FullName;
                    walls.DropDownItems.Add(Item(Path.GetFileNameWithoutExtension(fi.Name), delegate { Set("preset", full); presetStamp = DateTime.MinValue; LoadPreset(); }, string.Equals(full, cur, StringComparison.OrdinalIgnoreCase)));
                }
                if (files.Count == 0) { ToolStripMenuItem none = new ToolStripMenuItem("(nothing in the Kustom folder yet)"); none.Enabled = false; walls.DropDownItems.Add(none); }
            }
            catch (Exception) { }
            walls.DropDownItems.Add(new ToolStripSeparator());
            walls.DropDownItems.Add(Item("Browse for a file...", delegate { ChooseWallpaper(); }, false));
            m.Items.Add(walls);
            m.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem pages = new ToolStripMenuItem("Pages");
            int pg = GetInt("pages", 0);
            pages.DropDownItems.Add(Item("Automatic (from the preset)", delegate { Set("pages", "0"); LoadPreset(); }, pg == 0));
            for (int i = 1; i <= 9; i++)
            {
                int n = i;
                pages.DropDownItems.Add(Item(n.ToString(), delegate { Set("pages", n.ToString()); LoadPreset(); }, pg == n));
            }
            m.Items.Add(pages);

            ToolStripMenuItem layout = new ToolStripMenuItem("Layout");
            bool phone = Get("fit", "fill") == "phone";
            layout.DropDownItems.Add(Item("Fill the screen", delegate { Set("fit", "fill"); if (form != null) form.Script("KWall.fit('fill');"); }, !phone));
            layout.DropDownItems.Add(Item("Phone shape, centered", delegate { Set("fit", "phone"); if (form != null) form.Script("KWall.fit('phone');"); }, phone));
            m.Items.Add(layout);

            Screen[] all = Screen.AllScreens;
            if (all.Length > 1)
            {
                ToolStripMenuItem mon = new ToolStripMenuItem("Monitor");
                Screen target = TargetScreen();
                for (int i = 0; i < all.Length; i++)
                {
                    int n = i;
                    Screen s = all[i];
                    mon.DropDownItems.Add(Item((i + 1) + ": " + s.Bounds.Width + " x " + s.Bounds.Height + (s.Primary ? " (main)" : ""), delegate { Set("monitor", n.ToString()); if (form != null && !form.IsDisposed) form.Place(); }, s.DeviceName == target.DeviceName));
                }
                m.Items.Add(mon);
            }

            m.Items.Add(new ToolStripSeparator());
            m.Items.Add(Item("Pause", delegate { userPaused = !userPaused; Set("paused", userPaused ? "1" : "0"); }, userPaused));
            m.Items.Add(Item("Reload", delegate { CreateForm(); }, false));
            m.Items.Add(new ToolStripSeparator());
            m.Items.Add(Item("Open the editor", delegate { OpenEditor(); }, false));
            ToolStripMenuItem kf = new ToolStripMenuItem("Kustom folder");
            ToolStripMenuItem kpath = new ToolStripMenuItem(KustomDir); kpath.Enabled = false;
            kf.DropDownItems.Add(kpath);
            kf.DropDownItems.Add(Item("Open in Explorer", delegate { try { Process.Start("explorer.exe", "\"" + KustomDir + "\""); } catch (Exception) { } }, false));
            kf.DropDownItems.Add(Item("Change...", delegate { PickKustom(); }, false));
            m.Items.Add(kf);
            m.Items.Add(Item("Start with Windows", delegate { ToggleStartup(); }, StartupOn()));
            m.Items.Add(new ToolStripSeparator());
            m.Items.Add(Item("Exit", delegate { Quit(); }, false));
        }

        void ChooseWallpaper()
        {
            using (OpenFileDialog d = new OpenFileDialog())
            {
                d.Title = "Choose a KLWP wallpaper";
                d.Filter = "KLWP presets (*.klwp)|*.klwp|All files (*.*)|*.*";
                string cur = Get("preset", "");
                try { d.InitialDirectory = Path.Combine(KustomDir, "wallpapers"); } catch (Exception) { }
                if (d.ShowDialog() == DialogResult.OK)
                {
                    Set("preset", d.FileName);
                    presetStamp = DateTime.MinValue;
                    LoadPreset();
                }
            }
        }

        void OpenEditor()
        {
            if (EditorPath() == null) { Balloon("KLWP Wallpaper", "The editor file was not found next to the app."); return; }
            if (editor != null && !editor.IsDisposed)
            {
                if (editor.WindowState == FormWindowState.Minimized) editor.WindowState = FormWindowState.Normal;
                editor.Activate();
                return;
            }
            editor = new EditorForm(this);
            editor.FormClosed += delegate { editor = null; };
            editor.Show();
            editor.Activate();
            editor.InitWeb();
        }

        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        bool StartupOn()
        {
            try { using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey)) { return k != null && k.GetValue("KLWPWallpaper") != null; } }
            catch (Exception) { return false; }
        }
        void ToggleStartup()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey, true))
                {
                    if (k == null) return;
                    if (k.GetValue("KLWPWallpaper") != null) k.DeleteValue("KLWPWallpaper", false);
                    else k.SetValue("KLWPWallpaper", "\"" + Application.ExecutablePath + "\"");
                }
            }
            catch (Exception ex) { Log("startup: " + ex.Message); }
        }

        void Quit()
        {
            try { timer.Stop(); } catch (Exception) { }
            try { if (hook != IntPtr.Zero) Native.UnhookWindowsHookEx(hook); } catch (Exception) { }
            try { if (editor != null && !editor.IsDisposed) editor.Dispose(); } catch (Exception) { }
            try { if (form != null && !form.IsDisposed) form.Dispose(); } catch (Exception) { }
            try { Native.SystemParametersInfo(20, 0, null, 0); } catch (Exception) { }   // repaint the normal wallpaper
            tray.Visible = false;
            ExitThread();
        }

        public static Icon MakeIcon()
        {
            using (Bitmap bmp = new Bitmap(32, 32))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    using (SolidBrush b = new SolidBrush(Color.FromArgb(255, 255, 64, 129))) g.FillEllipse(b, 1, 1, 30, 30);
                    using (Font f = new Font("Segoe UI", 15, FontStyle.Bold, GraphicsUnit.Pixel))
                    using (StringFormat sf = new StringFormat())
                    {
                        sf.Alignment = StringAlignment.Center;
                        sf.LineAlignment = StringAlignment.Center;
                        g.DrawString("K", f, Brushes.White, new RectangleF(0, 0, 32, 33), sf);
                    }
                }
                IntPtr h = bmp.GetHicon();
                Icon ic = (Icon)Icon.FromHandle(h).Clone();
                Native.DestroyIcon(h);
                return ic;
            }
        }
    }
}
