// What is playing on the PC, through Windows' own media controls (the same ones the volume flyout shows).
// build.bat compiles this with WINRT defined when the Windows metadata files are available; otherwise the
// stub at the bottom is used and music touch actions fall back to the media keys.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
#if WINRT
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;
#endif

namespace KlwpWallpaper
{
#if WINRT
    static class MediaSession
    {
        public const bool Available = true;
        static GlobalSystemMediaTransportControlsSessionManager mgr;
        static string coverKey = "", coverUrl = "";
        // the cover picture (a data: address, "" when there is none), sent to the pages on its own and only when it
        // changes: it is far bigger than the rest of the song info, which changes every second while playing
        public static string Cover { get { return coverUrl; } }

        // Waits for a Windows async result by polling its status, so no WinRT/.NET bridge assembly is needed
        // (Windows' split metadata files do not line up with that bridge's AsTask() when compiled with csc).
        static T Wait<T>(IAsyncOperation<T> op, int ms)
        {
            int start = Environment.TickCount;
            while (op.Status == AsyncStatus.Started)
            {
                if (Environment.TickCount - start > ms) { op.Cancel(); throw new TimeoutException(); }
                Thread.Sleep(5);
            }
            if (op.Status != AsyncStatus.Completed) throw new InvalidOperationException("media call " + op.Status);
            return op.GetResults();
        }

        static GlobalSystemMediaTransportControlsSession Current()
        {
            if (mgr == null) mgr = Wait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync(), 3000);
            return mgr == null ? null : mgr.GetCurrentSession();
        }

        // PLAY_PAUSE, NEXT, PREVIOUS; false when there is no player to send it to
        public static bool Command(string action)
        {
            try
            {
                GlobalSystemMediaTransportControlsSession s = Current();
                if (s == null) return false;
                IAsyncOperation<bool> op;
                if (action.IndexOf("NEXT", StringComparison.Ordinal) >= 0) op = s.TrySkipNextAsync();
                else if (action.IndexOf("PREV", StringComparison.Ordinal) >= 0) op = s.TrySkipPreviousAsync();
                else if (action.IndexOf("PLAY", StringComparison.Ordinal) >= 0 || action.IndexOf("PAUSE", StringComparison.Ordinal) >= 0) op = s.TryTogglePlayPauseAsync();
                else return false;
                return Wait(op, 2000);
            }
            catch (Exception) { return false; }
        }

        // the "mi" object for the page, as JSON; null when nothing is playing
        public static string InfoJson()
        {
            try
            {
                GlobalSystemMediaTransportControlsSession s = Current();
                if (s == null) return null;
                GlobalSystemMediaTransportControlsSessionMediaProperties p = Wait(s.TryGetMediaPropertiesAsync(), 2000);
                GlobalSystemMediaTransportControlsSessionPlaybackInfo pb = s.GetPlaybackInfo();
                GlobalSystemMediaTransportControlsSessionTimelineProperties tl = s.GetTimelineProperties();
                string state = "STOPPED";
                if (pb != null && pb.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing) state = "PLAYING";
                else if (pb != null && pb.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused) state = "PAUSED";
                string app = s.SourceAppUserModelId ?? "";
                string shortApp = app;
                int bang = shortApp.LastIndexOf('!');
                if (bang >= 0) shortApp = shortApp.Substring(bang + 1);
                if (shortApp.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) shortApp = shortApp.Substring(0, shortApp.Length - 4);
                double len = 0, pos = 0;
                if (tl != null)
                {
                    len = (tl.EndTime - tl.StartTime).TotalSeconds;
                    pos = (tl.Position - tl.StartTime).TotalSeconds;
                    // the position is only reported now and then; move it on while playing
                    if (state == "PLAYING") pos += (DateTimeOffset.Now - tl.LastUpdatedTime).TotalSeconds;
                    if (len > 0 && pos > len) pos = len;
                    if (pos < 0) pos = 0;
                }
                string key = (p.Title ?? "") + "\u0001" + (p.Artist ?? "") + "\u0001" + (p.AlbumTitle ?? "");
                if (key != coverKey)
                {
                    coverKey = key;
                    coverUrl = "";
                    try
                    {
                        // the same picture Windows shows in its media flyout (album art, or a video's thumbnail)
                        if (p.Thumbnail != null)
                        {
                            IRandomAccessStreamWithContentType st = Wait(p.Thumbnail.OpenReadAsync(), 3000);
                            ulong size = st.Size;
                            if (size > 0 && size < 4000000)
                            {
                                DataReader rd = new DataReader(st.GetInputStreamAt(0));
                                uint got = Wait(rd.LoadAsync((uint)size), 3000);
                                byte[] buf = new byte[got];
                                rd.ReadBytes(buf);
                                string type = string.IsNullOrEmpty(st.ContentType) ? "image/png" : st.ContentType;
                                coverUrl = "data:" + type + ";base64," + Convert.ToBase64String(buf);
                            }
                        }
                    }
                    catch (Exception) { coverUrl = ""; }
                }
                StringBuilder sb = new StringBuilder("{");
                sb.Append("\"title\":").Append(App.Json(p.Title ?? ""));
                sb.Append(",\"artist\":").Append(App.Json(p.Artist ?? ""));
                sb.Append(",\"album\":").Append(App.Json(p.AlbumTitle ?? ""));
                sb.Append(",\"track\":").Append(p.TrackNumber);
                sb.Append(",\"state\":\"").Append(state).Append('"');
                sb.Append(",\"len\":").Append(((long)Math.Round(len)).ToString());
                sb.Append(",\"pos\":").Append(((long)Math.Round(pos)).ToString());
                sb.Append(",\"package\":").Append(App.Json(app));
                sb.Append(",\"app\":").Append(App.Json(shortApp));
                sb.Append('}');
                return sb.ToString();
            }
            catch (Exception) { return null; }
        }
    }
#else
    static class MediaSession
    {
        public const bool Available = false;
        public static bool Command(string action) { return false; }
        public static string InfoJson() { return null; }
        public static string Cover { get { return ""; } }
    }
#endif
}
