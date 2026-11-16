// Real device data for the desktop: the same shape as the simulated data, filled from this PC and the web.
// The editor shows either the simulated data (Device data panel) or this; the wallpaper uses this unless the tray
// menu says otherwise.
(function (G) {
  'use strict';

  // a copy of the simulated data with every value emptied: what a phone reports when it has nothing to say
  function blank(o) {
    if (Array.isArray(o)) return [];
    if (o && typeof o === 'object') {
      const out = {};
      Object.keys(o).forEach(k => {
        out[k] = blank(o[k]);
      });
      return out;
    }
    if (typeof o === 'number') return 0;
    if (typeof o === 'boolean') return false;
    return '';
  }
  function liveDefaults(sim) {
    const L = blank(sim);
    Object.assign(L.mi, { state: 'STOPPED', vol: 0 });
    Object.assign(L.nc, { wifi: 'DISABLED', cell: 'OFF', dtypes: '', svcstate: 'OUT_OF_SERVICE' });
    Object.assign(L.si, { ringer: 'NORMAL', lmode: 'NORMAL', system: 0 });
    Object.assign(L.bi, { level: 100, plugged: 1, source: 'AC' });
    L.ni = { list: [] };
    L.ci = { list: [] };
    L.wf = [];
    L.wg = {};
    L.sh = {};
    L.br = {};
    L.bp = { default: '' };
    L.settings = Object.assign({}, sim.settings, { fixedTime: '' });
    return L;
  }

  // ---------------------------------------------------------------- the sky (NOAA sun equations, a simple moon)
  const RAD = Math.PI / 180;
  // sunrise/sunset for a given sun altitude (deg) on the date's local day; seconds since 1970, or null (polar day/night)
  function sunTimes(date, lat, lon, alt) {
    const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
    const jd = d0.getTime() / 86400000 + 2440587.5,
      n = Math.round(jd - 2451545.0 + 0.0008 - lon / 360),
      Js = n - lon / 360,
      M = (357.5291 + 0.98560028 * Js) % 360,
      C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD),
      Lm = (M + C + 180 + 102.9372) % 360,
      Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * Lm * RAD),
      dec = Math.asin(Math.sin(Lm * RAD) * Math.sin(23.4397 * RAD)),
      cosH = (Math.sin(alt * RAD) - Math.sin(lat * RAD) * Math.sin(dec)) / (Math.cos(lat * RAD) * Math.cos(dec));
    if (cosH < -1 || cosH > 1) return null;
    const H = Math.acos(cosH) / RAD,
      toUnix = j => Math.round((j - 2440587.5) * 86400);
    return { rise: toUnix(Jt - H / 360), set: toUnix(Jt + H / 360) };
  }
  // moon age in days (0 = new), illumination 0..100
  function moon(date) {
    const syn = 29.530588853,
      ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000,
      age = (((date.getTime() / 86400000 - ref) % syn) + syn) % syn,
      ill = Math.round(((1 - Math.cos((2 * Math.PI * age) / syn)) / 2) * 100);
    const names = [
      ['NEW', 'New Moon'],
      ['WAXING_CRESCENT', 'Waxing Crescent'],
      ['FIRST_QUARTER', 'First Quarter'],
      ['WAXING_GIBBOUS', 'Waxing Gibbous'],
      ['FULL', 'Full Moon'],
      ['WANING_GIBBOUS', 'Waning Gibbous'],
      ['THIRD_QUARTER', 'Third Quarter'],
      ['WANING_CRESCENT', 'Waning Crescent']
    ];
    const p = names[Math.floor(((age / syn) * 8 + 0.5) % 8)];
    return { mage: Math.floor(age), mill: ill, mphase: p[1], mphasec: p[0] };
  }
  function season(date, lat) {
    const m = date.getMonth(),
      d = date.getDate(),
      k = m * 100 + d;
    // astronomical seasons, northern hemisphere
    let s = k >= 220 && k < 521 ? 0 : k >= 521 && k < 822 ? 1 : k >= 822 && k < 1121 ? 2 : 3;
    if (lat < 0) s = (s + 2) % 4;
    return [
      ['SPRING', 'Spring'],
      ['SUMMER', 'Summer'],
      ['AUTUMN', 'Autumn'],
      ['WINTER', 'Winter']
    ][s];
  }
  function zodiac(date) {
    const md = (date.getMonth() + 1) * 100 + date.getDate();
    // the first day of each sign
    const Z = [
      [120, 'AQUARIUS'],
      [219, 'PISCES'],
      [321, 'ARIES'],
      [420, 'TAURUS'],
      [521, 'GEMINI'],
      [621, 'CANCER'],
      [723, 'LEO'],
      [823, 'VIRGO'],
      [923, 'LIBRA'],
      [1023, 'SCORPIO'],
      [1122, 'SAGITTARIUS'],
      [1222, 'CAPRICORN']
    ];
    let z = 'CAPRICORN';
    Z.forEach(x => {
      if (md >= x[0]) z = x[1];
    });
    return [z, z[0] + z.slice(1).toLowerCase()];
  }
  // everything ai(...) answers, for a place and a moment
  function astro(now, lat, lon) {
    const out = {};
    const tomorrow = new Date(now.getTime() + 86400000);
    const put = (pre, alt) => {
      const a = sunTimes(now, lat, lon, alt),
        b = sunTimes(tomorrow, lat, lon, alt);
      out[pre + 'sunrise'] = a ? a.rise : '';
      out[pre + 'sunset'] = a ? a.set : '';
      out['n' + pre + 'sunrise'] = b ? b.rise : '';
      out['n' + pre + 'sunset'] = b ? b.set : '';
    };
    put('', -0.833); // the sun's edge at the horizon
    put('c', -6); // civil twilight
    put('u', -12); // nautical twilight
    put('a', -18); // astronomical twilight
    const t = Math.floor(now.getTime() / 1000);
    out.isday = out.sunrise !== '' ? (t >= out.sunrise && t < out.sunset ? 1 : 0) : 1;
    Object.assign(out, moon(now));
    const se = season(now, lat),
      zo = zodiac(now);
    out.seasonc = se[0];
    out.season = se[1];
    out.zodiacc = zo[0];
    out.zodiac = zo[1];
    // moonrise/set: roughly 50 minutes later every day after the new moon's sunrise/sunset
    if (out.sunrise !== '') {
      const shift = Math.round((out.mage / 29.53) * 86400);
      out.moonrise = out.sunrise + shift;
      out.moonset = out.sunset + shift;
    }
    return out;
  }

  // ---------------------------------------------------------------- bp(): an image's colour palette
  // Close to Android's Palette: quantise a small copy of the picture, then pick the swatch that best fits each target
  // (vibrant / muted, light / dark) by saturation, lightness and how much of the picture it covers.
  function rgb2hsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn,
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  const TARGETS = {
    lvibrant: { l: [0.55, 0.74, 1], s: [0.35, 1, 1] },
    vibrant: { l: [0.3, 0.5, 0.7], s: [0.35, 1, 1] },
    dvibrant: { l: [0, 0.26, 0.45], s: [0.35, 1, 1] },
    lmuted: { l: [0.55, 0.74, 1], s: [0, 0.3, 0.4] },
    muted: { l: [0.3, 0.5, 0.7], s: [0, 0.3, 0.4] },
    dmuted: { l: [0, 0.26, 0.45], s: [0, 0.3, 0.4] }
  };
  function palette(img) {
    const c = document.createElement('canvas'),
      k = Math.min(1, 112 / Math.max(img.width || 1, img.height || 1));
    c.width = Math.max(1, Math.round((img.width || 1) * k));
    c.height = Math.max(1, Math.round((img.height || 1) * k));
    const o = c.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 0, 0, c.width, c.height);
    const d = o.getImageData(0, 0, c.width, c.height).data,
      bins = new Map();
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      const b = bins.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      b.r += d[i];
      b.g += d[i + 1];
      b.b += d[i + 2];
      b.n++;
      bins.set(key, b);
      total++;
    }
    const sw = [...bins.values()]
      .map(b => {
        const r = b.r / b.n,
          g = b.g / b.n,
          bl = b.b / b.n;
        return { r, g, b: bl, n: b.n, hsl: rgb2hsl(r, g, bl) };
      })
      .filter(s => s.n > total * 0.002 || bins.size < 50);
    const maxN = Math.max(1, ...sw.map(s => s.n));
    const out = {};
    const used = new Set();
    Object.keys(TARGETS).forEach(name => {
      const t = TARGETS[name];
      let best = null,
        bs = -1;
      sw.forEach(s => {
        const [, sat, l] = s.hsl;
        if (sat < t.s[0] || sat > t.s[2] || l < t.l[0] || l > t.l[2] || used.has(s)) return;
        const score = (1 - Math.abs(sat - t.s[1])) * 0.24 + (1 - Math.abs(l - t.l[1])) * 0.52 + (s.n / maxN) * 0.24;
        if (score > bs) {
          bs = score;
          best = s;
        }
      });
      if (best) {
        used.add(best);
        out[name] = best;
      }
    });
    out.dominant = sw.reduce((a, b) => (!a || b.n > a.n ? b : a), null);
    return out;
  }
  const hex2 = v =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  const col = s => '#FF' + hex2(s.r) + hex2(s.g) + hex2(s.b);
  // title/body text colour for a swatch: white or black with the alpha Android picks for readable contrast
  function lum(s) {
    const f = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(s.r) + 0.7152 * f(s.g) + 0.0722 * f(s.b);
  }
  function swatchColor(pal, mode) {
    const m = /^(dominant|lvibrant|vibrant|dvibrant|lmuted|muted|dmuted)(tc|bc)?$/.exec(String(mode).toLowerCase());
    if (!m || !pal) return null;
    const s = pal[m[1]];
    if (!s) return null;
    if (!m[2]) return col(s);
    const light = lum(s) > 0.179;
    return light ? (m[2] === 'tc' ? '#DE000000' : '#8A000000') : m[2] === 'tc' ? '#FFFFFFFF' : '#B3FFFFFF';
  }

  // ---------------------------------------------------------------- wg(): reading what a web address returned
  function stripHtml(s) {
    const d = new DOMParser().parseFromString('<body>' + s, 'text/html');
    return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  // wg(url, type, ...): txt = the text, raw = as is, json = a ".path" into it, rss = items, xml = an XPath
  function webValue(text, type, a) {
    type = String(type || 'txt').toLowerCase();
    if (text === null || text === undefined) return '';
    if (type === 'raw') return text;
    if (type === 'txt' || type === 'html') return stripHtml(text);
    if (type === 'json') {
      try {
        let v = JSON.parse(text);
        const path = String(a[0] || '')
          .replace(/^\./, '')
          .split(/\.|\[(\d+)\]/)
          .filter(x => x !== undefined && x !== '');
        for (const p of path) v = v === null || v === undefined ? undefined : v[p];
        return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
      } catch (e) {
        return '';
      }
    }
    if (type === 'rss') {
      const x = new DOMParser().parseFromString(text, 'application/xml');
      const items = [...x.querySelectorAll('item, entry')];
      const idx = Math.round(Number(a[0]) || 0),
        field = String(a[1] || 'title').toLowerCase();
      if (String(a[0]).toLowerCase() === 'count') return items.length;
      const it = items[idx];
      if (!it) return '';
      const get = sel => {
        const n = it.querySelector(sel);
        return n ? n.getAttribute('href') || n.textContent || '' : '';
      };
      if (field === 'desc') return stripHtml(get('description') || get('summary') || get('content'));
      if (field === 'link') return get('link');
      if (field === 'date') {
        const t = Date.parse(get('pubDate') || get('updated') || get('published'));
        return isNaN(t) ? '' : Math.floor(t / 1000);
      }
      if (field === 'img') {
        const enc = it.querySelector('enclosure, content, thumbnail');
        return enc ? enc.getAttribute('url') || '' : '';
      }
      return stripHtml(get(field));
    }
    if (type === 'xml') {
      try {
        const x = new DOMParser().parseFromString(text, 'application/xml');
        const r = x.evaluate(String(a[0] || '/'), x, null, XPathResult.STRING_TYPE, null);
        return r.stringValue;
      } catch (e) {
        return '';
      }
    }
    return text;
  }

  G.KLive = { liveDefaults, astro, palette, swatchColor, webValue };
})(window);
