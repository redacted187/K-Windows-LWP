// Win32 functions used to sit behind the desktop icons and to listen for mouse input.
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
    static class Native
    {
        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr dwExtraInfo; }
        public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
        [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc, IntPtr lParam);
        [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
        [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int x, int y, int w, int h, bool repaint);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
        [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref POINT p);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent, IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
        [DllImport("user32.dll")] public static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr hMod, uint threadId);
        [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string name);
        [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SystemParametersInfo(uint action, uint param, string vparam, uint winIni);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);

        // ---- keyboard input (media keys)
        [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
        [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
        [DllImport("user32.dll", SetLastError = true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);

        // presses and releases a key the way a real keyboard does (media keys are "extended" keys)
        public static void TapKey(byte vk)
        {
            INPUT[] k = new INPUT[2];
            for (int i = 0; i < 2; i++)
            {
                k[i].type = 1;   // INPUT_KEYBOARD
                k[i].u.ki.wVk = vk;
                k[i].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
                k[i].u.ki.dwFlags = (uint)(i == 1 ? 3 : 1);   // KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP
            }
            if (SendInput(2, k, Marshal.SizeOf(typeof(INPUT))) != 2)
            {
                keybd_event(vk, (byte)MapVirtualKey(vk, 0), 1, UIntPtr.Zero);
                keybd_event(vk, (byte)MapVirtualKey(vk, 0), 3, UIntPtr.Zero);
            }
        }

        // ---- the custom title bar of the editor window
        [DllImport("user32.dll")] public static extern bool ReleaseCapture();
        [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hWnd, int attr, ref int value, int size);

        // ---- asking Explorer's desktop list view whether an icon is under the mouse
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll")] public static extern IntPtr VirtualAllocEx(IntPtr proc, IntPtr addr, UIntPtr size, uint type, uint protect);
        [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr proc, IntPtr addr, UIntPtr size, uint type);
        [DllImport("kernel32.dll")] public static extern bool WriteProcessMemory(IntPtr proc, IntPtr addr, byte[] buf, UIntPtr size, out UIntPtr written);
        [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr proc, IntPtr addr, byte[] buf, UIntPtr size, out UIntPtr read);

        static IntPtr lvWnd = IntPtr.Zero, lvProc = IntPtr.Zero, lvMem = IntPtr.Zero;
        // index of the desktop icon at a screen point, or -1 (also -1 when it cannot tell)
        public static int DesktopIconAt(IntPtr listView, POINT screenPt)
        {
            try
            {
                if (listView != lvWnd)
                {
                    if (lvProc != IntPtr.Zero)
                    {
                        if (lvMem != IntPtr.Zero) VirtualFreeEx(lvProc, lvMem, UIntPtr.Zero, 0x8000);
                        CloseHandle(lvProc);
                    }
                    lvProc = IntPtr.Zero; lvMem = IntPtr.Zero; lvWnd = listView;
                    uint pid;
                    GetWindowThreadProcessId(listView, out pid);
                    lvProc = OpenProcess(0x0008 | 0x0010 | 0x0020, false, pid);   // VM_OPERATION | VM_READ | VM_WRITE
                    if (lvProc != IntPtr.Zero) lvMem = VirtualAllocEx(lvProc, IntPtr.Zero, new UIntPtr(64), 0x1000 | 0x2000, 0x04);
                }
                if (lvProc == IntPtr.Zero || lvMem == IntPtr.Zero) return -1;
                POINT p = screenPt;
                ScreenToClient(listView, ref p);
                byte[] info = new byte[24];   // LVHITTESTINFO { POINT pt; UINT flags; int iItem; int iSubItem; int iGroup; }
                BitConverter.GetBytes(p.X).CopyTo(info, 0);
                BitConverter.GetBytes(p.Y).CopyTo(info, 4);
                UIntPtr n;
                if (!WriteProcessMemory(lvProc, lvMem, info, new UIntPtr(24), out n)) return -1;
                IntPtr res;
                if (SendMessageTimeout(listView, 0x1012, IntPtr.Zero, lvMem, 0x0002, 100, out res) == IntPtr.Zero) return -1;   // LVM_HITTEST
                return res.ToInt32();
            }
            catch (Exception) { return -1; }
        }

        public static string ClassOf(IntPtr h)
        {
            if (h == IntPtr.Zero) return "";
            StringBuilder sb = new StringBuilder(128);
            GetClassName(h, sb, sb.Capacity);
            return sb.ToString();
        }
    }
}
