// Installer for KLWP Wallpaper: a per-user install (no administrator rights needed).
// The app's files are embedded in this program as resources by build.bat.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace KlwpWallpaperSetup
{
    class SetupForm : Form
    {
        TextBox kustomBox;
        CheckBox startBox, deskBox, runBox;
        Button installBtn;
        Label status;

        // resource name -> file name written into the install folder
        static readonly string[][] Payload = new string[][] {
            new string[] { "app.exe", "KLWPWallpaper.exe" },
            new string[] { "wv2core.dll", "Microsoft.Web.WebView2.Core.dll" },
            new string[] { "wv2forms.dll", "Microsoft.Web.WebView2.WinForms.dll" },
            new string[] { "wv2loader.dll", "WebView2Loader.dll" },
            new string[] { "editor.html", "KLWP Desktop Editor.html" }
        };

        static string InstallDir { get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"), "KLWP Wallpaper"); } }
        static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KLWPWallpaper"); } }
        static string ConfigPath { get { return Path.Combine(DataDir, "config.txt"); } }

        static Dictionary<string, string> ReadConfig()
        {
            Dictionary<string, string> cfg = new Dictionary<string, string>();
            try
            {
                if (File.Exists(ConfigPath))
                    foreach (string line in File.ReadAllLines(ConfigPath))
                    {
                        int i = line.IndexOf('=');
                        if (i > 0) cfg[line.Substring(0, i)] = line.Substring(i + 1);
                    }
            }
            catch (Exception) { }
            return cfg;
        }

        public SetupForm()
        {
            Text = "KLWP Wallpaper Setup";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(560, 370);
            Font = new Font("Segoe UI", 9f);
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

            Label title = new Label();
            title.Text = "KLWP Wallpaper";
            title.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            title.SetBounds(20, 16, 520, 34);
            Controls.Add(title);

            Label sub = new Label();
            sub.Text = "Live KLWP wallpapers on your desktop, plus the KLWP Editor as its own app.\nInstalls for your Windows account only.";
            sub.SetBounds(22, 54, 520, 36);
            Controls.Add(sub);

            Label kl = new Label();
            kl.Text = "Kustom folder (wallpapers, komponents, fonts, icon sets and images):";
            kl.SetBounds(22, 104, 520, 18);
            Controls.Add(kl);

            Dictionary<string, string> cfg = ReadConfig();
            string def;
            if (!cfg.TryGetValue("kustom", out def) || def == "") def = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Kustom");

            kustomBox = new TextBox();
            kustomBox.Text = def;
            kustomBox.SetBounds(22, 126, 420, 24);
            Controls.Add(kustomBox);

            Button browse = new Button();
            browse.Text = "Browse...";
            browse.SetBounds(450, 124, 88, 27);
            browse.Click += delegate
            {
                using (FolderBrowserDialog d = new FolderBrowserDialog())
                {
                    d.Description = "Choose the Kustom folder. You can copy the Kustom folder from your phone here.";
                    d.ShowNewFolderButton = true;
                    try { if (Directory.Exists(kustomBox.Text)) d.SelectedPath = kustomBox.Text; } catch (Exception) { }
                    if (d.ShowDialog(this) == DialogResult.OK) kustomBox.Text = d.SelectedPath;
                }
            };
            Controls.Add(browse);

            Label hint = new Label();
            hint.Text = "The wallpaper and the editor both use this folder. You can change it later from the tray icon.";
            hint.ForeColor = SystemColors.GrayText;
            hint.SetBounds(22, 154, 520, 18);
            Controls.Add(hint);

            startBox = new CheckBox();
            startBox.Text = "Start the wallpaper when I sign in to Windows";
            startBox.Checked = true;
            startBox.SetBounds(24, 190, 500, 22);
            Controls.Add(startBox);

            deskBox = new CheckBox();
            deskBox.Text = "Put a KLWP Editor shortcut on the desktop";
            deskBox.Checked = true;
            deskBox.SetBounds(24, 216, 500, 22);
            Controls.Add(deskBox);

            runBox = new CheckBox();
            runBox.Text = "Start KLWP Wallpaper when setup finishes";
            runBox.Checked = true;
            runBox.SetBounds(24, 242, 500, 22);
            Controls.Add(runBox);

            status = new Label();
            status.Text = "Installs to " + InstallDir;
            status.ForeColor = SystemColors.GrayText;
            status.SetBounds(22, 284, 520, 36);
            Controls.Add(status);

            installBtn = new Button();
            installBtn.Text = "Install";
            installBtn.SetBounds(356, 326, 88, 30);
            installBtn.Click += delegate { Install(); };
            Controls.Add(installBtn);
            AcceptButton = installBtn;

            Button cancel = new Button();
            cancel.Text = "Cancel";
            cancel.SetBounds(450, 326, 88, 30);
            cancel.Click += delegate { Close(); };
            Controls.Add(cancel);
        }

        static void Shortcut(string lnkPath, string target, string arguments, string description)
        {
            // WScript.Shell through late binding, so no extra references are needed
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(t);
            object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnkPath });
            Type lt = lnk.GetType();
            lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { target });
            lt.InvokeMember("Arguments", BindingFlags.SetProperty, null, lnk, new object[] { arguments });
            lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { Path.GetDirectoryName(target) });
            lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { description });
            lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { target + ",0" });
            lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, new object[0]);
        }

        void Install()
        {
            installBtn.Enabled = false;
            Cursor = Cursors.WaitCursor;
            try
            {
                string kustom = kustomBox.Text.Trim();
                if (kustom == "") throw new Exception("Please choose a Kustom folder.");
                kustom = Path.GetFullPath(Environment.ExpandEnvironmentVariables(kustom));

                // stop a running copy so its files can be replaced
                foreach (Process p in Process.GetProcessesByName("KLWPWallpaper"))
                {
                    try { p.Kill(); p.WaitForExit(5000); } catch (Exception) { }
                }

                string dir = InstallDir;
                Directory.CreateDirectory(dir);
                Assembly asm = Assembly.GetExecutingAssembly();
                foreach (string[] item in Payload)
                {
                    using (Stream src = asm.GetManifestResourceStream(item[0]))
                    {
                        if (src == null) throw new Exception("The installer is missing " + item[1] + ".");
                        string dst = Path.Combine(dir, item[1]);
                        for (int attempt = 0; ; attempt++)
                        {
                            try
                            {
                                using (FileStream fs = new FileStream(dst, FileMode.Create, FileAccess.Write)) { src.Position = 0; src.CopyTo(fs); }
                                break;
                            }
                            catch (IOException)
                            {
                                if (attempt >= 10) throw;
                                System.Threading.Thread.Sleep(300);
                            }
                        }
                    }
                }

                foreach (string sub in new string[] { "wallpapers", "komponents", "fonts", "icons", "bitmaps" }) Directory.CreateDirectory(Path.Combine(kustom, sub));

                Directory.CreateDirectory(DataDir);
                Dictionary<string, string> cfg = ReadConfig();
                cfg["kustom"] = kustom;
                List<string> lines = new List<string>();
                foreach (KeyValuePair<string, string> kv in cfg) lines.Add(kv.Key + "=" + kv.Value);
                File.WriteAllLines(ConfigPath, lines.ToArray());

                string exe = Path.Combine(dir, "KLWPWallpaper.exe");
                string programs = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                Shortcut(Path.Combine(programs, "KLWP Wallpaper.lnk"), exe, "", "Live KLWP wallpaper for the desktop");
                Shortcut(Path.Combine(programs, "KLWP Editor.lnk"), exe, "--editor", "Make and edit KLWP wallpapers");
                string deskLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "KLWP Editor.lnk");
                if (deskBox.Checked) Shortcut(deskLnk, exe, "--editor", "Make and edit KLWP wallpapers");

                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\KLWPWallpaper"))
                {
                    k.SetValue("DisplayName", "KLWP Wallpaper");
                    k.SetValue("DisplayVersion", "1.0");
                    k.SetValue("Publisher", "KLWP Desktop Editor");
                    k.SetValue("DisplayIcon", exe);
                    k.SetValue("InstallLocation", dir);
                    k.SetValue("UninstallString", "\"" + exe + "\" --uninstall");
                    k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                }
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
                {
                    if (startBox.Checked) k.SetValue("KLWPWallpaper", "\"" + exe + "\"");
                    else k.DeleteValue("KLWPWallpaper", false);
                }

                if (runBox.Checked)
                {
                    ProcessStartInfo si = new ProcessStartInfo(exe);
                    si.WorkingDirectory = dir;
                    Process.Start(si);
                }
                Cursor = Cursors.Default;
                MessageBox.Show(this, "KLWP Wallpaper is installed.\n\n- The pink K icon near the clock controls the wallpaper.\n- \"KLWP Editor\" is in the Start menu.\n- Your Kustom folder: " + kustom + "\n\nTo remove it later, use Windows Settings > Apps.", "KLWP Wallpaper Setup", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch (Exception ex)
            {
                Cursor = Cursors.Default;
                installBtn.Enabled = true;
                MessageBox.Show(this, "Setup could not finish:\n\n" + ex.Message, "KLWP Wallpaper Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
