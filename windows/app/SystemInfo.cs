// This PC's own data for the KLWP functions, in the shape the page expects (see live.js):
//   rm(...) processor, memory and storage     si(...) screen, dark mode, accent colour, model, uptime, volume
//   nc(...) Wi-Fi / network                    ts(...) bytes sent and received
// Everything is read without administrator rights; anything that cannot be read is simply left out.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace KlwpWallpaper
{
    static class SystemInfo
    {
        [StructLayout(LayoutKind.Sequential)]
        struct MEMORYSTATUSEX
        {
            public uint dwLength; public uint dwMemoryLoad;
            public ulong ullTotalPhys; public ulong ullAvailPhys;
            public ulong ullTotalPageFile; public ulong ullAvailPageFile;
            public ulong ullTotalVirtual; public ulong ullAvailVirtual; public ulong ullAvailExtendedVirtual;
        }
        [DllImport("kernel32.dll")] static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX m);
        [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
        [DllImport("kernel32.dll")] static extern ulong GetTickCount64();

        static long lastIdle, lastKernel, lastUser;
        static string wifiCache = "";
        static DateTime wifiAt = DateTime.MinValue;

        static string Num(double v) { return v.ToString("0.##", CultureInfo.InvariantCulture); }
        static void Add(StringBuilder sb, string k, string jsonValue)
        {
            if (sb.Length > 1) sb.Append(',');
            sb.Append('"').Append(k).Append("\":").Append(jsonValue);
        }

        // ---------------------------------------------------------------- rm(...)
        public static string Resources()
        {
            StringBuilder sb = new StringBuilder("{");
            try
            {
                long idle, kernel, user;
                if (GetSystemTimes(out idle, out kernel, out user))
                {
                    long di = idle - lastIdle, dk = kernel - lastKernel, du = user - lastUser;   // kernel time includes idle time
                    long total = dk + du;
                    if (lastKernel != 0 && total > 0)
                    {
                        Add(sb, "cidle", Num(Math.Round(100.0 * di / total)));
                        Add(sb, "cused", Num(Math.Round(100.0 * (total - di) / total)));
                        Add(sb, "csys", Num(Math.Round(100.0 * Math.Max(0, dk - di) / total)));
                        Add(sb, "cusr", Num(Math.Round(100.0 * du / total)));
                    }
                    lastIdle = idle; lastKernel = kernel; lastUser = user;
                }
            }
            catch (Exception) { }
            try
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
                {
                    object mhz = k == null ? null : k.GetValue("~MHz");
                    if (mhz != null) { Add(sb, "fcur", mhz.ToString()); Add(sb, "fmax", mhz.ToString()); Add(sb, "fmin", "0"); }
                }
            }
            catch (Exception) { }
            try
            {
                MEMORYSTATUSEX m = new MEMORYSTATUSEX();
                m.dwLength = (uint)Marshal.SizeOf(typeof(MEMORYSTATUSEX));
                if (GlobalMemoryStatusEx(ref m))
                {
                    double tot = m.ullTotalPhys / 1048576.0, free = m.ullAvailPhys / 1048576.0;
                    Add(sb, "mtot", Num(Math.Round(tot)));
                    Add(sb, "mfree", Num(Math.Round(free)));
                    Add(sb, "mused", Num(Math.Round(tot - free)));
                }
            }
            catch (Exception) { }
            try
            {
                DriveInfo d = new DriveInfo(Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.Windows)));
                double tot = d.TotalSize / 1048576.0, free = d.AvailableFreeSpace / 1048576.0;
                Add(sb, "fstot", Num(Math.Round(tot)));
                Add(sb, "fsfree", Num(Math.Round(free)));
                Add(sb, "fsused", Num(Math.Round(tot - free)));
            }
            catch (Exception) { }
            sb.Append('}');
            return sb.ToString();
        }

        // ---------------------------------------------------------------- si(...)
        static object Reg(RegistryKey root, string path, string name)
        {
            try { using (RegistryKey k = root.OpenSubKey(path)) { return k == null ? null : k.GetValue(name); } }
            catch (Exception) { return null; }
        }
        public static string SystemData(Screen screen)
        {
            StringBuilder sb = new StringBuilder("{");
            try
            {
                object light = Reg(Registry.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme");
                if (light is int) Add(sb, "darkmode", (int)light == 0 ? "1" : "0");
                object accent = Reg(Registry.CurrentUser, @"Software\Microsoft\Windows\DWM", "AccentColor");
                if (accent is int)
                {
                    uint abgr = unchecked((uint)(int)accent);
                    string hex = string.Format("#FF{0:X2}{1:X2}{2:X2}", abgr & 0xFF, (abgr >> 8) & 0xFF, (abgr >> 16) & 0xFF);
                    Add(sb, "sysca1", App.Json(hex));
                    Add(sb, "wpcolor1", App.Json(hex));
                }
                object prod = Reg(Registry.LocalMachine, @"HARDWARE\DESCRIPTION\System\BIOS", "SystemProductName");
                object man = Reg(Registry.LocalMachine, @"HARDWARE\DESCRIPTION\System\BIOS", "SystemManufacturer");
                if (prod != null) Add(sb, "model", App.Json(prod.ToString()));
                if (man != null) Add(sb, "man", App.Json(man.ToString()));
                object dv = Reg(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion");
                Add(sb, "build", App.Json(Environment.OSVersion.Version.Build.ToString()));
                Add(sb, "aver", App.Json(dv != null ? dv.ToString() : Environment.OSVersion.Version.ToString()));
                Add(sb, "boot", Num(Math.Round(GetTickCount64() / 1000.0)));
                Rectangle b = screen.Bounds;
                Add(sb, "swidth", b.Width.ToString());
                Add(sb, "sheight", b.Height.ToString());
                Add(sb, "land", b.Width > b.Height ? "1" : "0");
                using (Graphics g = Graphics.FromHwnd(IntPtr.Zero))
                {
                    Add(sb, "sdpi", Num(g.DpiX));
                    Add(sb, "sdensity", Num(g.DpiX / 96.0));
                }
                Add(sb, "locked", "0");
                Add(sb, "ringer", "\"NORMAL\"");
                Add(sb, "powersave", "0");
                int vol = Volume();
                if (vol >= 0) { Add(sb, "volr", vol.ToString()); Add(sb, "vola", vol.ToString()); }
            }
            catch (Exception) { }
            sb.Append('}');
            return sb.ToString();
        }

        // ---------------------------------------------------------------- nc(...) and ts(...)
        public static string Network()
        {
            StringBuilder sb = new StringBuilder("{");
            try
            {
                NetworkInterface best = null;
                bool wifiUp = false, wifiThere = false;
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211)
                    {
                        wifiThere = true;
                        if (ni.OperationalStatus == OperationalStatus.Up) wifiUp = true;
                    }
                    if (ni.OperationalStatus == OperationalStatus.Up && best == null && ni.GetIPProperties().GatewayAddresses.Count > 0) best = ni;
                }
                Add(sb, "wifi", wifiUp ? "\"CONNECTED\"" : wifiThere ? "\"ENABLED\"" : "\"DISABLED\"");
                Add(sb, "cell", "\"OFF\"");
                Add(sb, "airplane", "0");
                if (best != null)
                {
                    Add(sb, "ifname", App.Json(best.Name));
                    foreach (UnicastIPAddressInformation a in best.GetIPProperties().UnicastAddresses)
                        if (a.Address.AddressFamily == AddressFamily.InterNetwork) { Add(sb, "ifip", App.Json(a.Address.ToString())); break; }
                    Add(sb, "dtype", App.Json(best.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ? "WIFI" : "ETHERNET"));
                }
                if (wifiUp)
                {
                    string w = WifiDetails();
                    if (w != "") { sb.Append(','); sb.Append(w); }
                }
            }
            catch (Exception) { }
            sb.Append('}');
            return sb.ToString();
        }

        // SSID and signal from "netsh wlan show interfaces" (refreshed at most every 30 seconds)
        static string WifiDetails()
        {
            if ((DateTime.Now - wifiAt).TotalSeconds < 30) return wifiCache;
            wifiAt = DateTime.Now;
            try
            {
                ProcessStartInfo si = new ProcessStartInfo("netsh", "wlan show interfaces");
                si.UseShellExecute = false; si.RedirectStandardOutput = true; si.CreateNoWindow = true;
                si.StandardOutputEncoding = Encoding.UTF8;
                string ssid = null; int signal = -1; string rate = null;
                using (Process p = Process.Start(si))
                {
                    string all = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);
                    foreach (string raw in all.Split('\n'))
                    {
                        int c = raw.IndexOf(':');
                        if (c < 0) continue;
                        string k = raw.Substring(0, c).Trim(), v = raw.Substring(c + 1).Trim();
                        if (k == "SSID") ssid = v;
                        else if (k == "Signal") int.TryParse(v.TrimEnd('%'), out signal);
                        else if (k.StartsWith("Receive rate")) rate = v;
                    }
                }
                StringBuilder sb = new StringBuilder();
                if (ssid != null) sb.Append("\"ssid\":").Append(App.Json(ssid));
                if (signal >= 0)
                {
                    if (sb.Length > 0) sb.Append(',');
                    sb.Append("\"wsig\":").Append(Math.Min(4, signal / 20)).Append(",\"wrssi\":").Append(signal / 2 - 100);
                }
                double mbps;
                if (rate != null && double.TryParse(rate, NumberStyles.Float, CultureInfo.InvariantCulture, out mbps))
                {
                    if (sb.Length > 0) sb.Append(',');
                    sb.Append("\"wspeed\":").Append(Num(mbps));
                }
                wifiCache = sb.ToString();
            }
            catch (Exception) { wifiCache = ""; }
            return wifiCache;
        }

        public static string Traffic()
        {
            long rx = 0, tx = 0, wrx = 0, wtx = 0, mrx = 0, mtx = 0;
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    IPv4InterfaceStatistics s = ni.GetIPv4Statistics();
                    rx += s.BytesReceived; tx += s.BytesSent;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) { wrx += s.BytesReceived; wtx += s.BytesSent; }
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Wwanpp || ni.NetworkInterfaceType == NetworkInterfaceType.Wwanpp2) { mrx += s.BytesReceived; mtx += s.BytesSent; }
                }
            }
            catch (Exception) { }
            return "{\"trx\":" + rx + ",\"ttx\":" + tx + ",\"tt\":" + (rx + tx) + ",\"wrx\":" + wrx + ",\"wtx\":" + wtx + ",\"wt\":" + (wrx + wtx) +
                ",\"mrx\":" + mrx + ",\"mtx\":" + mtx + ",\"mt\":" + (mrx + mtx) + "}";
        }

        // ---------------------------------------------------------------- the speakers' volume, 0..100 (Core Audio)
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
        [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator
        {
            int NotImpl1();
            [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        }
        [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice
        {
            [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        }
        [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume
        {
            int RegisterControlChangeNotify(IntPtr notify);
            int UnregisterControlChangeNotify(IntPtr notify);
            int GetChannelCount(out int count);
            int SetMasterVolumeLevel(float level, ref Guid ctx);
            int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
            int GetMasterVolumeLevel(out float level);
            int GetMasterVolumeLevelScalar(out float level);
            int SetChannelVolumeLevel(int ch, float level, ref Guid ctx);
            int SetChannelVolumeLevelScalar(int ch, float level, ref Guid ctx);
            int GetChannelVolumeLevel(int ch, out float level);
            int GetChannelVolumeLevelScalar(int ch, out float level);
            int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
            int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
        }
        // -1 when it cannot be read; 0 when muted
        public static int Volume()
        {
            try
            {
                IMMDeviceEnumerator en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
                IMMDevice dev;
                if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return -1;   // eRender, eMultimedia
                Guid iid = typeof(IAudioEndpointVolume).GUID;
                object o;
                if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0 || o == null) return -1;   // CLSCTX_ALL
                IAudioEndpointVolume v = (IAudioEndpointVolume)o;
                float level;
                bool mute;
                v.GetMasterVolumeLevelScalar(out level);
                v.GetMute(out mute);
                return mute ? 0 : (int)Math.Round(level * 100);
            }
            catch (Exception) { return -1; }
        }
    }
}
