// What is playing on the PC, through Windows' own media controls (the same ones the volume flyout shows).
// build.bat compiles this with WINRT defined when the Windows metadata files are available; otherwise the
// stub at the bottom is used and music touch actions fall back to the media keys.
using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
#if WINRT
using Windows.Media.Control;
#endif

namespace KlwpWallpaper
{
#if WINRT
    static class MediaSession
    {
        public const bool Available = true;
        static GlobalSystemMediaTransportControlsSessionManager mgr;
        static string coverKey = "", coverUrl = "";

        static GlobalSystemMediaTransportControlsSession Current()
        {
            if (mgr == null) mgr = GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask().Result;
            return mgr == null ? null : mgr.GetCurrentSession();
        }

        // PLAY_PAUSE, NEXT, PREVIOUS; false when there is no player to send it to
        public static bool Command(string action)
        {
            try
            {
                GlobalSystemMediaTransportControlsSession s = Current();
                if (s == null) return false;
                Task<bool> t;
                if (action.IndexOf("NEXT", StringComparison.Ordinal) >= 0) t = s.TrySkipNextAsync().AsTask();
                else if (action.IndexOf("PREV", StringComparison.Ordinal) >= 0) t = s.TrySkipPreviousAsync().AsTask();
                else if (action.IndexOf("PLAY", StringComparison.Ordinal) >= 0 || action.IndexOf("PAUSE", StringComparison.Ordinal) >= 0) t = s.TryTogglePlayPauseAsync().AsTask();
                else return false;
                return t.Wait(2000) && t.Result;
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
                GlobalSystemMediaTransportControlsSessionMediaProperties p = s.TryGetMediaPropertiesAsync().AsTask().Result;
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
                        if (p.Thumbnail != null)
                        {
                            var st = p.Thumbnail.OpenReadAsync().AsTask().Result;
                            using (Stream src = st.AsStreamForRead())
                            using (MemoryStream ms = new MemoryStream())
                            {
                                src.CopyTo(ms);
                                string type = string.IsNullOrEmpty(st.ContentType) ? "image/png" : st.ContentType;
                                if (ms.Length > 0 && ms.Length < 4000000) coverUrl = "data:" + type + ";base64," + Convert.ToBase64String(ms.ToArray());
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
                sb.Append(",\"coverImg\":").Append(App.Json(coverUrl));
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
    }
#endif
}
