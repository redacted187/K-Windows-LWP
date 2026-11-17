// The KLWP editor in its own window (the same page as the wallpaper, without wallpaper mode).
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

        public EditorForm(App owner)
        {
            app = owner;
            Text = "KLWP Editor";
            StartPosition = FormStartPosition.CenterScreen;
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            Size = new Size(Math.Min(wa.Width - 80, Math.Max(1100, wa.Width * 3 / 4)), Math.Min(wa.Height - 60, Math.Max(700, wa.Height * 5 / 6)));
            BackColor = Color.FromArgb(14, 15, 17);
            try { Icon = app.AppIcon; } catch (Exception) { }
            Web = new WebView2();
            Web.Dock = DockStyle.Fill;
            Web.DefaultBackgroundColor = Color.FromArgb(14, 15, 17);
            Controls.Add(Web);
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
            if (Web.CoreWebView2 != null) Web.CoreWebView2.Navigate(App.Origin + "/.app/player.html?v=" + DateTime.UtcNow.Ticks);
        }

        public void Script(string js)
        {
            if (IsDisposed || Web == null || Web.CoreWebView2 == null) return;
            try { Web.CoreWebView2.ExecuteScriptAsync(js); } catch (Exception ex) { app.Log("editor script: " + ex.Message); }
        }
    }
}
