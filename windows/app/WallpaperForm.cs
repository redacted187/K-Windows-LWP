// The borderless window that shows the wallpaper. It is parented into the desktop's own
// window layer so it draws behind the icons, like other live-wallpaper apps do.
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
    class WallpaperForm : Form
    {
        public WebView2 Web;
        public bool Ready;          // the page reported it is up
        public bool Attached;
        public IntPtr DesktopLayer = IntPtr.Zero;   // the window we were placed inside
        readonly App app;

        public WallpaperForm(App owner)
        {
            app = owner;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.Black;
            Text = "KLWP Wallpaper";
            Web = new WebView2();
            Web.Dock = DockStyle.Fill;
            Web.DefaultBackgroundColor = Color.Black;
            Controls.Add(Web);
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x00000080;   // WS_EX_TOOLWINDOW: keep out of Alt+Tab
                cp.ExStyle |= 0x08000000;   // WS_EX_NOACTIVATE
                return cp;
            }
        }

        // put the window under the desktop icons (the "WorkerW" trick used by live wallpaper apps)
        public void AttachToDesktop()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            IntPtr res;
            Native.SendMessageTimeout(progman, 0x052C, new IntPtr(0xD), new IntPtr(0x1), 0, 1000, out res);
            IntPtr workerw = IntPtr.Zero;
            Native.EnumWindows(delegate(IntPtr top, IntPtr lp)
            {
                IntPtr view = Native.FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (view != IntPtr.Zero)
                {
                    IntPtr w = Native.FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                    if (w != IntPtr.Zero) workerw = w;
                }
                return true;
            }, IntPtr.Zero);
            if (workerw == IntPtr.Zero) workerw = Native.FindWindowEx(progman, IntPtr.Zero, "WorkerW", null);   // Windows 11 24H2 layout
            if (workerw == IntPtr.Zero) workerw = progman;
            app.Log("attach: progman=" + progman + " workerw=" + workerw + " class=" + Native.ClassOf(workerw));
            Native.SetParent(Handle, workerw);
            DesktopLayer = workerw;
            Attached = true;
            Place();
        }

        // cover the chosen monitor exactly (coordinates are relative to the desktop layer we are parented to)
        public void Place()
        {
            Rectangle b = app.TargetScreen().Bounds;
            IntPtr parent = DesktopLayer;
            Native.POINT p = new Native.POINT();
            p.X = b.X; p.Y = b.Y;
            if (parent != IntPtr.Zero) Native.ScreenToClient(parent, ref p);
            Native.RECT r;
            Native.GetWindowRect(Handle, out r);
            if (r.Left != b.Left || r.Top != b.Top || r.Right != b.Right || r.Bottom != b.Bottom)
                Native.MoveWindow(Handle, p.X, p.Y, b.Width, b.Height, true);
        }

        public async void InitWeb()
        {
            try
            {
                await app.SetupWeb(Web, this, false);
                Web.CoreWebView2.Navigate(App.Origin + "/.app/player.html?wallpaper=1&v=" + DateTime.UtcNow.Ticks);
            }
            catch (Exception ex)
            {
                app.Log("webview: " + ex);
                app.Balloon("KLWP Wallpaper could not start", "The Microsoft Edge WebView2 runtime is needed. " + ex.Message);
            }
        }

        public void ScriptAlways(string js)
        {
            if (IsDisposed || Web == null || Web.CoreWebView2 == null) return;
            try { Web.CoreWebView2.ExecuteScriptAsync(js); } catch (Exception ex) { app.Log("script: " + ex.Message); }
        }

        public void Script(string js)
        {
            if (!Ready || Web == null || Web.CoreWebView2 == null) return;
            try { Web.CoreWebView2.ExecuteScriptAsync(js); } catch (Exception ex) { app.Log("script: " + ex.Message); }
        }
    }
}
