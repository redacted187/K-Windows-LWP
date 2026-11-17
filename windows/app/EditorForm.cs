// The KLWP editor in its own window (the same page as the wallpaper, without wallpaper mode).
// It looks and behaves like a native app: the page draws the title bar (the app bar doubles as one, with
// minimise / maximise / close at the right), Windows still provides the frame, shadow, snapping and resizing.
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
    class EditorForm : Form
    {
        public WebView2 Web;
        readonly App app;
        bool lastMax;

        public EditorForm(App owner)
        {
            app = owner;
            Text = "KLWP Editor";
            StartPosition = FormStartPosition.CenterScreen;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(wa.Width - 80, Math.Max(1100, wa.Width * 3 / 4)), Math.Min(wa.Height - 60, Math.Max(700, wa.Height * 5 / 6)));
            MinimumSize = new Size(760, 480);
            BackColor = Color.FromArgb(22, 23, 26);
            try { Icon = app.AppIcon; } catch (Exception) { }
            Web = new WebView2();
            Web.Dock = DockStyle.Fill;
            Web.DefaultBackgroundColor = Color.FromArgb(14, 15, 17);
            Controls.Add(Web);
            Resize += delegate { SendState(); };
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int on = 1;
                Native.DwmSetWindowAttribute(Handle, 20, ref on, 4);    // dark window frame (DWMWA_USE_IMMERSIVE_DARK_MODE)
                int round = 2;
                Native.DwmSetWindowAttribute(Handle, 33, ref round, 4); // rounded corners on Windows 11 (DWMWA_WINDOW_CORNER_PREFERENCE)
            }
            catch (Exception) { }
            // make Windows ask for the frame size again, now without a caption
            Native.SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0020 | 0x0002 | 0x0001 | 0x0004 | 0x0010);
        }

        protected override void WndProc(ref Message m)
        {
            // WM_NCCALCSIZE: keep Windows' own resize borders on the left, right and bottom, drop the caption
            if (m.Msg == 0x0083 && m.WParam != IntPtr.Zero)
            {
                Native.RECT before = (Native.RECT)Marshal.PtrToStructure(m.LParam, typeof(Native.RECT));
                base.WndProc(ref m);
                Native.RECT after = (Native.RECT)Marshal.PtrToStructure(m.LParam, typeof(Native.RECT));
                int frame = after.Left - before.Left;
                after.Top = before.Top + (Native.IsZoomed(Handle) ? frame : 0);   // maximised windows hang over the screen edge by the frame
                Marshal.StructureToPtr(after, m.LParam, false);
                m.Result = IntPtr.Zero;
                return;
            }
            base.WndProc(ref m);
        }

        // messages from the page's title bar
        public void WindowCommand(string c)
        {
            if (c == "min") WindowState = FormWindowState.Minimized;
            else if (c == "max") WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
            else if (c == "close") Close();
            else if (c == "drag" || c == "size:top")
            {
                if (c == "size:top" && WindowState == FormWindowState.Maximized) return;
                Native.ReleaseCapture();
                Native.SendMessage(Handle, 0x00A1, new IntPtr(c == "drag" ? 2 : 12), IntPtr.Zero);   // WM_NCLBUTTONDOWN, HTCAPTION / HTTOP
            }
            else if (c == "hello") { lastMax = !(WindowState == FormWindowState.Maximized); SendState(); }
        }

        void SendState()
        {
            bool mx = WindowState == FormWindowState.Maximized;
            if (mx == lastMax) return;
            lastMax = mx;
            Script("window.KHost&&KHost.win&&KHost.win({max:" + (mx ? "true" : "false") + "});");
        }

        public async void InitWeb()
        {
            try
            {
                await app.SetupWeb(Web, this, true);
                Navigate();
            }
            catch (Exception ex)
            {
                app.Log("editor webview: " + ex);
                MessageBox.Show(this, "The editor could not start: " + ex.Message, "KLWP Editor");
            }
        }

        public void Navigate()
        {
            if (Web.CoreWebView2 != null) Web.CoreWebView2.Navigate(App.Origin + "/.app/player.html?" + app.EditorQuery() + "&v=" + DateTime.UtcNow.Ticks);
        }

        public void Script(string js)
        {
            if (IsDisposed || Web == null || Web.CoreWebView2 == null) return;
            try { Web.CoreWebView2.ExecuteScriptAsync(js); } catch (Exception ex) { app.Log("editor script: " + ex.Message); }
        }
    }
}
