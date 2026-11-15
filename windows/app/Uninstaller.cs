// Removes the per-user install. Started by Windows as "KLWPWallpaper.exe --uninstall".
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
    static class Uninstaller
    {
        public const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\KLWPWallpaper";
        public static string InstallDir { get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), "KLWP Wallpaper"); } }

        public static void Run()
        {
            if (MessageBox.Show("Remove KLWP Wallpaper and the KLWP Editor from this PC?\n\nYour Kustom folder and its wallpapers are kept.", "KLWP Wallpaper", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            int me = Process.GetCurrentProcess().Id;
            foreach (Process p in Process.GetProcessesByName("KLWPWallpaper"))
            {
                try { if (p.Id != me) { p.Kill(); p.WaitForExit(4000); } } catch (Exception) { }
            }
            try { Native.SystemParametersInfo(20, 0, null, 0); } catch (Exception) { }
            string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            foreach (string f in new string[] { Path.Combine(programs, "KLWP Wallpaper.lnk"), Path.Combine(programs, "KLWP Editor.lnk"), Path.Combine(desktop, "KLWP Editor.lnk") })
            {
                try { if (File.Exists(f)) File.Delete(f); } catch (Exception) { }
            }
            try { using (RegistryKey k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) { if (k != null) k.DeleteValue("KLWPWallpaper", false); } } catch (Exception) { }
            try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch (Exception) { }
            string exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            // only ever remove the folder the installer created
            if (string.Equals(exeDir.TrimEnd('\\'), InstallDir, StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    ProcessStartInfo si = new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q \"" + InstallDir + "\"");
                    si.WindowStyle = ProcessWindowStyle.Hidden;
                    si.CreateNoWindow = true;
                    si.WorkingDirectory = Path.GetTempPath();
                    Process.Start(si);
                }
                catch (Exception) { }
            }
            MessageBox.Show("KLWP Wallpaper was removed. Your Kustom folder was left in place.", "KLWP Wallpaper");
        }
    }
}
