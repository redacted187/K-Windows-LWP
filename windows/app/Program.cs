// Entry point. Written for the C# 5 compiler that ships with Windows (.NET Framework 4.x csc.exe),
// so no newer language features are used anywhere in this project.
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
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            // editor first: starting the app opens the editor; Windows' startup entry passes --background
            bool wantEditor = true, uninstall = false;
            foreach (string a in args)
            {
                if (a == "--background") wantEditor = false;
                if (a == "--uninstall") uninstall = true;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (uninstall) { Uninstaller.Run(); return; }
            bool created, evtCreated;
            System.Threading.EventWaitHandle evt = new System.Threading.EventWaitHandle(false, System.Threading.EventResetMode.AutoReset, "KLWPWallpaperOpenEditor", out evtCreated);
            System.Threading.Mutex mutex = new System.Threading.Mutex(true, "KLWPWallpaperHostSingleInstance", out created);
            if (!created)
            {
                // already running: ask that copy to bring up the editor
                evt.Set();
                return;
            }
            Application.ThreadException += delegate(object s, System.Threading.ThreadExceptionEventArgs e)
            {
                try { File.AppendAllText(Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KLWPWallpaper"), "log.txt"), "EXCEPTION " + e.Exception + "\r\n"); } catch (Exception) { }
            };
            Application.Run(new App(wantEditor, evt));
            GC.KeepAlive(mutex);
        }
    }
}
