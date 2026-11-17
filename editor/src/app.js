// KLWP desktop editor – application shell, state, import/export and KLWP-style UI.
(function () {
  'use strict';
  const F = window.KFormula,
    R = window.KRender,
    SC = window.KSchema;
  const $ = s => document.querySelector(s);
  function h(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else if (k === 'checked') e.checked = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(x => x && e.append(x));
      else e.append(c);
    }
    return e;
  }
  const pretty = s =>
    String(s)
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/(^|\s)\S/g, c => c.toUpperCase());
  const KF = 'kfile://org.kustom.provider/';
  const TYPE_CHIP = {
    RootLayerModule: 'R',
    OverlapLayerModule: 'Ov',
    StackLayerModule: 'St',
    KomponentModule: 'K',
    TextModule: 'T',
    CurvedTextModule: 'Ct',
    ShapeModule: 'Sh',
    BitmapModule: 'Im',
    MovieModule: 'Gif',
    FontIconModule: 'Ic',
    ProgressModule: 'Pr'
  };

  // little pictures for item types and global types (24x24, drawn with the current colour)
  const TYPE_SVG = {
    RootLayerModule: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    OverlapLayerModule:
      '<rect x="3.5" y="3.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="11" height="11" rx="1.5"/>',
    StackLayerModule:
      '<rect x="4" y="3.5" width="16" height="4.5" rx="1"/><rect x="4" y="9.75" width="16" height="4.5" rx="1"/><rect x="4" y="16" width="16" height="4.5" rx="1"/>',
    KomponentModule: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    TextModule: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
    CurvedTextModule: '<path d="M4 17a9 9 0 0 1 16 0"/><path d="M9 7h6M12 7v8"/>',
    MorphingTextModule: '<path d="M4 7V5h9v2M8.5 5v13M6.5 18h4"/><path d="M14 12l3 7 3-7"/>',
    ShapeModule: '<rect x="3.5" y="10" width="9.5" height="9.5" rx="1.5"/><circle cx="15.5" cy="8.5" r="5"/>',
    BitmapModule:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.7"/><path d="M21 16l-5-5-9 8"/>',
    MovieModule: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
    FontIconModule: '<path d="M12 3.5l2.5 5.3 5.8.7-4.3 3.9 1.2 5.7L12 16.3l-5.2 2.8L8 13.4 3.7 9.5l5.8-.7z"/>',
    ProgressModule: '<rect x="3" y="9.5" width="18" height="5" rx="2.5"/><path d="M5.5 12h7" stroke-width="3"/>',
    SeriesModule: '<path d="M4 7h3M4 12h3M4 17h3M10 7h10M10 12h10M10 17h10"/>',
    TEXT: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
    NUMBER: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16"/>',
    SWITCH:
      '<rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><circle cx="16.5" cy="12" r="2.6" fill="currentColor"/>',
    LIST: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="17" r="1" fill="currentColor"/>',
    BITMAP:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.7"/><path d="M21 16l-5-5-9 8"/>',
    FONT: '<path d="M6 20L12 4l6 16M8.4 14h7.2"/>',
    FOLDER: '<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
  };
  const typeSvg = k => '<svg viewBox="0 0 24 24">' + (TYPE_SVG[k] || '<circle cx="12" cy="12" r="7"/>') + '</svg>';
  // the type chip of an item: its picture, its short name as a tooltip
  const typeChip = (t, big) =>
    h('span', {
      class: 'chip-t' + (big ? ' big' : '') + ' t-' + (TYPE_CHIP[t] || 'x'),
      title: (SC.MODULES[t] && SC.MODULES[t].name) || pretty(String(t).replace(/Module$/, '')),
      html: typeSvg(t)
    });

  // wallpaper mode: the desktop-wallpaper host loads this same page with ?wallpaper=1 and gets nothing but the live, touchable wallpaper
  const WALL = /[?&]wallpaper=1/.test(location.search),
    hostMsg = m => {
      try {
        if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(m);
      } catch (e) {
        /* no host */
      }
    };
  // inside the Windows app the page is served from this origin and the app looks after the Kustom folder
  const HOST = location.hostname === 'klwp.wallpaper' && !!(window.chrome && window.chrome.webview);
  const kustomUrl = p => location.origin + '/' + String(p).split('/').map(encodeURIComponent).join('/');
  let listWait = null;
  const hostList = () =>
    new Promise(res => {
      listWait = res;
      hostMsg('list');
      setTimeout(() => {
        if (listWait === res) {
          listWait = null;
          res([]);
        }
      }, 6000);
    });
  // ------------------------------------------------------------------ state
  const S = {
    preset: null,
    files: new Map(),
    library: null, // a LazyLib, made just below its class
    jsonName: 'preset.json',
    fileName: 'Untitled.klwp',
    pretty: false,
    sim: JSON.parse(JSON.stringify(F.DEFAULT_SIM)),
    live: KLive.liveDefaults(F.DEFAULT_SIM),
    // the editor starts on simulated data; the wallpaper on real data unless the tray menu asks for simulated
    useSim: !/[?&]wallpaper=1/.test(location.search) || /[?&]usesim=1/.test(location.search),
    path: [],
    tab: null,
    checked: new Set(),
    clipboard: null,
    undo: [],
    redo: [],
    editKey: null,
    dirty: false,
    baseUsed: new Set(),
    views: [{ name: 'Phone 20:9', w: 1080, h: 2400, rt: R.newRuntime() }],
    screens: 3,
    scroll: 1,
    // vertical home screens (KLWP's "yscreens"); 1 = none
    yscreens: 1,
    yscroll: 0,
    locked: false,
    play: true,
    touch: true,
    snap: true,
    meta: {},
    monitors: [],
    panel: 'edit',
    simTab: 'Time',
    t0: performance.now(),
    faves: []
  };
  const DEVICES = [
    ['Phone 20:9', 1080, 2400],
    ['Phone 19.5:9', 1170, 2532],
    ['Phone 21:9', 1080, 2520],
    ['Phone 18:9', 1080, 2160],
    ['Phone 16:9', 1080, 1920],
    ['Foldable (open)', 1812, 2176],
    ['Tablet 16:10', 1600, 2560],
    ['Tablet 3:2', 1668, 2500],
    ['Tablet 4:3', 1536, 2048],
    ['Square 1:1', 1440, 1440]
  ];
  const DESKTOPS = [
    ['Desktop 1920×1080', 1920, 1080],
    ['Desktop 2560×1440', 2560, 1440],
    ['Desktop 3440×1440', 3440, 1440],
    ['Desktop 3840×2160', 3840, 2160]
  ];
  // this PC's monitors: the Windows app passes them in the address ("mon=2560x1440p,1920x1080"), a browser knows its own
  function readMonitors() {
    const q = /[?&]mon=([^&]+)/.exec(location.search),
      out = [];
    if (q)
      decodeURIComponent(q[1])
        .split(',')
        .forEach((x, i) => {
          const m = /^(\d+)x(\d+)(p?)$/.exec(x);
          if (m) out.push(['Monitor ' + (i + 1) + (m[3] ? ' (main)' : '') + '  ' + m[1] + '×' + m[2], +m[1], +m[2]]);
        });
    if (!out.length) {
      const d = window.devicePixelRatio || 1;
      out.push([
        'This screen  ' + Math.round(screen.width * d) + '×' + Math.round(screen.height * d),
        Math.round(screen.width * d),
        Math.round(screen.height * d)
      ]);
    }
    return out;
  }
  async function detectMonitors() {
    try {
      const sd = await window.getScreenDetails();
      S.monitors = sd.screens.map((x, i) => {
        const d = x.devicePixelRatio || 1,
          w = Math.round(x.width * d),
          hh = Math.round(x.height * d);
        return ['Monitor ' + (i + 1) + (x.isPrimary ? ' (main)' : '') + '  ' + w + '×' + hh, w, hh];
      });
      toast(S.monitors.length + ' monitor(s) found');
    } catch (e) {
      toast('The browser did not share the monitor list');
    }
    layoutViews();
  }
  // Editor-only settings for a theme (default preview size, desktop scale). They travel inside the .klwp as an extra
  // "kwlwp.json" entry, which KLWP never reads: the phone loads the preset as usual and simply leaves the entry out
  // when it saves. A copy is also kept on this computer, keyed by the preset's id, so a phone re-save loses nothing here.
  const META_FILE = 'kwlwp.json';
  const metaKey = () => {
    const i = (S.preset && S.preset.preset_info) || {};
    return 'kwlwp-meta:' + (i.id || i.title || 'untitled');
  };
  function readMeta() {
    let m = null;
    try {
      if (S.files.has(META_FILE)) m = JSON.parse(new TextDecoder().decode(S.files.get(META_FILE)));
    } catch (e) {
      m = null;
    }
    if (!m)
      try {
        m = JSON.parse(localStorage.getItem(metaKey()) || 'null');
      } catch (e) {
        m = null;
      }
    return m && typeof m === 'object' ? m : {};
  }
  function saveMeta(dirty) {
    try {
      localStorage.setItem(metaKey(), JSON.stringify(S.meta));
    } catch (e) {
      /* private mode */
    }
    if (dirty) {
      S.dirty = true;
      updateBar();
    }
  }
  const deskScale = () => Math.max(0.1, Math.min(4, (+S.meta.deskScale || 100) / 100));
  function applyMeta() {
    const mv = S.meta.view;
    if (!WALL && mv && mv.w > 0 && mv.h > 0) {
      const v = S.views[0];
      v.name = mv.name || 'Custom';
      v.w = Math.round(mv.w);
      v.h = Math.round(mv.h);
      v.desk = !!mv.desk;
    }
  }

  function newPreset() {
    return {
      preset_info: {
        archive: '',
        hash: null,
        id: uuid(),
        ts: Date.now(),
        version: 15,
        title: 'Untitled',
        description: '',
        author: '',
        email: '',
        width: 540,
        height: 1200,
        xscreens: 2,
        yscreens: 0,
        features: '',
        release: 381531008,
        locked: false,
        pflags: 0
      },
      preset_root: { internal_type: 'RootLayerModule', background_color: '#FF202124', viewgroup_items: [] }
    };
  }
  const root = () => S.preset.preset_root;
  function modAt(path) {
    let m = root();
    for (const i of path) {
      if (!m.viewgroup_items || !m.viewgroup_items[i]) return null;
      m = m.viewgroup_items[i];
    }
    return m;
  }
  function chain(path) {
    const out = [root()];
    let m = root();
    for (const i of path) {
      m = m.viewgroup_items[i];
      out.push(m);
    }
    return out;
  }
  const cur = () => modAt(S.path) || ((S.path = []), root());
  const kompScopes = path => chain(path).filter(m => m.internal_type === 'KomponentModule');
  function findPath(target, m, path) {
    m = m || root();
    path = path || [];
    if (m === target) return path;
    const it = m.viewgroup_items || [];
    for (let i = 0; i < it.length; i++) {
      const r = findPath(target, it[i], path.concat(i));
      if (r) return r;
    }
    return null;
  }
  function globalsFor(path) {
    // merged list of visible globals: [{key, g, scope}]
    const out = [];
    chain(path).forEach(m => {
      if (m.globals_list && (m.internal_type === 'RootLayerModule' || m.internal_type === 'KomponentModule'))
        Object.keys(m.globals_list).forEach(k => out.push({ key: k, g: m.globals_list[k] }));
    });
    return out;
  }

  // ------------------------------------------------------------------ undo
  function snapshot(key) {
    if (key && key === S.editKey) return;
    S.editKey = key || null;
    S.undo.push({ json: JSON.stringify(S.preset), path: S.path.slice(), tab: S.tab });
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
    S.dirty = true;
    updateBar();
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push({ json: JSON.stringify(S.preset), path: S.path.slice(), tab: S.tab });
    const s = from.pop();
    S.preset = JSON.parse(s.json);
    S.path = s.path;
    S.tab = s.tab;
    S.editKey = null;
    S.checked.clear();
    if (!modAt(S.path)) S.path = [];
    renderEditor();
    requestRender();
    updateBar();
  }

  // ------------------------------------------------------------------ assets
  // KLWP's built-in default font and icon set (src/builtin.js), decoded on first use
  const builtinCache = new Map();
  function builtinBytes(name) {
    if (builtinCache.has(name)) return builtinCache.get(name);
    const B = window.KBuiltin || {},
      b64 = name === 'roboto' ? B.roboto : name === 'materialfont' ? B.materialFont : null;
    let out = null;
    if (b64) {
      const bin = atob(b64);
      out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    }
    builtinCache.set(name, out);
    return out;
  }
  // an animated GIF, decoded into frames with the browser's ImageDecoder. Big GIFs are kept at most 720 px wide
  // (the preview never needs more) so a long animation does not eat the memory.
  // ---- animated GIFs
  // A small GIF player of its own: the file stays compressed and frames are decoded one after another into a single
  // reused buffer, so memory stays at one frame however long the GIF is. (The browser's own decoders keep every
  // decoded frame, which for a long GIF means hundreds of megabytes.)
  function gifParse(b) {
    if (b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
    const W = b[6] | (b[7] << 8),
      H = b[8] | (b[9] << 8);
    let p = 13,
      gct = null;
    if (b[10] & 0x80) {
      const n = 1 << ((b[10] & 7) + 1);
      gct = b.subarray(p, p + 3 * n);
      p += 3 * n;
    }
    const frames = [];
    let gce = { delay: 0, disposal: 0, trans: -1 };
    const skipSub = () => {
      while (p < b.length && b[p]) p += b[p] + 1;
      p++;
    };
    while (p < b.length) {
      const t = b[p++];
      if (t === 0x21) {
        const label = b[p++];
        if (label === 0xf9 && b[p] >= 4) {
          const pk = b[p + 1];
          gce = { delay: (b[p + 2] | (b[p + 3] << 8)) * 10, disposal: (pk >> 2) & 7, trans: pk & 1 ? b[p + 4] : -1 };
        }
        skipSub();
      } else if (t === 0x2c) {
        const f = {
          x: b[p] | (b[p + 1] << 8),
          y: b[p + 2] | (b[p + 3] << 8),
          w: b[p + 4] | (b[p + 5] << 8),
          h: b[p + 6] | (b[p + 7] << 8),
          inter: !!(b[p + 8] & 0x40),
          pal: gct,
          delay: gce.delay <= 10 ? 100 : gce.delay, // 0 and 10 ms play as 100 ms, as in browsers and on Android
          disposal: gce.disposal,
          trans: gce.trans
        };
        const pk = b[p + 8];
        p += 9;
        if (pk & 0x80) {
          const n = 1 << ((pk & 7) + 1);
          f.pal = b.subarray(p, p + 3 * n);
          p += 3 * n;
        }
        f.min = b[p++];
        f.data = p; // start of the image's data sub-blocks
        skipSub();
        frames.push(f);
        gce = { delay: 0, disposal: 0, trans: -1 };
      } else break;
    }
    return frames.length ? { W, H, frames, b } : null;
  }
  // LZW-decode one frame's colour indices
  function gifIndices(g, f) {
    const b = g.b,
      npix = f.w * f.h,
      out = new Uint8Array(npix);
    // gather the sub-blocks into one byte run
    let len = 0,
      p = f.data;
    while (b[p]) {
      len += b[p];
      p += b[p] + 1;
    }
    const data = new Uint8Array(len);
    p = f.data;
    let o = 0;
    while (b[p]) {
      data.set(b.subarray(p + 1, p + 1 + b[p]), o);
      o += b[p];
      p += b[p] + 1;
    }
    const clear = 1 << f.min,
      eoi = clear + 1;
    const prefix = new Uint16Array(4096),
      suffix = new Uint8Array(4096),
      stack = new Uint8Array(4097);
    let size = f.min + 1,
      mask = (1 << size) - 1,
      avail = clear + 2,
      old = -1,
      first = 0,
      bits = 0,
      datum = 0,
      bi = 0,
      pi = 0;
    for (let c = 0; c < clear; c++) suffix[c] = c;
    while (pi < npix) {
      while (bits < size) {
        if (bi >= data.length) return out;
        datum |= data[bi++] << bits;
        bits += 8;
      }
      let code = datum & mask;
      datum >>= size;
      bits -= size;
      if (code === clear) {
        size = f.min + 1;
        mask = (1 << size) - 1;
        avail = clear + 2;
        old = -1;
        continue;
      }
      if (code === eoi) break;
      if (old === -1) {
        out[pi++] = suffix[code];
        old = first = code;
        continue;
      }
      const inCode = code;
      let top = 0;
      if (code >= avail) {
        stack[top++] = first;
        code = old;
      }
      while (code >= clear) {
        stack[top++] = suffix[code];
        code = prefix[code];
      }
      first = suffix[code];
      stack[top++] = first;
      if (avail < 4096) {
        prefix[avail] = old;
        suffix[avail] = first;
        avail++;
        if ((avail & mask) === 0 && avail < 4096) {
          size++;
          mask += avail;
        }
      }
      old = inCode;
      while (top > 0 && pi < npix) out[pi++] = stack[--top];
    }
    return out;
  }
  // paint frame i onto the running picture (frame i - 1 must already be there)
  function gifPaint(a, i) {
    const g = a.g,
      f = g.frames[i],
      px = a.px;
    // what the previous frame asked to happen after it was shown
    const pf = i ? g.frames[i - 1] : null;
    if (!i) px.fill(0);
    else if (pf.disposal === 2) {
      for (let y = pf.y; y < pf.y + pf.h && y < g.H; y++)
        px.fill(0, (y * g.W + pf.x) * 4, (y * g.W + Math.min(g.W, pf.x + pf.w)) * 4);
    } else if (pf.disposal === 3 && a.saved) px.set(a.saved);
    if (f.disposal === 3) a.saved = px.slice();
    const idx = gifIndices(g, f),
      pal = f.pal;
    if (!pal) return;
    // interlaced rows come in the order 0,8,16.. then 4,12.. then 2,6.. then 1,3..
    let rows = null;
    if (f.inter) {
      rows = [];
      [
        [0, 8],
        [4, 8],
        [2, 4],
        [1, 2]
      ].forEach(([s, st]) => {
        for (let y = s; y < f.h; y += st) rows.push(y);
      });
    }
    for (let r = 0; r < f.h; r++) {
      const y = f.y + (rows ? rows[r] : r);
      if (y >= g.H) continue;
      let q = r * f.w,
        d = (y * g.W + f.x) * 4;
      for (let x = 0; x < f.w; x++, q++, d += 4) {
        if (f.x + x >= g.W) continue;
        const c = idx[q];
        if (c === f.trans) continue;
        px[d] = pal[c * 3];
        px[d + 1] = pal[c * 3 + 1];
        px[d + 2] = pal[c * 3 + 2];
        px[d + 3] = 255;
      }
    }
  }
  function decodeGif(rec, bytes) {
    try {
      const g = gifParse(bytes);
      if (!g || g.frames.length < 2) return;
      const starts = [];
      let total = 0;
      g.frames.forEach(f => {
        starts.push(total);
        total += f.delay;
      });
      const cv = document.createElement('canvas');
      cv.width = g.W;
      cv.height = g.H;
      const cx = cv.getContext('2d'),
        img = cx.createImageData(g.W, g.H);
      const a = {
        g,
        n: g.frames.length,
        starts,
        durs: g.frames.map(f => f.delay),
        total,
        cv,
        cx,
        img,
        px: img.data,
        idx: -1,
        saved: null
      };
      gifStep(a, 0);
      rec.img = cv;
      rec.anim = a;
      requestRender();
    } catch (e) {
      /* stays a still image */
    }
  }
  // move the running picture on to frame i (forwards; going back starts again from frame 0)
  function gifStep(a, i) {
    if (i === a.idx) return;
    let from = a.idx + 1;
    if (i < a.idx || a.idx < 0) from = 0;
    for (let k = from; k <= i; k++) gifPaint(a, k);
    a.idx = i;
    a.cx.putImageData(a.img, 0, 0);
    a.cx.canvas._ver = (a.cx.canvas._ver || 0) + 1; // filtered copies of the picture are out of date now
  }
  // which frame of an animated GIF belongs at time t (ms), and how long until the next one
  function gifFrameAt(a, t) {
    const x = ((t % a.total) + a.total) % a.total;
    let lo = 0,
      hi = a.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (a.starts[mid] <= x) lo = mid;
      else hi = mid - 1;
    }
    return { i: lo, left: a.starts[lo] + a.durs[lo] - x };
  }
  function gifShow(a, i) {
    gifStep(a, i);
  }
  // The Kustom folder, read only when a file is actually needed. Knows every file's name from the start (for the
  // pickers), but loads its bytes on first use and keeps them; get() answers undefined until they have arrived.
  class LazyLib {
    constructor() {
      this.data = new Map();
      this.src = new Map();
      this.busy = new Map();
    }
    add(k, loader, size) {
      this.src.set(k, { loader, size: size || 0 });
    }
    set(k, v) {
      this.data.set(k, v);
      this.src.delete(k);
    }
    has(k) {
      return this.data.has(k) || this.src.has(k);
    }
    keys() {
      return new Set([...this.data.keys(), ...this.src.keys()]).values();
    }
    get size() {
      return this.data.size + this.src.size;
    }
    // the bytes, or undefined (and they start loading)
    get(k) {
      const v = this.data.get(k);
      if (v || !this.src.has(k)) return v;
      this.load(k);
      A._pending = true;
      return undefined;
    }
    load(k) {
      if (this.data.has(k)) return Promise.resolve(this.data.get(k));
      if (this.busy.has(k)) return this.busy.get(k);
      const e = this.src.get(k);
      if (!e) return Promise.resolve(undefined);
      const pr = Promise.resolve(e.loader())
        .then(ab => {
          const u = new Uint8Array(ab);
          this.data.set(k, u);
          this.src.delete(k);
          this.busy.delete(k);
          requestRender();
          if (thumbWaits.has(k)) thumbWaits.get(k).forEach(f => f());
          return u;
        })
        .catch(() => {
          this.busy.delete(k);
          return undefined;
        });
      this.busy.set(k, pr);
      return pr;
    }
  }
  const thumbWaits = new Map();
  S.library = new LazyLib();
  const webWaits = new Map();
  const A = {
    images: new Map(),
    fonts: new Map(),
    sets: new Map(),
    _pending: false,
    bytes(uri) {
      A._pending = false;
      if (!uri || typeof uri !== 'string') return null;
      if (uri.indexOf('builtin:') === 0) return builtinBytes(uri.slice(8));
      let p = uri.indexOf(KF) === 0 ? uri.slice(KF.length) : uri.replace(/^kfile:\/\/[^/]+\//, '');
      try {
        p = decodeURIComponent(p);
      } catch (e) {
        /* keep */
      }
      const hit = S.files.get(p) || S.library.get(p) || S.files.get(uri);
      if (hit) return hit;
      const dev = A.devPath(uri);
      const d = dev !== null ? S.library.get(dev) || null : null;
      if (d) return d;
      // a path inside another preset ("wallpapers/x.klwp/icons/a.ttf") or another storage
      // ("org.kustom.sdcard.000/fonts/a.ttf"): KLWP bundles the file into this preset when it saves, under its own folder
      const m = /(?:^|\/)(fonts|icons|bitmaps)\/([^/]+)$/.exec(p);
      return m ? S.files.get(m[1] + '/' + m[2]) || S.library.get(m[1] + '/' + m[2]) || null : null;
    },
    // a phone path such as /sdcard/Kustom/x or file:///storage/emulated/0/Kustom/x -> path inside the loaded Kustom folder
    devPath(u) {
      let s = String(u);
      try {
        s = decodeURIComponent(s);
      } catch (e) {
        /* keep */
      }
      const m = /\/Kustom\/(.*)$/i.exec(s);
      return m ? m[1].replace(/\/+$/, '') : null;
    },
    textCache: new Map(),
    readText(u) {
      const k = A.devPath(u);
      if (k === null) return null;
      if (A.textCache.has(k)) return A.textCache.get(k);
      const b = S.library.get(k);
      const t = b ? new TextDecoder().decode(b) : null;
      A.textCache.set(k, t);
      return t;
    },
    listFiles(dir) {
      const k = A.devPath(String(dir).replace(/\/?$/, '/'));
      if (k === null) return [];
      const out = [];
      for (const n of S.library.keys())
        if (
          n.indexOf(k ? k + '/' : '') === 0 &&
          /\.(png|jpe?g|webp|gif|bmp)$/i.test(n) &&
          n.slice(k.length + 1).indexOf('/') < 0
        )
          out.push('/storage/emulated/0/Kustom/' + n);
      return out.sort();
    },
    // t: the moment (ms) of an animated image to show; leave it out for the first frame
    // bp(): the palette of a picture (computed once per picture)
    palette(mode, uri) {
      const img = A.image(uri);
      if (!img) return null;
      let pal = A.palettes.get(img);
      if (!pal) {
        try {
          pal = KLive.palette(img);
        } catch (e) {
          pal = {};
        }
        A.palettes.set(img, pal);
      }
      return KLive.swatchColor(pal, mode);
    },
    palettes: new WeakMap(),
    // wg(): what a web address returns, refreshed every 15 minutes. The Windows app downloads it (no browser
    // cross-site limits); in a browser the site has to allow it. '' while it is on its way.
    web: new Map(),
    webGet(url, type, args) {
      if (!/^https?:\/\//i.test(url)) return undefined;
      let e = A.web.get(url);
      const now = Date.now();
      if (!e || (!e.busy && now - e.t > 15 * 60000)) {
        e = e || { text: null, t: 0, busy: false };
        e.busy = true;
        e.t = now;
        A.web.set(url, e);
        const done = txt => {
          e.busy = false;
          if (txt !== null) e.text = txt;
          requestRender();
        };
        if (HOST) {
          const id = 'w' + Math.random().toString(36).slice(2);
          webWaits.set(id, done);
          hostMsg('wg:' + id + '|' + url);
        } else
          fetch(url)
            .then(r => (r.ok ? r.text() : null))
            .then(done)
            .catch(() => done(null));
      }
      return e.text === null ? '' : KLive.webValue(e.text, type, args);
    },
    animated(uri) {
      const c = A.images.get(String(uri || ''));
      return !!(c && c.anim);
    },
    // ms until an animated image shows its next frame (for scheduling the next redraw), or Infinity
    nextFrameIn(uri, t) {
      const c = A.images.get(String(uri || ''));
      return c && c.anim ? Math.max(4, gifFrameAt(c.anim, t).left) : Infinity;
    },
    image(uri, t) {
      if (!uri) return null;
      uri = String(uri);
      const c = A.images.get(uri);
      if (c) {
        if (c.anim && t !== undefined) gifShow(c.anim, gifFrameAt(c.anim, t).i);
        return c.img;
      }
      const rec = { img: null };
      A.images.set(uri, rec);
      if (uri.indexOf('sim:') === 0) {
        rec.img = simImage(uri);
        return rec.img;
      }
      if (uri.indexOf('data:') === 0) {
        const im = new Image();
        im.onload = () => {
          rec.img = im;
          requestRender();
        };
        im.src = uri;
        return null;
      }
      const b = A.bytes(uri);
      if (!b) {
        if (A._pending) A.images.delete(uri); // still loading: ask again next time
        return null;
      }
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) decodeGif(rec, b);
      if (rec.anim) return rec.img;
      createImageBitmap(new Blob([b]))
        .then(bm => {
          // a picture far bigger than any screen it is drawn on is kept smaller (same shape), to save memory
          const lim = Math.max(2048, 2 * Math.max(...S.views.map(v => Math.max(v.w || 0, v.h || 0)), 1080));
          if (bm.width > lim || bm.height > lim) {
            const k = lim / Math.max(bm.width, bm.height);
            return createImageBitmap(bm, {
              resizeWidth: Math.max(1, Math.round(bm.width * k)),
              resizeHeight: Math.max(1, Math.round(bm.height * k)),
              resizeQuality: 'high'
            }).then(small => {
              bm.close();
              return small;
            });
          }
          return bm;
        })
        .then(bm => {
          rec.img = rec.img || bm;
          requestRender();
        })
        .catch(() => {
          const img = new Image();
          img.onload = () => {
            rec.img = img;
            requestRender();
          };
          img.src = URL.createObjectURL(new Blob([b], { type: 'image/svg+xml' }));
        });
      return null;
    },
    font(uri) {
      if (!uri) uri = 'builtin:roboto'; // KLWP's default font
      const c = A.fonts.get(uri);
      if (c) return c.ready ? c.family : null;
      const b = A.bytes(uri);
      if (!b && A._pending) return null; // still loading: ask again next time
      const rec = { family: 'kf' + A.fonts.size, ready: false };
      A.fonts.set(uri, rec);
      if (!b) return null;
      rec.metrics = parseFontMetrics(b);
      try {
        new FontFace(rec.family, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
          .load()
          .then(f => {
            document.fonts.add(f);
            rec.ready = true;
            requestRender();
          })
          .catch(() => {});
      } catch (e) {
        /* bad font */
      }
      return null;
    },
    // an Iconify icon (icon set "iconify://ic?name=..."): KLWP keeps the SVG gzipped and base64'd after a '#'
    // in the icon name ("baseline-fast-rewind#H4sI..."), and downloads it from api.iconify.design otherwise
    svgIcon(setUri, name) {
      const key = setUri + '|' + name;
      const c = A.images.get(key);
      if (c) return c.img;
      const rec = { img: null };
      A.images.set(key, rec);
      const hash = name.indexOf('#'),
        id = (hash >= 0 ? name.slice(0, hash) : name).trim(),
        data = hash >= 0 ? name.slice(hash + 1).trim() : '';
      const done = txt => {
        if (!/<svg/i.test(txt)) return;
        const im = new Image();
        im.onload = () => {
          rec.img = im;
          requestRender();
        };
        im.src = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
      };
      (async () => {
        try {
          if (data) {
            const bin = atob(data),
              u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            if (u8[0] === 0x1f && u8[1] === 0x8b) {
              const st = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
              done(await new Response(st).text());
            } else done(new TextDecoder().decode(u8));
          } else {
            const pre = (/^iconify:\/\/([^/?#]+)/.exec(setUri) || [])[1] || 'iconify';
            const r = await fetch('https://api.iconify.design/' + pre + '/' + encodeURIComponent(id) + '.svg');
            if (r.ok) done(await r.text());
          }
        } catch (e) {
          /* stays empty, like KLWP offline */
        }
      })();
      return null;
    },
    fontMetrics(uri) {
      uri = uri || 'builtin:roboto';
      if (uri) {
        A.font(uri);
        const c = A.fonts.get(uri);
        if (c && c.metrics) return c.metrics;
      }
      return ROBOTO;
    },
    iconSet(uri) {
      uri = String(uri || '').trim();
      // no set: KLWP's own built-in Material Icons
      if (!uri) uri = 'builtin:material';
      if (A.sets.has(uri)) return A.sets.get(uri);
      if (uri === 'builtin:material' && window.KBuiltin) {
        const map = {};
        Object.keys(window.KBuiltin.materialMap).forEach(n => {
          const d = { code: window.KBuiltin.materialMap[n] };
          map[n] = d;
          if (!(n.toLowerCase() in map)) map[n.toLowerCase()] = d;
        });
        Object.defineProperty(map, '_font', { value: () => A.font('builtin:materialfont'), enumerable: false });
        Object.defineProperty(map, '_names', { value: Object.keys(window.KBuiltin.materialMap), enumerable: false });
        A.sets.set(uri, map);
        return map;
      }
      let b = A.bytes(uri.replace(/\.ttf$/i, '.json'));
      let waiting = A._pending;
      if (!b && uri.indexOf('/') < 0) {
        A._pending = false;
        b = S.files.get('icons/' + uri + '.json') || S.library.get('icons/' + uri + '.json');
        waiting = waiting || A._pending;
      }
      if (!b && waiting) return null; // still loading: ask again next time
      let map = null;
      if (b)
        try {
          const j = JSON.parse(new TextDecoder().decode(b));
          map = {};
          var names = [];
          (j.icons || []).forEach(ic => {
            const d = { code: (ic.properties && ic.properties.code) || ic.icon.defaultCode || 0 };
            String((ic.properties && ic.properties.name) || '')
              .split(',')
              .forEach(n => {
                n = n.trim();
                if (!n) return;
                if (!(n in map)) names.push(n);
                map[n] = d;
                // KLWP finds icons whatever the case ("F_wifi_CONNECTED_0" is "F_Wifi_Connected_0")
                if (!(n.toLowerCase() in map)) map[n.toLowerCase()] = d;
              });
          });
          const ttf = /\.ttf$/i.test(uri) ? uri : KF + 'icons/' + uri + '.ttf';
          Object.defineProperty(map, '_font', { value: () => A.font(ttf), enumerable: false });
          Object.defineProperty(map, '_names', { value: names, enumerable: false });
        } catch (e) {
          map = null;
        }
      A.sets.set(uri, map);
      return map;
    },
    reset() {
      A.images.clear();
      A.fonts.clear();
      A.sets.clear();
      A.textCache.clear();
    },
    list(dir, re) {
      const s = new Set();
      for (const k of S.files.keys()) if (k.indexOf(dir + '/') === 0 && (!re || re.test(k))) s.add(k);
      for (const k of S.library.keys()) if (k.indexOf(dir + '/') === 0 && (!re || re.test(k))) s.add(k);
      return [...s].sort();
    }
  };
  const ROBOTO = { asc: 0.928, desc: 0.244, gap: 0, top: 1.056, bottom: 0.271 };
  // vertical metrics straight from the font file (hhea ascent/descent/line gap and the head bounding box)
  function parseFontMetrics(b) {
    try {
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength),
        n = dv.getUint16(4),
        t = {};
      for (let i = 0; i < n; i++) {
        const o = 12 + i * 16;
        t[String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])] = dv.getUint32(o + 8);
      }
      if (t.head === undefined || t.hhea === undefined) return ROBOTO;
      const upm = dv.getUint16(t.head + 18) || 1000,
        yMin = dv.getInt16(t.head + 38),
        yMax = dv.getInt16(t.head + 42);
      let asc = dv.getInt16(t.hhea + 4),
        desc = -dv.getInt16(t.hhea + 6),
        gap = dv.getInt16(t.hhea + 8);
      if (!asc && !desc && t['OS/2'] !== undefined) {
        asc = dv.getInt16(t['OS/2'] + 68);
        desc = -dv.getInt16(t['OS/2'] + 70);
        gap = dv.getInt16(t['OS/2'] + 72);
      }
      return { asc: asc / upm, desc: desc / upm, gap: Math.max(0, gap) / upm, top: yMax / upm, bottom: -yMin / upm };
    } catch (e) {
      return ROBOTO;
    }
  }
  // what the formulas read: the editor's simulated data, or this PC's real data
  const state = () => ({ preset: S.preset, assets: A, sim: S.useSim ? S.sim : S.live, live: !S.useSim });

  // ------------------------------------------------------------------ rendering
  let raf = 0;
  // Redraws are asked for freely; they happen at most at the frame-rate cap (the wallpaper's setting, 60 in the
  // editor) and never while nothing changes.
  let lastFrame = 0,
    capTimer = 0,
    wakeTimer = 0;
  // the wallpaper uses the frame rate from Settings; the editor's preview slows down while its window is in the
  // background, so it does not compete with the wallpaper
  const fpsCap = () => (WALL ? Math.max(5, +(SET && SET.fps) || 60) : document.hasFocus() ? 60 : 15);
  function requestRender() {
    if (raf || capTimer) return;
    const gap = 1000 / fpsCap() - (performance.now() - lastFrame);
    if (gap > 2)
      capTimer = setTimeout(() => {
        capTimer = 0;
        if (!raf) raf = requestAnimationFrame(renderAll);
      }, gap);
    else raf = requestAnimationFrame(renderAll);
  }
  function simNow() {
    const f = S.sim.settings && S.sim.settings.fixedTime;
    if (f) {
      const d = new Date(f);
      if (!isNaN(d)) return d;
    }
    return tzNow(new Date());
  }

  // ------------------------------------------------------------------ settings shared by every theme
  // Kept in this browser profile (in the Windows app the editor and the wallpaper share it), like KLWP's own settings.
  const SET_KEY = 'kwlwp-settings';
  const SET_DEFAULT = {
    weather: { provider: 'sim', key: '', every: 60 },
    loc: { name: '', lat: null, lon: null, country: '', ccode: '', admin: '' },
    units: { temp: 'C', wind: 'kmh' },
    clock24h: false,
    tz: '',
    fps: 60,
    livePreview: true,
    desk: { noSelectRect: false }
  };
  let SET = JSON.parse(JSON.stringify(SET_DEFAULT));
  function loadSettings() {
    try {
      const o = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
      if (o && typeof o === 'object')
        Object.keys(SET_DEFAULT).forEach(k => {
          if (o[k] === undefined) return;
          SET[k] =
            SET_DEFAULT[k] && typeof SET_DEFAULT[k] === 'object' ? Object.assign({}, SET_DEFAULT[k], o[k]) : o[k];
        });
    } catch (e) {
      /* defaults */
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SET_KEY, JSON.stringify(SET));
    } catch (e) {
      /* private mode */
    }
  }
  // the wall-clock time in the chosen time zone, as a Date whose local fields read that time
  function tzNow(d) {
    if (!SET.tz) return d;
    try {
      const p = {};
      new Intl.DateTimeFormat('en-US', {
        timeZone: SET.tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
        .formatToParts(d)
        .forEach(x => {
          p[x.type] = +x.value;
        });
      return new Date(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second, d.getMilliseconds());
    } catch (e) {
      return d;
    }
  }
  // live data is fetched whenever something shows it: always on the desktop, in the editor while it shows real data
  const liveOn = () => WALL || !S.useSim;
  const hasLoc = () => SET.loc && SET.loc.lat !== null && SET.loc.lat !== '';
  // sun, moon and season for the chosen place (worked out locally, every minute)
  function updateAstro() {
    const now = tzNow(new Date()),
      lat = hasLoc() ? +SET.loc.lat : 0,
      lon = hasLoc() ? +SET.loc.lon : 0;
    const a = KLive.astro(now, lat, lon);
    if (!hasLoc()) {
      ['sunrise', 'sunset', 'csunrise', 'csunset', 'usunrise', 'usunset', 'asunrise', 'asunset'].forEach(k => {
        a[k] = '';
        a['n' + k] = '';
      });
      a.moonrise = a.moonset = '';
    }
    S.live.ai = Object.assign({}, S.live.ai, a);
  }
  function applySettings() {
    for (const sim of [S.sim, S.live]) {
      sim.settings = Object.assign({}, sim.settings, { clock24h: !!SET.clock24h });
      sim.wi = Object.assign({}, sim.wi, { tempu: SET.units.temp, speedu: SET.units.wind });
    }
    const sim = S.live;
    if (hasLoc())
      sim.li = Object.assign({}, sim.li, {
        loc: SET.loc.name,
        country: SET.loc.country,
        ccode: SET.loc.ccode,
        admin: SET.loc.admin,
        lat: +SET.loc.lat,
        lon: +SET.loc.lon,
        lplat: +SET.loc.lat,
        lplon: +SET.loc.lon
      });
    updateAstro();
    scheduleWeather(true);
    requestRender();
  }

  // ---- live weather: Open-Meteo (free, no key) or OpenWeatherMap (your API key)
  const WMO = c =>
    c === 0
      ? ['CLEAR', 'Clear']
      : c === 1
        ? ['PARTLY_CLOUDY', 'Mostly Clear']
        : c === 2
          ? ['MOSTLY_CLOUDY', 'Partly Cloudy']
          : c === 3
            ? ['CLOUDY', 'Cloudy']
            : c === 45 || c === 48
              ? ['FOG', 'Fog']
              : c >= 51 && c <= 55
                ? ['SHOWER', 'Drizzle']
                : c === 56 || c === 57 || c === 66 || c === 67
                  ? ['SLEET', 'Freezing Rain']
                  : c === 61 || (c >= 80 && c <= 82)
                    ? ['SHOWER', 'Showers']
                    : c === 63 || c === 65
                      ? ['RAIN', 'Rain']
                      : c === 71 || c === 77
                        ? ['LIGHT_SNOW', 'Light Snow']
                        : c === 73 || c === 75 || c === 85 || c === 86
                          ? ['SNOW', 'Snow']
                          : c === 95
                            ? ['TSTORM', 'Thunderstorm']
                            : c === 96 || c === 99
                              ? ['HAIL', 'Thunderstorm with Hail']
                              : ['UNKNOWN', 'Unknown'];
  const OWMC = id =>
    id >= 200 && id < 300
      ? ['TSTORM', 'Thunderstorm']
      : id < 400
        ? ['SHOWER', 'Drizzle']
        : id === 511
          ? ['SLEET', 'Freezing Rain']
          : id >= 500 && id < 600
            ? id === 500 || id >= 520
              ? ['SHOWER', 'Showers']
              : ['RAIN', 'Rain']
            : id >= 611 && id <= 616
              ? ['SLEET', 'Sleet']
              : id === 600 || id === 620
                ? ['LIGHT_SNOW', 'Light Snow']
                : id >= 600 && id < 700
                  ? ['SNOW', 'Snow']
                  : id === 781
                    ? ['TORNADO', 'Tornado']
                    : id === 741
                      ? ['FOG', 'Fog']
                      : id >= 700 && id < 800
                        ? ['MIST', 'Mist']
                        : id === 800
                          ? ['CLEAR', 'Clear']
                          : id === 801 || id === 802
                            ? ['PARTLY_CLOUDY', 'Partly Cloudy']
                            : id === 803
                              ? ['MOSTLY_CLOUDY', 'Mostly Cloudy']
                              : id === 804
                                ? ['CLOUDY', 'Cloudy']
                                : ['UNKNOWN', 'Unknown'];
  // air quality for the place (Open-Meteo, free): aq(index), aq(level), aq(label), aq(pm25)...
  async function fetchAir() {
    const L = SET.loc;
    const r = await fetch(
      'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' +
        L.lat +
        '&longitude=' +
        L.lon +
        '&current=european_aqi,us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide&timeformat=unixtime'
    );
    if (!r.ok) return null;
    const c = (await r.json()).current || {},
      i = Math.round(c.us_aqi || 0),
      lv = i <= 50 ? 1 : i <= 100 ? 2 : i <= 150 ? 3 : i <= 200 ? 4 : i <= 300 ? 5 : 6;
    return {
      index: i,
      level: lv,
      label: ['Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous'][lv - 1],
      pm10: Math.round(c.pm10 || 0),
      pm25: Math.round(c.pm2_5 || 0),
      no2: Math.round(c.nitrogen_dioxide || 0),
      o3: Math.round(c.ozone || 0),
      co: Math.round(((c.carbon_monoxide || 0) / 1000) * 100) / 100,
      so2: Math.round(c.sulphur_dioxide || 0),
      source: 'Open-Meteo',
      station: SET.loc.name || '',
      updated: c.time || Math.floor(Date.now() / 1000)
    };
  }
  async function fetchWeather() {
    const r = await fetchWeather1();
    if (r && hasLoc())
      try {
        r.aq = await fetchAir();
      } catch (e) {
        /* no air quality */
      }
    return r;
  }
  async function fetchWeather1() {
    const w = SET.weather,
      L = SET.loc;
    if (w.provider === 'sim' || L.lat === null || L.lat === '') return null;
    const F_ = SET.units.temp === 'F',
      wu = SET.units.wind;
    if (w.provider === 'openmeteo') {
      const q =
        'https://api.open-meteo.com/v1/forecast?latitude=' +
        L.lat +
        '&longitude=' +
        L.lon +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,dew_point_2m,uv_index,precipitation_probability' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset' +
        '&timezone=auto&timeformat=unixtime&forecast_days=7&temperature_unit=' +
        (F_ ? 'fahrenheit' : 'celsius') +
        '&wind_speed_unit=' +
        (wu === 'ms' ? 'ms' : wu);
      const r = await fetch(q);
      if (!r.ok) throw new Error('Open-Meteo: HTTP ' + r.status);
      const j = await r.json(),
        c = j.current,
        d = j.daily,
        cc = WMO(c.weather_code);
      const wi = {
        temp: Math.round(c.temperature_2m),
        flik: Math.round(c.apparent_temperature),
        wchill: Math.round(c.apparent_temperature),
        cond: cc[1],
        icon: cc[0],
        code: cc[0],
        hum: Math.round(c.relative_humidity_2m),
        press: Math.round(c.pressure_msl),
        wspeed: Math.round(c.wind_speed_10m),
        wdir: Math.round(c.wind_direction_10m),
        clouds: Math.round(c.cloud_cover),
        uvindex: Math.round(c.uv_index || 0),
        dpoint: Math.round(c.dew_point_2m),
        prain: Math.round(c.precipitation_probability || 0),
        updated: Math.floor(Date.now() / 1000),
        provider: 'Open-Meteo',
        tempu: SET.units.temp,
        speedu: wu
      };
      const wf = d.time.map((t, i) => {
        const dc = WMO(d.weather_code[i]);
        return {
          min: Math.round(d.temperature_2m_min[i]),
          max: Math.round(d.temperature_2m_max[i]),
          temp: Math.round((d.temperature_2m_min[i] + d.temperature_2m_max[i]) / 2),
          cond: dc[1],
          icon: dc[0],
          code: dc[0],
          wspeed: Math.round(d.wind_speed_10m_max[i]),
          wdir: Math.round(d.wind_direction_10m_dominant[i]),
          hum: wi.hum,
          rain: Math.round(d.precipitation_sum[i] * 10) / 10,
          rainc: Math.round(d.precipitation_probability_max[i] || 0),
          press: wi.press,
          clouds: wi.clouds,
          uvindex: Math.round(d.uv_index_max[i] || 0)
        };
      });
      const ai = { isday: c.is_day ? 1 : 0 };
      if (d.sunrise && d.sunrise[0]) ai.sunrise = d.sunrise[0];
      if (d.sunset && d.sunset[0]) ai.sunset = d.sunset[0];
      if (d.sunrise && d.sunrise[1]) ai.nsunrise = d.sunrise[1];
      if (d.sunset && d.sunset[1]) ai.nsunset = d.sunset[1];
      return { wi, wf, ai };
    }
    if (w.provider === 'owm') {
      if (!w.key) throw new Error('OpenWeatherMap needs an API key');
      const base = 'https://api.openweathermap.org/data/2.5/',
        qs =
          '?lat=' +
          L.lat +
          '&lon=' +
          L.lon +
          '&units=' +
          (F_ ? 'imperial' : 'metric') +
          '&appid=' +
          encodeURIComponent(w.key);
      const [r1, r2] = await Promise.all([fetch(base + 'weather' + qs), fetch(base + 'forecast' + qs)]);
      if (!r1.ok) throw new Error('OpenWeatherMap: HTTP ' + r1.status);
      const c = await r1.json(),
        fc = r2.ok ? await r2.json() : { list: [] };
      // OWM gives m/s (metric) or mph (imperial)
      const ms = v => (F_ ? v * 0.44704 : v),
        spd = v => {
          const m = ms(v);
          return Math.round(wu === 'kmh' ? m * 3.6 : wu === 'mph' ? m * 2.23694 : wu === 'kn' ? m * 1.94384 : m);
        };
      const cc = OWMC((c.weather && c.weather[0] && c.weather[0].id) || 0);
      const wi = {
        temp: Math.round(c.main.temp),
        flik: Math.round(c.main.feels_like),
        wchill: Math.round(c.main.feels_like),
        cond: cc[1],
        icon: cc[0],
        code: cc[0],
        hum: Math.round(c.main.humidity),
        press: Math.round(c.main.pressure),
        wspeed: spd(c.wind.speed),
        wdir: Math.round(c.wind.deg || 0),
        clouds: Math.round((c.clouds && c.clouds.all) || 0),
        updated: Math.floor(Date.now() / 1000),
        provider: 'OpenWeatherMap',
        tempu: SET.units.temp,
        speedu: wu
      };
      const days = new Map();
      (fc.list || []).forEach(x => {
        const k = new Date(x.dt * 1000).toDateString();
        if (!days.has(k)) days.set(k, []);
        days.get(k).push(x);
      });
      const wf = [...days.values()].map(a => {
        const mid = a[Math.floor(a.length / 2)],
          dc = OWMC((mid.weather && mid.weather[0] && mid.weather[0].id) || 0);
        return {
          min: Math.round(
            Math.min.apply(
              null,
              a.map(x => x.main.temp_min)
            )
          ),
          max: Math.round(
            Math.max.apply(
              null,
              a.map(x => x.main.temp_max)
            )
          ),
          temp: Math.round(mid.main.temp),
          cond: dc[1],
          icon: dc[0],
          code: dc[0],
          wspeed: spd(
            Math.max.apply(
              null,
              a.map(x => x.wind.speed)
            )
          ),
          wdir: Math.round(mid.wind.deg || 0),
          hum: Math.round(mid.main.humidity),
          rain: Math.round(a.reduce((t, x) => t + ((x.rain && x.rain['3h']) || 0), 0) * 10) / 10,
          rainc: Math.round(
            Math.max.apply(
              null,
              a.map(x => x.pop || 0)
            ) * 100
          ),
          press: Math.round(mid.main.pressure),
          clouds: Math.round((mid.clouds && mid.clouds.all) || 0)
        };
      });
      const ai = {};
      if (c.sys && c.sys.sunrise) ai.sunrise = c.sys.sunrise;
      if (c.sys && c.sys.sunset) ai.sunset = c.sys.sunset;
      return { wi, wf, ai };
    }
    return null;
  }
  let weatherTimer = 0,
    weatherAt = 0;
  async function refreshWeather(quiet) {
    try {
      const r = await fetchWeather();
      weatherAt = Date.now();
      if (!r) return;
      S.live.wi = Object.assign({}, S.live.wi, r.wi);
      while (r.wf.length < 7 && r.wf.length) r.wf.push(Object.assign({}, r.wf[r.wf.length - 1]));
      S.live.wf = r.wf;
      if (r.aq) S.live.aq = Object.assign({}, S.live.aq, r.aq);
      requestRender();
      if (S.panel === 'sim' && !WALL) renderSim();
      if (!quiet) toast('Weather updated: ' + r.wi.temp + '°' + SET.units.temp + ', ' + r.wi.cond);
    } catch (e) {
      if (!quiet) toast('Weather: ' + e.message);
    }
  }
  function scheduleWeather(now) {
    clearInterval(weatherTimer);
    weatherTimer = 0;
    if (SET.weather.provider === 'sim' || !liveOn()) return;
    const every = Math.max(15, +SET.weather.every || 60) * 60000;
    if (now || Date.now() - weatherAt > every) refreshWeather(true);
    weatherTimer = setInterval(() => refreshWeather(true), every);
  }
  async function findPlaces(q) {
    const r = await fetch(
      'https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=' + encodeURIComponent(q)
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return ((await r.json()).results || []).map(x => ({
      name: x.name,
      lat: Math.round(x.latitude * 10000) / 10000,
      lon: Math.round(x.longitude * 10000) / 10000,
      country: x.country || '',
      ccode: x.country_code || '',
      admin: x.admin1 || '',
      tz: x.timezone || ''
    }));
  }
  function settingsDialog() {
    const T = JSON.parse(JSON.stringify(SET));
    const sel = (val, opts, on) =>
      h(
        'select',
        { onchange: e => on(e.target.value) },
        opts.map(o => h('option', { value: o[0], text: o[1], selected: String(o[0]) === String(val) }))
      );
    const ck = (val, label, on) =>
      h(
        'label',
        { class: 'ck' },
        h('input', { type: 'checkbox', checked: !!val, onchange: e => on(e.target.checked) }),
        h('span', { text: label })
      );
    const keyRow = h('input', {
      type: 'password',
      placeholder: 'API key from openweathermap.org',
      value: T.weather.key,
      oninput: e => {
        T.weather.key = e.target.value.trim();
      }
    });
    const keyWrap = h('div', { class: 'row2' }, keyRow);
    const showKey = () => {
      keyWrap.style.display = T.weather.provider === 'owm' ? '' : 'none';
      keyLbl.style.display = keyWrap.style.display;
    };
    const keyLbl = h('span', { text: 'API key' });
    const locTxt = h('span', { class: 'hint' });
    const showLoc = () => {
      locTxt.textContent =
        T.loc.lat === null || T.loc.lat === ''
          ? 'No location set'
          : [T.loc.name, T.loc.admin, T.loc.country].filter(Boolean).join(', ') +
            '  (' +
            T.loc.lat +
            ', ' +
            T.loc.lon +
            ')';
    };
    const results = h('div', { class: 'locres' });
    const q = h('input', { placeholder: 'City or town', value: T.loc.name });
    const search = async () => {
      results.innerHTML = '';
      if (!q.value.trim()) return;
      results.append(h('span', { class: 'hint', text: 'Searching…' }));
      try {
        const list = await findPlaces(q.value.trim());
        results.innerHTML = '';
        if (!list.length) results.append(h('span', { class: 'hint', text: 'Nothing found' }));
        list.forEach(pl =>
          results.append(
            h('button', {
              text: [pl.name, pl.admin, pl.country].filter(Boolean).join(', ') + '   ' + pl.lat + ', ' + pl.lon,
              onclick: () => {
                T.loc = {
                  name: pl.name,
                  lat: pl.lat,
                  lon: pl.lon,
                  country: pl.country,
                  ccode: pl.ccode,
                  admin: pl.admin
                };
                results.innerHTML = '';
                showLoc();
              }
            })
          )
        );
      } catch (e) {
        results.innerHTML = '';
        results.append(h('span', { class: 'hint', text: 'Search failed: ' + e.message }));
      }
    };
    q.onkeydown = e => {
      if (e.key === 'Enter') search();
    };
    let zones = [];
    try {
      zones = Intl.supportedValuesOf('timeZone');
    } catch (e) {
      zones = [];
    }
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone || 'this computer';
    const body = h(
      'div',
      { class: 'setform' },
      h('div', { class: 'sh', text: 'Weather' }),
      h('span', { text: 'Provider' }),
      sel(
        T.weather.provider,
        [
          ['sim', 'None'],
          ['openmeteo', 'Open-Meteo (free, no key)'],
          ['owm', 'OpenWeatherMap (needs a key)']
        ],
        v => {
          T.weather.provider = v;
          showKey();
        }
      ),
      keyLbl,
      keyWrap,
      h('span', { text: 'Update every' }),
      sel(
        T.weather.every,
        [
          [15, '15 minutes'],
          [30, '30 minutes'],
          [60, '1 hour'],
          [120, '2 hours'],
          [240, '4 hours']
        ],
        v => {
          T.weather.every = +v;
        }
      ),
      h('div', { class: 'sh', text: 'Location' }),
      h('span', { text: 'Find a place' }),
      h('div', { class: 'row2' }, q, h('button', { class: 'btn', text: 'Search', onclick: search })),
      results,
      h('span', { text: 'Using' }),
      locTxt,
      h('div', { class: 'sh', text: 'Units and time' }),
      h('span', { text: 'Temperature' }),
      sel(
        T.units.temp,
        [
          ['C', 'Celsius (°C)'],
          ['F', 'Fahrenheit (°F)']
        ],
        v => {
          T.units.temp = v;
        }
      ),
      h('span', { text: 'Wind speed' }),
      sel(
        T.units.wind,
        [
          ['kmh', 'km/h'],
          ['mph', 'mph'],
          ['ms', 'm/s'],
          ['kn', 'knots']
        ],
        v => {
          T.units.wind = v;
        }
      ),
      h('span', { text: 'Clock' }),
      sel(
        T.clock24h ? '24' : '12',
        [
          ['12', '12-hour (3:45 PM)'],
          ['24', '24-hour (15:45)']
        ],
        v => {
          T.clock24h = v === '24';
        }
      ),
      h('span', { text: 'Time zone' }),
      sel(T.tz, [['', 'Automatic (' + here + ')']].concat(zones.map(z => [z, z.replace(/_/g, ' ')])), v => {
        T.tz = v;
      }),
      h('div', { class: 'sh', text: 'Editor' }),
      h('span'),
      h('div', {
        class: 'note',
        text: "The editor shows either the simulated data from the Device data panel or this PC's real data (the button with the phone in the preview controls). The desktop wallpaper always uses real data, unless \"Use the editor's simulated data\" is ticked in the tray icon's menu."
      }),
      h('div', { class: 'sh', text: 'Windows desktop' }),
      h('span', { text: 'Wallpaper frame rate' }),
      sel(
        T.fps || 60,
        [
          [15, '15 fps (lightest)'],
          [30, '30 fps'],
          [60, '60 fps (smoothest)']
        ],
        v => {
          T.fps = +v;
        }
      ),
      h('div', {
        class: 'note',
        text: 'Lower frame rates use less processor time; the wallpaper only redraws when something on it changes.'
      })
    );
    showKey();
    showLoc();
    dialog(
      'Settings',
      body,
      [
        ['Cancel'],
        [
          'Save',
          () => {
            SET = T;
            saveSettings();
            applySettings();
            if (SET.weather.provider !== 'sim' && liveOn()) refreshWeather(false);
          },
          true
        ]
      ],
      true
    );
  }

  // ---- an app-style right-click menu (the browser's own menu is switched off in the Windows app)
  function ctxMenu(e) {
    if (e.defaultPrevented) return; // the preview's own item menu
    const t = e.target,
      edit = t.closest && t.closest('input, textarea, [contenteditable]');
    document.querySelectorAll('.ctxmenu').forEach(x => x.remove());
    e.preventDefault();
    if (!edit) return;
    const ro = edit.readOnly || edit.disabled,
      sel = edit.selectionStart !== undefined && edit.selectionStart !== edit.selectionEnd;
    const close = () => m.remove();
    const item = (label, kbd, on, ok) =>
      h(
        'button',
        {
          disabled: !ok,
          onpointerdown: ev => ev.preventDefault(),
          onclick: () => {
            close();
            edit.focus();
            on();
          }
        },
        h('span', { text: label }),
        h('kbd', { text: kbd })
      );
    const m = h(
      'div',
      { class: 'ctxmenu' },
      item('Cut', 'Ctrl+X', () => document.execCommand('cut'), sel && !ro),
      item('Copy', 'Ctrl+C', () => document.execCommand('copy'), sel),
      item(
        'Paste',
        'Ctrl+V',
        async () => {
          try {
            const txt = await navigator.clipboard.readText();
            document.execCommand('insertText', false, txt);
          } catch (err) {
            toast('Use Ctrl+V to paste here');
          }
        },
        !ro
      ),
      h('hr'),
      item('Select all', 'Ctrl+A', () => edit.select && edit.select(), true)
    );
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(e.clientX, innerWidth - r.width - 4) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - r.height - 4) + 'px';
    setTimeout(() => {
      const off = ev => {
        if (!m.contains(ev.target)) {
          close();
          document.removeEventListener('pointerdown', off, true);
        }
      };
      document.addEventListener('pointerdown', off, true);
    });
  }
  function viewOpts(v) {
    return {
      pxW: v.w,
      pxH: v.h,
      screens: S.screens,
      scroll: Math.max(0, Math.min(S.scroll, S.screens - 1)),
      yscreens: S.yscreens,
      yscroll: Math.max(0, Math.min(S.yscroll, S.yscreens - 1)),
      locked: S.locked,
      play: S.play,
      now: simNow(),
      uiScale: WALL || v.desk ? deskScale() : 1
    };
  }
  function renderAll() {
    raf = 0;
    if (!S.preset || S.paused) return;
    // the preview waits while a save builds its thumbnails, so a busy theme does not slow the save down
    if (exportBusy) {
      exportMissed = true;
      return;
    }
    lastFrame = performance.now();
    clearTimeout(wakeTimer);
    wakeTimer = 0;
    let animating = false,
      wake = Infinity;
    const sel = cur(),
      time = (performance.now() - S.t0) / 1000;
    S.views.forEach(v => {
      if (!v.canvas) return;
      v.rt.time = time;
      v.opts = viewOpts(v);
      R.render(v.canvas, state(), v.opts, v.rt);
      animating = animating || v.rt.animating;
      wake = Math.min(wake, v.rt.wakeIn || Infinity);
      v.rt.trim(v.canvas.width * v.canvas.height * (WALL ? 1.5 : 3));
      if (WALL) return;
      const o = v.overlay.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, v.overlay.width, v.overlay.height);
      // ticked items in the list: each gets a thin outline, and one box goes round all of them
      const ticked =
        !S.touch && S.panel !== 'sim' && S.checked.size && sel && sel.viewgroup_items
          ? [...S.checked].map(i => sel.viewgroup_items[i]).filter(Boolean)
          : [];
      if (ticked.length) {
        let L = Infinity,
          T = Infinity,
          Rr = -Infinity,
          B = -Infinity;
        const px = v.canvas.width / (parseFloat(v.canvas.style.width) || v.canvas.width);
        v.rt.hits.forEach(hh => {
          if (ticked.indexOf(hh.m) < 0) return;
          o.setTransform(hh.mt);
          const k = Math.sqrt(Math.abs(hh.mt.a * hh.mt.d - hh.mt.b * hh.mt.c)) || 1;
          o.lineWidth = 1.5 / k;
          o.strokeStyle = 'rgba(0,229,255,.9)';
          o.setLineDash([]);
          o.strokeRect(0, 0, hh.w, hh.h);
          const bx = hitBox(v, hh);
          L = Math.min(L, bx.l);
          T = Math.min(T, bx.t);
          Rr = Math.max(Rr, bx.r);
          B = Math.max(B, bx.b);
        });
        if (isFinite(L)) {
          o.setTransform(1, 0, 0, 1, 0, 0);
          o.lineWidth = 2 * px;
          o.strokeStyle = '#ff4081';
          o.setLineDash([6 * px, 4 * px]);
          o.strokeRect(L * px - 2 * px, T * px - 2 * px, (Rr - L) * px + 4 * px, (B - T) * px + 4 * px);
        }
      }
      if (S.marquee && S.marquee.v === v) {
        const mq = S.marquee,
          px = v.canvas.width / (parseFloat(v.canvas.style.width) || v.canvas.width);
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.setLineDash([]);
        o.fillStyle = 'rgba(255,64,129,.12)';
        o.strokeStyle = '#ff4081';
        o.lineWidth = px;
        const x = Math.min(mq.x0, mq.x1) * px,
          y = Math.min(mq.y0, mq.y1) * px,
          w = Math.abs(mq.x1 - mq.x0) * px,
          hgt = Math.abs(mq.y1 - mq.y0) * px;
        o.fillRect(x, y, w, hgt);
        o.strokeRect(x + 0.5, y + 0.5, w, hgt);
      }
      if (S.path.length && !S.touch && S.panel !== 'sim' && !ticked.length)
        v.rt.hits.forEach(hh => {
          if (hh.m !== sel) return;
          o.setTransform(hh.mt);
          const k = Math.sqrt(Math.abs(hh.mt.a * hh.mt.d - hh.mt.b * hh.mt.c)) || 1;
          o.lineWidth = 2 / k;
          o.strokeStyle = '#ff4081';
          o.setLineDash([6 / k, 4 / k]);
          o.strokeRect(0, 0, hh.w, hh.h);
        });
      // snapping guides while an item is dragged
      const gd = S.guides;
      if (gd && gd.view === v) {
        const px = v.canvas.width / (parseFloat(v.canvas.style.width) || v.canvas.width);
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.setLineDash([]);
        o.lineWidth = Math.max(1, px);
        o.strokeStyle = '#00e5ff';
        o.beginPath();
        gd.xs.forEach(x => {
          const X = Math.round(x * px) + 0.5;
          o.moveTo(X, 0);
          o.lineTo(X, v.overlay.height);
        });
        gd.ys.forEach(y => {
          const Y = Math.round(y * px) + 0.5;
          o.moveTo(0, Y);
          o.lineTo(v.overlay.width, Y);
        });
        o.stroke();
      }
    });
    const st = $('#status');
    if (st) {
      const v = S.views[0];
      st.textContent =
        v && v.opts
          ? Math.round(v.opts.kw) +
            ' × ' +
            Math.round(v.opts.kh) +
            ' kp' +
            (v.rt.formulaErrors ? '  ·  ' + v.rt.formulaErrors + ' formula error(s)' : '')
          : '';
    }
    if (animating)
      requestRender(); // only loops, visualizers and running transitions need a new frame
    else if (wake < Infinity) wakeTimer = setTimeout(requestRender, wake); // a GIF: wake for its next frame
  }
  setInterval(() => {
    if (!raf) requestRender();
  }, 1000);

  function layoutViews() {
    const stage = $('#stage');
    stage.innerHTML = '';
    if (WALL) {
      const d = Math.min(2, window.devicePixelRatio || 1),
        v = S.views[0];
      S.views.length = 1;
      v.w = Math.max(16, Math.round(window.innerWidth * d));
      v.h = Math.max(16, Math.round(window.innerHeight * d));
      v.name = 'Custom';
      if (S.wallFit === 'phone' && S.preset) {
        const i = S.preset.preset_info || {},
          pw = Math.min(i.width || 9, i.height || 20),
          ph = Math.max(i.width || 9, i.height || 20);
        v.w = Math.max(16, Math.min(v.w, Math.round((v.h * pw) / ph)));
      }
    }
    const bare = S.fs || matchMedia('(max-width:860px)').matches,
      padH = S.fs ? 0 : bare ? 8 : 52,
      padW = S.fs ? 0 : bare ? 16 : 28;
    const availH = Math.max(160, stage.clientHeight - padH),
      availW = Math.max(120, (stage.clientWidth - padW - (S.views.length - 1) * 18) / S.views.length);
    S.views.forEach((v, i) => {
      const k = Math.min(availH / v.h, availW / v.w),
        cw = Math.round(v.w * k),
        ch = Math.round(v.h * k),
        dpr = Math.min(2, window.devicePixelRatio || 1);
      v.canvas = h('canvas', {
        width: Math.round(cw * dpr),
        height: Math.round(ch * dpr),
        style: { width: cw + 'px', height: ch + 'px' }
      });
      // the selection overlay; the wallpaper never shows one, so it gets a 1x1 placeholder
      v.overlay = h('canvas', {
        class: 'ovl',
        width: WALL ? 1 : Math.round(cw * dpr),
        height: WALL ? 1 : Math.round(ch * dpr),
        style: { width: cw + 'px', height: ch + 'px' }
      });
      if (!S.monitors.length) S.monitors = readMonitors();
      const groups = [
        ['Phones and tablets', 'd', DEVICES],
        ['Desktop', 'k', DESKTOPS],
        ["This PC's monitors", 'm', S.monitors]
      ];
      const lists = { d: DEVICES, k: DESKTOPS, m: S.monitors };
      const sel = h(
        'select',
        {
          title: 'Preview size: a phone, a desktop size, or one of the monitors plugged into this PC',
          onchange: e => {
            const val = e.target.value;
            if (val === 'detect') return detectMonitors();
            const d = (lists[val[0]] || [])[+val.slice(2)];
            if (d) {
              v.name = d[0];
              v.w = d[1];
              v.h = d[2];
              v.desk = val[0] !== 'd';
            } else v.name = 'Custom';
            layoutViews();
          }
        },
        groups.map(g =>
          h(
            'optgroup',
            { label: g[0] },
            g[2].map((d, di) => h('option', { value: g[1] + ':' + di, text: d[0], selected: d[0] === v.name }))
          )
        ),
        h(
          'optgroup',
          { label: 'Other' },
          h('option', { value: '-1', text: 'Custom', selected: v.name === 'Custom' }),
          !HOST && window.getScreenDetails ? h('option', { value: 'detect', text: 'Find all my monitors…' }) : null
        )
      );
      const mv = S.meta.view,
        isDefault = !!mv && mv.w === v.w && mv.h === v.h;
      const pin = h('button', {
        class: 'ib' + (isDefault ? ' on' : ''),
        title: isDefault
          ? "This is the theme's default preview size (click to clear it)"
          : 'Make this the default preview size for this theme (saved inside the .klwp, invisible to KLWP)',
        text: isDefault ? '★' : '☆',
        onclick: () => {
          if (isDefault) delete S.meta.view;
          else S.meta.view = { name: v.name, w: v.w, h: v.h, desk: !!v.desk };
          saveMeta(true);
          toast(isDefault ? 'Default preview size cleared' : 'Saved as this theme’s default preview size');
          layoutViews();
        }
      });
      const scaleIn =
        v.desk &&
        h(
          'label',
          {
            class: 'dscale',
            title:
              'Desktop scale for this theme: how big Kustom units are on a monitor. 100% is what KLWP would do; phone themes usually look right around 50-70%. Used by the desktop wallpaper too.'
          },
          h('span', { text: 'Scale' }),
          h('input', {
            type: 'number',
            min: 10,
            max: 400,
            step: 5,
            value: Math.round(deskScale() * 100),
            onchange: e => {
              const n = Math.max(10, Math.min(400, Math.round(+e.target.value || 100)));
              e.target.value = n;
              if (n === 100) delete S.meta.deskScale;
              else S.meta.deskScale = n;
              saveMeta(true);
              requestRender();
            }
          }),
          h('span', { text: '%' })
        );
      const setDim = () => {
        const a = ratioIn.value.trim();
        let m = /^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/i.exec(a);
        if (!m) {
          ratioIn.value = v.w + '×' + v.h;
          return;
        }
        let w = parseFloat(m[1]),
          hh = parseFloat(m[2]);
        if (w < 100 && hh < 100) {
          const long = Math.max(w, hh),
            sh = Math.min(w, hh);
          const pw = 1080,
            ph = Math.round((1080 * long) / sh);
          if (w > hh) {
            w = ph;
            hh = pw;
          } else {
            w = pw;
            hh = ph;
          }
        }
        v.w = Math.round(w);
        v.h = Math.round(hh);
        v.name = 'Custom';
        v.desk = v.w > v.h && v.w >= 1280;
        layoutViews();
      };
      const ratioIn = h('input', {
        class: 'dim',
        value: v.w + '×' + v.h,
        title: 'Resolution (1080x2400) or aspect ratio (20:9)',
        onchange: setDim,
        onkeydown: e => {
          if (e.key === 'Enter') setDim();
        }
      });
      const wrap = h('div', { class: 'cv', style: { width: cw + 'px', height: ch + 'px' } }, v.canvas, v.overlay);
      bindCanvas(v, wrap);
      stage.append(
        h(
          'div',
          { class: 'view' },
          h(
            'div',
            { class: 'viewbar' },
            sel,
            ratioIn,
            scaleIn,
            pin,
            h('button', {
              class: 'ib',
              title: 'Rotate (portrait / landscape)',
              text: '⟳',
              onclick: () => {
                const t = v.w;
                v.w = v.h;
                v.h = t;
                layoutViews();
              }
            }),
            S.views.length > 1 &&
              h('button', {
                class: 'ib',
                title: 'Remove this preview',
                text: '✕',
                onclick: () => {
                  S.views.splice(i, 1);
                  layoutViews();
                }
              })
          ),
          wrap,
          h('div', { class: 'ratio', text: ratioLabel(v.w, v.h) })
        )
      );
    });
    requestRender();
  }
  function ratioLabel(w, hh) {
    const long = Math.max(w, hh),
      sh = Math.min(w, hh);
    return Math.round((long / sh) * 9 * 100) / 100 + ':9  ·  ' + w + '×' + hh + ' px';
  }

  // canvas interaction: select / drag / touch-test
  // the item a click selects: the deepest one under the pointer whose group is the selection or one of its
  // groups, so the outermost group is picked first and each further click goes one level in
  const isPrefix = (a, b) => a.length <= b.length && a.every((x, i) => x === b[i]);
  function groupFirstPick(hits) {
    let best = null,
      bestLen = -1;
    for (let i = hits.length - 1; i >= 0; i--) {
      const p = findPath(hits[i].m);
      if (!p || !isPrefix(p.slice(0, -1), S.path)) continue;
      if (p.length > bestLen) {
        best = hits[i];
        bestLen = p.length;
      }
    }
    return best;
  }
  // a selection box: ticks every item of the listed group whose visible part is mostly inside it
  function marqueeSelect(mq) {
    const v = mq.v,
      l = Math.min(mq.x0, mq.x1),
      r = Math.max(mq.x0, mq.x1),
      t = Math.min(mq.y0, mq.y1),
      b = Math.max(mq.y0, mq.y1);
    // the group whose items the list shows: the selected group, else the group of the selected item
    let gp = S.path.slice();
    let g = modAt(gp);
    if (!g || !g.viewgroup_items || g.internal_type === 'KomponentModule') {
      gp = gp.slice(0, -1);
      g = modAt(gp);
    }
    if (!g || !g.viewgroup_items) return;
    const found = new Set();
    v.rt.hits.forEach(hh => {
      const i = g.viewgroup_items.indexOf(hh.m);
      if (i < 0 || isLocked(hh.m)) return;
      const bx = hitBox(v, hh);
      // what is on screen of the item, and how much of that the box covers
      const cw = parseFloat(v.canvas.style.width) || v.canvas.getBoundingClientRect().width,
        ch = parseFloat(v.canvas.style.height) || v.canvas.getBoundingClientRect().height;
      const vl = Math.max(0, bx.l),
        vr = Math.min(cw, bx.r),
        vt = Math.max(0, bx.t),
        vb = Math.min(ch, bx.b);
      const vis = Math.max(0, vr - vl) * Math.max(0, vb - vt);
      const cov = Math.max(0, Math.min(vr, r) - Math.max(vl, l)) * Math.max(0, Math.min(vb, b) - Math.max(vt, t));
      if (vis > 0 && cov / vis >= 0.6) found.add(i);
    });
    S.path = gp;
    S.tab = 'items';
    S.checked = found;
    if (S.panel === 'sim') {
      S.panel = 'edit';
      $('#sim').classList.remove('on');
    }
    renderEditor();
    toast(found.size ? found.size + ' item' + (found.size === 1 ? '' : 's') + ' ticked' : 'Nothing inside the box');
  }
  function hitAt(v, e) {
    const r = v.canvas.getBoundingClientRect(),
      x = ((e.clientX - r.left) * v.canvas.width) / r.width,
      y = ((e.clientY - r.top) * v.canvas.height) / r.height;
    const out = [];
    v.rt.hits.forEach(hh => {
      try {
        const p = hh.mt.inverse().transformPoint(new DOMPoint(x, y));
        if (p.x >= 0 && p.y >= 0 && p.x <= hh.w && p.y <= hh.h) out.push(hh);
      } catch (err) {
        /* singular */
      }
    });
    return out;
  }
  // glide the preview to a screen, like a launcher settling on a page
  let scrollAnim = 0;
  function scrollTo(target, ms, axis) {
    cancelAnimationFrame(scrollAnim);
    const y = axis === 'y',
      key = y ? 'yscroll' : 'scroll',
      from = S[key],
      t0 = performance.now();
    target = Math.max(0, Math.min((y ? S.yscreens : S.screens) - 1, target));
    const step = now => {
      const k = Math.min(1, (now - t0) / (ms || 260)),
        e = 1 - Math.pow(1 - k, 3);
      S[key] = from + (target - from) * e;
      syncBar();
      requestRender();
      if (k < 1) scrollAnim = requestAnimationFrame(step);
    };
    scrollAnim = requestAnimationFrame(step);
  }
  function fireTouch(v, e, type) {
    const hits = hitAt(v, e).filter(x => x.m !== root());
    for (let i = hits.length - 1; i >= 0; i--) {
      const evs = (hits[i].m.internal_events || []).filter(ev => (ev.type || 'SINGLE_TAP') === type);
      if (evs.length) {
        runEvents(hits[i].m, v, evs);
        return true;
      }
    }
    const rs = (root().internal_events || []).filter(ev => (ev.type || 'SINGLE_TAP') === type);
    if (rs.length) {
      runEvents(root(), v, rs);
      return true;
    }
    return false;
  }
  // an item marked "not selectable" (or inside one) lets clicks fall through to what is under it.
  // The flag is an extra key on the item; KLWP ignores keys it does not know and drops them when it saves.
  const NOSEL = 'kwlwp_noselect';
  function isLocked(m) {
    if (!m) return false;
    if (m[NOSEL]) return true;
    const p = findPath(m);
    if (!p) return false;
    for (let i = 0; i < p.length; i++) {
      const a = modAt(p.slice(0, i));
      if (a && a[NOSEL]) return true;
    }
    return false;
  }
  // corners of a hit box in css pixels relative to the canvas
  function hitBox(v, hh) {
    const px = v.canvas.width / v.canvas.getBoundingClientRect().width;
    let l = Infinity,
      t = Infinity,
      r = -Infinity,
      b = -Infinity;
    [
      [0, 0],
      [hh.w, 0],
      [0, hh.h],
      [hh.w, hh.h]
    ].forEach(c => {
      const q = hh.mt.transformPoint(new DOMPoint(c[0], c[1]));
      l = Math.min(l, q.x / px);
      r = Math.max(r, q.x / px);
      t = Math.min(t, q.y / px);
      b = Math.max(b, q.y / px);
    });
    return { l, t, r, b };
  }
  function snapTargets(v, m) {
    const rc = v.canvas.getBoundingClientRect(),
      xs = [0, rc.width / 2, rc.width],
      ys = [0, rc.height / 2, rc.height],
      sib = root().viewgroup_items || [];
    v.rt.hits.forEach(hh => {
      if (hh.m === m || sib.indexOf(hh.m) < 0) return;
      const b = hitBox(v, hh);
      if (!isFinite(b.l) || b.r - b.l < 1) return;
      xs.push(b.l, (b.l + b.r) / 2, b.r);
      ys.push(b.t, (b.t + b.b) / 2, b.b);
    });
    return { xs, ys };
  }
  // move by d, nudged so an edge or the centre of the box lands on a target within 6 px
  function snapAxis(lo, hi, d, targets, out) {
    const feats = [lo, (lo + hi) / 2, hi];
    let best = null;
    feats.forEach(f => {
      targets.forEach(t => {
        const g = t - (f + d);
        if (Math.abs(g) <= 6 && (!best || Math.abs(g) < Math.abs(best.g))) best = { g, t };
      });
    });
    if (!best) return d;
    d += best.g;
    feats.forEach(f => {
      targets.forEach(t => {
        if (Math.abs(t - (f + d)) < 0.5 && !out.some(o => Math.abs(o - t) < 0.5)) out.push(t);
      });
    });
    return d;
  }
  function bindCanvas(v, el) {
    let drag = null,
      marquee = null,
      descend = null,
      touch = null,
      lastTap = 0;
    const ripple = e => {
      const r = el.getBoundingClientRect(),
        d = h('i', { class: 'ripple', style: { left: e.clientX - r.left + 'px', top: e.clientY - r.top + 'px' } });
      el.append(d);
      setTimeout(() => d.remove(), 450);
    };
    el.addEventListener('pointerdown', e => {
      if (S.touch) {
        // a finger: drag sideways to change screen, tap / hold to trigger touch actions
        cancelAnimationFrame(scrollAnim);
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {
          /* synthetic pointer */
        }
        touch = {
          x: e.clientX,
          y: e.clientY,
          s0: S.scroll,
          ys0: S.yscroll,
          axis: null,
          ly: e.clientY,
          vy: 0,
          h: el.getBoundingClientRect().height,
          t: performance.now(),
          moved: false,
          held: false,
          lx: e.clientX,
          lt: performance.now(),
          vx: 0,
          w: el.getBoundingClientRect().width
        };
        {
          const mine = touch;
          touch.hold = setTimeout(
            () =>
              requestAnimationFrame(() => {
                if (touch === mine && !touch.moved) {
                  touch.held = true;
                  ripple(e);
                  if (!fireTouch(v, e, 'LONG_PRESS')) toast('No long-press action here');
                }
              }),
            550
          );
        }
        fireTouch(v, e, 'TOUCH_DOWN');
        return;
      }
      const hits = hitAt(v, e).filter(x => x.m !== root() && !isLocked(x.m));
      // drag on empty space (or Shift+drag anywhere) draws a selection box
      if (!hits.length || e.shiftKey) {
        const r = v.canvas.getBoundingClientRect();
        marquee = {
          v,
          x0: e.clientX - r.left,
          y0: e.clientY - r.top,
          x1: e.clientX - r.left,
          y1: e.clientY - r.top,
          moved: false,
          empty: !hits.length
        };
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {
          /* synthetic pointer */
        }
        return;
      }
      const selM = cur();
      // a click picks the outermost group first; with a group selected, the next click picks inside it (Alt picks
      // the top-most item under the pointer straight away)
      let pick = e.altKey ? hits[hits.length - 1] : groupFirstPick(hits) || hits[hits.length - 1];
      const again = hits.find(x => x.m === selM);
      // clicking the selection again keeps it (so it can be dragged); letting go without moving steps inside
      if (again && !e.altKey) {
        pick = again;
        descend = { hits };
      } else descend = null;
      if (pick.m !== selM) {
        const p = findPath(pick.m);
        if (p) {
          S.path = p;
          S.tab = null;
          S.checked.clear();
          if (S.panel === 'sim') {
            S.panel = 'edit';
            $('#sim').classList.remove('on');
          }
          renderEditor();
          requestRender();
        }
      }
      const m = pick.m,
        k = Math.sqrt(Math.abs(pick.mt.a * pick.mt.d - pick.mt.b * pick.mt.c)) || 1,
        r = v.canvas.getBoundingClientRect(),
        px = v.canvas.width / r.width;
      const tg = m.internal_toggles || {};
      const parent = modAt(S.path.slice(0, -1));
      // only an item that was already selected can be dragged; the click that selects it never moves it
      if (
        pick.m === selM &&
        parent &&
        S.path.length === 1 && // only items on the root have X/Y offsets; inside groups KLWP places items by anchor and padding
        !tg.position_offset_x &&
        !tg.position_offset_y
      ) {
        const an = String(m.position_anchor || (S.path.length === 1 ? 'TOP' : 'CENTER'));
        drag = {
          m,
          x: e.clientX,
          y: e.clientY,
          ox: m.position_offset_x || 0,
          oy: m.position_offset_y || 0,
          k: k / px,
          box: hitBox(v, pick),
          tg: snapTargets(v, m),
          moved: false,
          sx: /RIGHT/.test(an) ? -1 : 1,
          sy: /^BOTTOM/.test(an) ? -1 : 1
        };
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* synthetic pointer */
      }
    });
    el.addEventListener('pointermove', e => {
      if (touch) {
        const dx = e.clientX - touch.x,
          now = performance.now();
        if (!touch.moved && Math.abs(dx) + Math.abs(e.clientY - touch.y) > 8) {
          touch.moved = true;
          clearTimeout(touch.hold);
        }
        // the first clear movement decides: sideways turns horizontal screens, up/down turns vertical ones
        if (touch.moved && !touch.axis)
          touch.axis = Math.abs(e.clientY - touch.y) > Math.abs(dx) && S.yscreens > 1 ? 'y' : 'x';
        if (touch.moved && !touch.held && touch.axis === 'x' && S.screens > 1) {
          S.scroll = Math.max(-0.12, Math.min(S.screens - 1 + 0.12, touch.s0 - dx / touch.w));
          syncBar();
          requestRender();
        }
        if (touch.moved && !touch.held && touch.axis === 'y') {
          S.yscroll = Math.max(-0.12, Math.min(S.yscreens - 1 + 0.12, touch.ys0 - (e.clientY - touch.y) / touch.h));
          syncBar();
          requestRender();
        }
        if (now - touch.lt > 16) {
          touch.vx = (e.clientX - touch.lx) / (now - touch.lt);
          touch.vy = (e.clientY - touch.ly) / (now - touch.lt);
          touch.lx = e.clientX;
          touch.ly = e.clientY;
          touch.lt = now;
        }
        return;
      }
      if (marquee) {
        const r = v.canvas.getBoundingClientRect();
        marquee.x1 = e.clientX - r.left;
        marquee.y1 = e.clientY - r.top;
        if (Math.abs(marquee.x1 - marquee.x0) + Math.abs(marquee.y1 - marquee.y0) > 4) marquee.moved = true;
        S.marquee = marquee.moved ? marquee : null;
        requestRender();
        return;
      }
      if (!drag) return;
      let cx = e.clientX - drag.x,
        cy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(cx) + Math.abs(cy) < 4) return;
      if (!drag.moved) {
        snapshot();
        drag.moved = true;
      }
      // snap edges and centres to the screen and to the other items, like a design app (hold Alt to move freely)
      const gx = [],
        gy = [];
      if (S.snap && !e.altKey && isFinite(drag.box.l)) {
        cx = snapAxis(drag.box.l, drag.box.r, cx, drag.tg.xs, gx);
        cy = snapAxis(drag.box.t, drag.box.b, cy, drag.tg.ys, gy);
      }
      S.guides = gx.length || gy.length ? { view: v, xs: gx, ys: gy } : null;
      drag.m.position_offset_x = Math.round(drag.ox + (cx / drag.k) * drag.sx);
      drag.m.position_offset_y = Math.round(drag.oy + (cy / drag.k) * drag.sy);
      requestRender();
    });
    const up = e => {
      if (touch) {
        const t = touch;
        touch = null;
        clearTimeout(t.hold);
        fireTouch(v, e, 'TOUCH_UP');
        if (t.moved) {
          // settle on a page: a quick flick or a drag past a third of the screen turns the page
          const y = t.axis === 'y',
            from = Math.round(y ? t.ys0 : t.s0),
            d = y ? S.yscroll - t.ys0 : S.scroll - t.s0,
            v = y ? t.vy : t.vx;
          let target = from;
          if (Math.abs(v) > 0.45 && performance.now() - t.lt < 90) target = from + (v < 0 ? 1 : -1);
          else if (Math.abs(d) > 0.33) target = from + Math.sign(d);
          scrollTo(target, 280, y ? 'y' : 'x');
          return;
        }
        if (t.held) return;
        ripple(e);
        const now = performance.now();
        if (now - lastTap < 320 && fireTouch(v, e, 'DOUBLE_TAP')) {
          lastTap = 0;
          return;
        }
        lastTap = now;
        if (!fireTouch(v, e, 'SINGLE_TAP')) toast('No touch action here');
        return;
      }
      if (marquee) {
        const mq = marquee;
        marquee = null;
        S.marquee = null;
        if (mq.moved) marqueeSelect(mq);
        else if (mq.empty) {
          S.path = [];
          S.tab = null;
          S.checked.clear();
          renderEditor();
        }
        requestRender();
        return;
      }
      if (descend && !(drag && drag.moved)) {
        const inner = groupFirstPick(descend.hits);
        if (inner && inner.m !== cur()) {
          const p = findPath(inner.m);
          if (p) {
            S.path = p;
            S.tab = null;
            S.checked.clear();
            renderEditor();
            requestRender();
          }
        }
      }
      descend = null;
      if (drag && drag.moved) renderEditor();
      drag = null;
      if (S.guides) {
        S.guides = null;
        requestRender();
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => {
      marquee = null;
      descend = null;
      S.marquee = null;
      if (touch) {
        clearTimeout(touch.hold);
        touch = null;
        scrollTo(Math.round(S.scroll));
      }
      drag = null;
      S.guides = null;
    });
    el.addEventListener(
      'wheel',
      e => {
        // the wheel turns horizontal screens; Shift+wheel (or a preset with only vertical screens) turns vertical ones
        const yAxis = (e.shiftKey && S.yscreens > 1) || (S.screens < 2 && S.yscreens > 1);
        if (!S.touch || (yAxis ? S.yscreens : S.screens) < 2) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 4) return;
        if (el._wl && performance.now() - el._wl < 350) return;
        el._wl = performance.now();
        if (yAxis) scrollTo(Math.round(S.yscroll) + (d > 0 ? 1 : -1), 260, 'y');
        else scrollTo(Math.round(S.scroll) + (d > 0 ? 1 : -1));
      },
      { passive: false }
    );
    // right-click on an item in the preview: quick actions on it (select mode only)
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (S.touch) return;
      const hits = hitAt(v, e).filter(x => x.m !== root() && !isLocked(x.m));
      if (!hits.length) return;
      const selM = cur();
      const pick = hits.find(x => x.m === selM) || hits[hits.length - 1];
      const p = findPath(pick.m);
      if (!p) return;
      S.path = p;
      S.tab = null;
      S.checked.clear();
      renderEditor();
      requestRender();
      itemMenu(e.clientX, e.clientY);
    });
    el.addEventListener('dblclick', e => {
      if (S.touch) return;
      const hits = hitAt(v, e).filter(x => x.m !== root() && !isLocked(x.m));
      if (hits.length) {
        const p = findPath(hits[hits.length - 1].m);
        if (p) {
          S.path = p;
          S.tab = null;
          renderEditor();
          requestRender();
        }
      }
    });
  }
  // the quick-action menu for the selected item. Order in the item list is drawing order: later items are on top.
  // fromList: the menu was opened on a row of the item list, which stays open afterwards
  function itemMenu(x, y, fromList) {
    document.querySelectorAll('.ctxmenu').forEach(c => c.remove());
    if (!S.path.length && !fromList) return;
    const gp = fromList ? fromList.gp : S.path.slice(0, -1);
    const parent = modAt(gp),
      items = parent && parent.viewgroup_items;
    if (!items) return;
    const i = fromList ? fromList.i : S.path[S.path.length - 1],
      m = items[i],
      n = items.length;
    const moveTo = j => {
      j = Math.max(0, Math.min(n - 1, j));
      if (j === i) return;
      snapshot();
      items.splice(i, 1);
      items.splice(j, 0, m);
      S.path = fromList ? gp : gp.concat(j);
      if (fromList) S.checked.clear();
      S.dirty = true;
      updateBar();
      renderEditor();
      requestRender();
    };
    const close = () => menu.remove();
    const item = (label, kbd, fn, ok) =>
      h(
        'button',
        {
          disabled: ok === false,
          onclick: () => {
            close();
            fn();
          }
        },
        h('span', { text: label }),
        h('kbd', { text: kbd || '' })
      );
    const menu = h(
      'div',
      { class: 'ctxmenu' },
      h('div', { class: 'cmtitle', text: titleOf(m) }),
      item('Bring forward', 'Ctrl ]', () => moveTo(i + 1), i < n - 1),
      item('Send backward', 'Ctrl [', () => moveTo(i - 1), i > 0),
      item('Bring to front', 'Ctrl Shift ]', () => moveTo(n - 1), i < n - 1),
      item('Send to back', 'Ctrl Shift [', () => moveTo(0), i > 0),
      h('hr'),
      item('Duplicate', 'Ctrl D', () => {
        snapshot();
        items.splice(i + 1, 0, JSON.parse(JSON.stringify(m)));
        S.path = fromList ? gp : gp.concat(i + 1);
        if (fromList) S.checked.clear();
        S.dirty = true;
        updateBar();
        renderEditor();
        requestRender();
      }),
      item('Copy', 'Ctrl C', () => {
        S.clipboard = JSON.stringify([m]);
        toast('Copied – paste it from the item list');
      }),
      item(m[NOSEL] ? 'Make selectable' : 'Make click-through', '', () => {
        snapshot();
        if (m[NOSEL]) delete m[NOSEL];
        else m[NOSEL] = true;
        S.dirty = true;
        updateBar();
        renderEditor();
      }),
      fromList
        ? item('Edit', 'Enter', () => {
            S.path = gp.concat(i);
            S.tab = null;
            S.checked.clear();
            renderEditor();
            requestRender();
          })
        : item(
            'Select the group it is in',
            'Esc',
            () => {
              S.path = S.path.slice(0, -1);
              S.tab = null;
              renderEditor();
              requestRender();
            },
            S.path.length > 1
          ),
      h('hr'),
      item('Delete', 'Del', () => {
        snapshot();
        items.splice(i, 1);
        S.path = gp;
        S.checked.clear();
        S.tab = null;
        S.dirty = true;
        updateBar();
        renderEditor();
        requestRender();
      })
    );
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
    setTimeout(() => {
      const off = ev => {
        if (!menu.contains(ev.target)) {
          close();
          document.removeEventListener('pointerdown', off, true);
        }
      };
      document.addEventListener('pointerdown', off, true);
    });
  }
  // the same moves from the keyboard, for the selected item
  function itemKeys(e) {
    if (!S.path.length || S.touch) return false;
    const parent = modAt(S.path.slice(0, -1)),
      items = parent && parent.viewgroup_items;
    if (!items) return false;
    const i = S.path[S.path.length - 1],
      n = items.length,
      ctrl = e.ctrlKey || e.metaKey;
    let j = null;
    if (ctrl && e.key === ']') j = e.shiftKey ? n - 1 : i + 1;
    else if (ctrl && e.key === '[') j = e.shiftKey ? 0 : i - 1;
    else if (ctrl && e.key.toLowerCase() === 'd') {
      snapshot();
      items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i])));
      S.path = S.path.slice(0, -1).concat(i + 1);
    } else if (e.key === 'Delete') {
      snapshot();
      items.splice(i, 1);
      S.path = S.path.slice(0, -1);
      S.tab = null;
    } else return false;
    if (j !== null) {
      j = Math.max(0, Math.min(n - 1, j));
      if (j === i) return true;
      snapshot();
      const m = items.splice(i, 1)[0];
      items.splice(j, 0, m);
      S.path = S.path.slice(0, -1).concat(j);
    }
    S.dirty = true;
    updateBar();
    renderEditor();
    requestRender();
    return true;
  }
  // "C:\\Games\\x.exe", "\"C:\\Program Files\\x.exe\" --flag", "%APPDATA%\\x", "\\\\server\\share\\x" -> { path, args }
  function winPath(s) {
    s = String(s || '').trim();
    if (!/^"?([A-Za-z]:[\\/]|\\\\|%[A-Za-z0-9_()]+%)/.test(s)) return null;
    if (s[0] === '"') {
      const end = s.indexOf('"', 1);
      return end > 1 ? { path: s.slice(1, end), args: s.slice(end + 1).trim() } : null;
    }
    return { path: s, args: '' };
  }
  function runEvents(m, v, list) {
    const scopes = kompScopes(findPath(m) || []);
    (list || m.internal_events || []).forEach(ev => {
      const get = (k, d) => R.resolve(state(), v.opts, v.rt, ev, k, d, scopes);
      const act = get('action', 'LAUNCH_APP');
      if (act === 'SWITCH_GLOBAL') {
        const name = String(get('switch', '')).toLowerCase();
        setRuntimeGlobal(name, ev, v, scopes);
      } else if (act === 'MUSIC') {
        const ma = get('music_action', 'PLAY_PAUSE');
        // the data on show changes at once (the PC's player confirms it a moment later)
        const md = S.useSim ? S.sim.mi : S.live.mi;
        if (ma === 'PLAY_PAUSE') md.state = md.state === 'PLAYING' ? 'PAUSED' : 'PLAYING';
        else if (ma === 'VOLUME_UP') md.vol = Math.min(100, F.num(md.vol) + 10);
        else if (ma === 'VOLUME_DOWN') md.vol = Math.max(0, F.num(md.vol) - 10);
        hostMsg('music:' + ma);
        toast('Music: ' + pretty(ma));
        if (S.panel === 'sim') renderSim();
      } else if (act === 'KUSTOM_ACTION' && /^NOTIF_CLOSE/.test(get('kustom_action', ''))) {
        const ka = get('kustom_action', '');
        if (ka === 'NOTIF_CLOSE_ALL') S.sim.ni.list = [];
        else S.sim.ni.list.splice(Math.round(F.num(get('notification', 0))), 1);
        toast('Notification dismissed (preview only)');
        if (S.panel === 'sim') renderSim();
      } else if (act === 'KUSTOM_ACTION' && get('kustom_action', '') === 'TOGGLE_BT') {
        S.sim.nc.bt = F.num(S.sim.nc.bt) ? 0 : 1;
        toast('Bluetooth ' + (S.sim.nc.bt ? 'on' : 'off') + ' (preview only)');
      } else if (act === 'KUSTOM_ACTION' && get('kustom_action', '') === 'TOGGLE_WIFI') {
        S.sim.nc.wifi = S.sim.nc.wifi === 'DISABLED' ? 'CONNECTED' : 'DISABLED';
        toast('Wi-Fi ' + pretty(S.sim.nc.wifi) + ' (preview only)');
      } else if (act === 'TRIGGER_FLOW') {
        const fl = (root().internal_flows || []).find(f => f.id === ev.flow_id);
        if (!fl) return toast('Flow not found');
        let val = '';
        (fl.a || []).forEach(a => {
          if (a.type === 'A_FORMULA')
            val = R.evalIn(state(), v.opts, v.rt, m, String((a.params || {}).formula || ''), scopes).value;
          else if (a.type === 'A_GLOBAL')
            S.views.forEach(x =>
              x.rt.globals.set(String((a.params || {}).global || '').toLowerCase(), F.isNum(val) ? F.num(val) : val)
            );
        });
        toast('Flow: ' + (fl.name || fl.id));
      } else if (
        /^(LAUNCH_APP|LAUNCH_ACTIVITY|LAUNCH_SHORTCUT|APP_AND_SWITCH|SHORTCUT_AND_SWITCH)$/.test(act) &&
        winPath(get('intent', ''))
      ) {
        // a Windows path in the App / intent field: the Windows app opens it, like double-clicking it in Explorer
        const target = String(get('intent', '')).trim(),
          wp = winPath(target);
        hostMsg('launch:' + target);
        toast((HOST ? 'Opening ' : 'In the Windows app this opens ') + wp.path.split(/[\\/]/).filter(Boolean).pop());
        if (/SWITCH/.test(act) && get('switch', ''))
          setRuntimeGlobal(String(get('switch', '')).toLowerCase(), ev, v, scopes);
      } else if (act === 'OPEN_LINK') {
        hostMsg('link:' + get('url', ''));
        toast('Would open: ' + get('url', ''));
      } else if (act === 'NONE' || act === 'DISABLED') {
        /* nothing */
      } else
        toast(
          'Would run: ' +
            pretty(act) +
            (ev.intent
              ? ' – ' + decodeURIComponent((/label=([^;]*)/.exec(ev.intent) || [])[1] || '')
              : ev.kustom_action
                ? ' – ' + pretty(ev.kustom_action)
                : '')
        );
    });
    requestRender();
    if (S.tab === 'globals' && S.panel !== 'sim') renderEditor();
  }
  function setRuntimeGlobal(name, ev, v, scopes) {
    const g = globalsFor(S.path.length ? S.path : [])
      .concat(globalsFor([]))
      .find(x => x.key === name);
    const type = g ? g.g.type : 'SWITCH';
    const curV = v.rt.globals.has(name) ? v.rt.globals.get(name) : g ? g.g.value : 0;
    let nv;
    if (type === 'LIST') {
      const ent = String(g.g.entries || '')
        .split(',')
        .map(s => s.split('##')[0]);
      const i = ent.indexOf(String(curV));
      const how = String(ev.switch_list || 'NEXT');
      nv = how === 'NEXT' ? ent[(i + 1) % ent.length] : how === 'PREV' ? ent[(i - 1 + ent.length) % ent.length] : how;
    } else if (type === 'SWITCH') nv = F.num(curV) ? 0 : 1;
    else {
      const r = R.evalIn(state(), v.opts, v.rt, null, String(ev.switch_text || ''), scopes).value;
      nv = F.isNum(r) ? F.num(r) : r;
    }
    S.views.forEach(x => x.rt.globals.set(name, nv));
    toast((g ? g.g.title : name) + ' → ' + nv + '  (preview only)');
  }

  // ------------------------------------------------------------------ toast / dialogs
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function dialog(title, body, buttons, wide) {
    const back = h('div', {
      class: 'back',
      onpointerdown: e => {
        if (e.target === back) close();
      }
    });
    const close = () => back.remove();
    const box = h(
      'div',
      { class: 'dlg' + (wide ? ' wide' : '') },
      h('div', { class: 'dlg-t', text: title }),
      h('div', { class: 'dlg-b' }, body),
      h(
        'div',
        { class: 'dlg-f' },
        (buttons || [['Close']]).map(b =>
          h('button', {
            class: b[2] ? 'btn pri' : 'btn',
            text: b[0],
            onclick: () => {
              if (!b[1] || b[1]() !== false) close();
            }
          })
        )
      )
    );
    back.append(box);
    document.body.append(back);
    const f = box.querySelector('input,textarea,select');
    if (f) setTimeout(() => f.focus(), 30);
    return { close, box };
  }
  function form(title, fields, onOk) {
    // fields: [{k,l,v,type,options}]
    const ins = {};
    const body = fields.map(f => {
      let el;
      if (f.options)
        el = h(
          'select',
          null,
          f.options.map(o => h('option', { value: o, text: pretty(o), selected: o === f.v }))
        );
      else if (f.type === 'area') el = h('textarea', { rows: 4, value: f.v === undefined ? '' : f.v });
      else el = h('input', { type: f.type || 'text', value: f.v === undefined ? '' : f.v });
      ins[f.k] = el;
      return h('label', { class: 'fld' }, h('span', { text: f.l }), el);
    });
    dialog(title, body, [
      ['Cancel'],
      [
        'OK',
        () => {
          const o = {};
          for (const k in ins) o[k] = ins[k].value;
          return onOk(o);
        },
        true
      ]
    ]);
    return ins;
  }

  // ------------------------------------------------------------------ property editing
  function ensure(o, k) {
    if (!o[k]) o[k] = {};
    return o[k];
  }
  function propState(o, k) {
    const tg = o.internal_toggles ? o.internal_toggles[k] : 0;
    return tg === 10 ? 'formula' : tg === 100 ? 'global' : 'value';
  }
  function resolved(o, def, d) {
    const v = S.views[0];
    if (!v || !v.opts) return o[def.k] === undefined ? d : o[def.k];
    return R.resolve(state(), v.opts, v.rt, o, def.k, d === undefined ? def.d : d, kompScopes(S.path));
  }
  function evalNow(tpl) {
    const v = S.views[0];
    const syn = F.check(tpl);
    if (!v || !v.opts) return { value: '', error: syn[0] || null, errors: syn };
    const r = R.evalIn(state(), v.opts, v.rt, null, tpl, kompScopes(S.path)),
      all = syn.concat((r.errors || []).filter(e => syn.indexOf(e) < 0));
    return { value: r.value, error: all[0] || null, errors: all };
  }
  function setVal(o, k, val, key) {
    snapshot(key || 'p:' + k);
    if (val === undefined) delete o[k];
    else o[k] = val;
    requestRender();
  }

  function colorEditor(val, onChange) {
    const c = F.parseColor(val) || { a: 255, r: 255, g: 255, b: 255 };
    const hex6 = () => '#' + [c.r, c.g, c.b].map(x => x.toString(16).padStart(2, '0')).join('');
    const sw = h('span', { class: 'swatch' }, h('i', { style: { background: R.css(F.colorStr(c)) } }));
    const txt = h('input', { class: 'hex', value: F.colorStr(c), spellcheck: 'false' }),
      pick = h('input', { type: 'color', value: hex6() }),
      al = h('input', { type: 'range', min: 0, max: 255, value: c.a, title: 'Alpha' });
    const push = final => {
      const s = F.colorStr(c);
      txt.value = s;
      sw.firstChild.style.background = R.css(s);
      onChange(s, final);
    };
    pick.oninput = () => {
      const p = F.parseColor(pick.value);
      c.r = p.r;
      c.g = p.g;
      c.b = p.b;
      push(false);
    };
    al.oninput = () => {
      c.a = parseInt(al.value, 10);
      push(false);
    };
    txt.onchange = () => {
      const p = F.parseColor(txt.value);
      if (p) {
        Object.assign(c, p);
        pick.value = hex6();
        al.value = c.a;
        push(true);
      } else txt.value = F.colorStr(c);
    };
    sw.onclick = () => pick.click();
    return h('span', { class: 'color' }, sw, pick, txt, al);
  }
  function numberEditor(val, def, onChange) {
    const inp = h('input', { type: 'number', step: 'any', value: val });
    const bump = d => {
      let n = (parseFloat(inp.value) || 0) + d;
      if (def.min !== undefined) n = Math.max(def.min, n);
      if (def.max !== undefined) n = Math.min(def.max, n);
      n = Math.round(n * 100) / 100;
      inp.value = n;
      onChange(n);
    };
    inp.oninput = () => {
      const n = parseFloat(inp.value);
      if (isFinite(n)) onChange(n);
    };
    inp.onkeydown = e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        bump((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      }
    };
    return h(
      'span',
      { class: 'num' },
      h('button', {
        class: 'st',
        text: '−',
        title: 'Step down (Shift: by 10)',
        tabindex: -1,
        onclick: e => bump(e.shiftKey ? -10 : -1)
      }),
      inp,
      h('button', {
        class: 'st',
        text: '+',
        title: 'Step up (Shift: by 10)',
        tabindex: -1,
        onclick: e => bump(e.shiftKey ? 10 : 1)
      })
    );
  }
  function enumEditor(val, opts, onChange, en) {
    const list = opts.indexOf(val) < 0 && val !== undefined && val !== '' ? opts.concat([val]) : opts;
    en = en || opts.en;
    return h(
      'select',
      {
        onchange: e => {
          if (e.target.value === '\u0000') {
            const c = prompt('Custom value (exactly as stored in the preset):', val || '');
            if (c) onChange(c.trim());
            else renderEditor();
          } else onChange(e.target.value);
        }
      },
      list.map(o => h('option', { value: o, text: SC.optLabel(en, o) || pretty(o), selected: o === val })),
      h('option', { value: '\u0000', text: 'Custom value…' })
    );
  }
  function pickFile(accept, cb) {
    const i = h('input', { type: 'file', accept });
    i.onchange = () => {
      if (i.files[0]) i.files[0].arrayBuffer().then(b => cb(i.files[0], new Uint8Array(b)));
    };
    i.click();
  }
  // 32 hex digits from the file's bytes (KLWP names bundled images "IMG" + a hash, with no extension)
  function hashHex(b) {
    const hs = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x41c6ce57];
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      hs[0] = Math.imul(hs[0] ^ c, 16777619);
      hs[1] = Math.imul(hs[1] + c, 2654435761) ^ (hs[1] >>> 13);
      hs[2] = Math.imul(hs[2] ^ c, 2246822507) ^ (hs[2] >>> 15);
      hs[3] = Math.imul(hs[3] ^ (c + i), 3266489909) ^ (hs[3] >>> 16);
    }
    return hs.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function addAsset(dir, file, bytes) {
    const name = dir === 'bitmaps' ? 'IMG' + hashHex(bytes) : file.name.replace(/[^\w.\- ]/g, '_');
    const p = dir + '/' + name;
    S.files.set(p, bytes);
    A.reset();
    return KF + p;
  }
  // object URLs for image thumbnails, one per file
  const thumbUrls = new Map();
  function thumbUrl(p, onReady) {
    if (thumbUrls.has(p)) return thumbUrls.get(p);
    const b = S.files.get(p) || S.library.get(p);
    if (!b) {
      // not read yet: read it, then fill in the picture
      if (onReady && S.library.has(p)) {
        if (!thumbWaits.has(p)) thumbWaits.set(p, []);
        thumbWaits.get(p).push(() => onReady(thumbUrl(p)));
      }
      return '';
    }
    const u = URL.createObjectURL(new Blob([b]));
    thumbUrls.set(p, u);
    return u;
  }
  // a thumbnail that fills in once its file has been read
  function lazyThumb(p) {
    const im = h('img', { loading: 'lazy', alt: '' });
    const u = thumbUrl(p, url => {
      im.src = url;
    });
    if (u) im.src = u;
    return im;
  }
  // an image field: a button showing the current picture, opening a list where every image has its thumbnail
  function bitmapPicker(val, items, onPick, onAdd) {
    const curP = val && String(val).indexOf(KF) === 0 ? String(val).slice(KF.length) : '';
    const label = curP ? curP.split('/').pop() : val ? String(val) : 'None';
    const btn = h(
      'button',
      { class: 'bmpick', type: 'button', title: curP || String(val || '') },
      curP ? lazyThumb(curP) : h('i', { class: 'nothumb' }),
      h('span', { text: label + (curP && items.indexOf(curP) < 0 ? ' (missing)' : '') }),
      h('b', { text: '▾' })
    );
    btn.onclick = e => {
      e.stopPropagation();
      document.querySelectorAll('.bmlist').forEach(x => x.remove());
      const list = h('div', { class: 'bmlist' });
      const row = (p, text, sub, on) =>
        h(
          'button',
          {
            class: 'bmrow' + (p === curP ? ' on' : ''),
            type: 'button',
            onclick: () => {
              close();
              on();
            }
          },
          p ? lazyThumb(p) : h('i', { class: 'nothumb' }),
          h('span', null, h('b', { text }), sub ? h('small', { text: sub }) : null)
        );
      list.append(row('', 'None', '', () => onPick(undefined)));
      items.forEach(p =>
        list.append(
          row(p, p.split('/').pop(), S.files.has(p) ? 'In this preset' : 'Kustom folder', () => onPick(KF + p))
        )
      );
      list.append(row('', 'Add image from PC…', '', onAdd));
      document.body.append(list);
      const r = btn.getBoundingClientRect(),
        lh = Math.min(380, innerHeight - 20);
      list.style.maxHeight = lh + 'px';
      list.style.width = Math.max(260, r.width) + 'px';
      list.style.left = Math.min(r.left, innerWidth - Math.max(260, r.width) - 8) + 'px';
      list.style.top = (r.bottom + lh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - lh - 4)) + 'px';
      const close = () => {
        list.remove();
        document.removeEventListener('pointerdown', off, true);
      };
      const off = ev => {
        if (!list.contains(ev.target)) close();
      };
      setTimeout(() => document.addEventListener('pointerdown', off, true));
    };
    return btn;
  }
  function assetEditor(def, val, onChange, item) {
    const dir = def.t === 'font' ? 'fonts' : def.t === 'iconset' ? 'icons' : 'bitmaps';
    if (def.t === 'bitmap')
      return h(
        'span',
        { class: 'asset' },
        bitmapPicker(
          val,
          A.list('bitmaps', null),
          v => onChange(v),
          () => pickFile('image/*', (f, b) => onChange(addAsset('bitmaps', f, b)))
        )
      );
    const re = def.t === 'font' ? /\.(ttf|otf)$/i : def.t === 'iconset' ? /\.ttf$/i : null;
    const items = A.list(dir, re);
    if (def.t === 'font') return fontField(val, items, onChange, item);
    const curP = val && String(val).indexOf(KF) === 0 ? String(val).slice(KF.length) : '';
    const sel = h(
      'select',
      {
        onchange: e => {
          const x = e.target.value;
          if (x === '\u0001')
            return pickFile(def.t === 'bitmap' ? 'image/*' : '.ttf,.otf,.json', (f, b) => {
              const uri = addAsset(dir, f, b);
              if (def.t === 'iconset' && /\.json$/i.test(f.name)) {
                toast('Icon data added – now add the matching .ttf');
                renderEditor();
                return;
              }
              onChange(uri);
            });
          onChange(x ? KF + x : undefined);
        }
      },
      h('option', { value: '', text: def.t === 'font' ? 'Default (Roboto)' : 'None' }),
      curP && items.indexOf(curP) < 0
        ? h('option', { value: curP, text: curP.split('/').pop() + ' (missing)', selected: true })
        : null,
      val && !curP ? h('option', { value: '', text: String(val), selected: true }) : null,
      items.map(p =>
        h('option', {
          value: p,
          text: p.split('/').pop() + (S.files.has(p) ? '' : '  (Kustom folder)'),
          selected: p === curP
        })
      ),
      h('option', { value: '\u0001', text: 'Add file from PC…' })
    );
    const out = h('span', { class: 'asset' }, sel);
    if (def.t === 'bitmap' && val) {
      const b = A.bytes(val);
      if (b) {
        const im = h('img', { class: 'thumb' });
        im.src = URL.createObjectURL(new Blob([b]));
        out.prepend(im);
      }
    }
    return out;
  }
  // ---- fonts: a dropdown where every name is drawn in its own font, and a KLWP-style picker (families with their
  // weights folded in, a live preview, Google Fonts) ----
  // KLWP names a font file by family and variant: "ClassicalDiary-Regular Demo.ttf" shows as "Classical Diary"
  // "regulardemo"; Google downloads are saved as "Be_Vietnam_Pro_700.ttf"
  const GF_VARIANT = /^(regular|italic|[1-9]00(italic)?)$/;
  function fontLabel(p) {
    const base = String(p)
      .split('/')
      .pop()
      .replace(/\.(ttf|otf)$/i, '');
    let fam = base,
      v = 'regular';
    const dash = base.indexOf('-');
    const us = base.lastIndexOf('_');
    if (dash > 0) {
      fam = base.slice(0, dash);
      v =
        base
          .slice(dash + 1)
          .replace(/\s+/g, '')
          .toLowerCase() || 'regular';
    } else if (us > 0 && GF_VARIANT.test(base.slice(us + 1))) {
      fam = base.slice(0, us);
      v = base.slice(us + 1);
    }
    fam = fam
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    return { fam: fam || base, v };
  }
  // draw an element's text in a font file's own face once that file has loaded (a few at a time, like KLWP)
  const fontFaceQueue = [];
  let fontFaceBusy = false;
  function useOwnFont(el, p) {
    fontFaceQueue.push({ el, uri: KF + p, tries: 0 });
    if (!fontFaceBusy) {
      fontFaceBusy = true;
      setTimeout(pumpFontFaces, 0);
    }
  }
  function pumpFontFaces() {
    fontFaceBusy = true;
    const keep = [];
    let budget = 6;
    while (fontFaceQueue.length) {
      const j = fontFaceQueue.shift();
      if (!j.el.isConnected) {
        if (++j.tries < 20) keep.push(j); // not on the page yet
        continue;
      }
      if (budget <= 0) {
        keep.push(j);
        continue;
      }
      const fam = A.font(j.uri);
      if (fam) j.el.style.fontFamily = fam + ', sans-serif';
      else {
        budget--;
        if (++j.tries < 60) keep.push(j);
      }
    }
    fontFaceQueue.push(...keep);
    if (fontFaceQueue.length) setTimeout(pumpFontFaces, 120);
    else fontFaceBusy = false;
  }
  function fontField(val, items, onChange, item) {
    const curP = val && String(val).indexOf(KF) === 0 ? String(val).slice(KF.length) : '';
    const all = items.slice();
    if (curP && all.indexOf(curP) < 0) all.unshift(curP);
    const name = p =>
      p ? fontLabel(p).fam + (fontLabel(p).v !== 'regular' ? ' ' + fontLabel(p).v : '') : 'Default (Roboto)';
    let cur = curP;
    const lab = h('span', { text: name(cur) + (cur && items.indexOf(cur) < 0 ? ' (missing)' : '') });
    if (cur) useOwnFont(lab, cur);
    const btn = h(
      'button',
      { class: 'bmpick fontpick', type: 'button', title: cur || 'Default (Roboto)' },
      lab,
      h('b', { text: '▾' })
    );
    const show = p => {
      cur = p;
      lab.textContent = name(p);
      lab.style.fontFamily = '';
      btn.title = p || 'Default (Roboto)';
      if (p) useOwnFont(lab, p);
    };
    // the wheel steps through the fonts and shows each on the canvas straight away
    let wheelT = 0;
    btn.addEventListener(
      'wheel',
      e => {
        if (!all.length) return;
        e.preventDefault();
        const list = [''].concat(all);
        let i = list.indexOf(cur);
        i = Math.max(0, Math.min(list.length - 1, i + (e.deltaY > 0 ? 1 : -1)));
        if (list[i] === cur) return;
        show(list[i]);
        onChange(list[i] ? KF + list[i] : undefined, false);
        clearTimeout(wheelT);
        wheelT = setTimeout(() => onChange(cur ? KF + cur : undefined), 700);
      },
      { passive: false }
    );
    btn.onclick = e => {
      e.stopPropagation();
      document.querySelectorAll('.bmlist').forEach(x => x.remove());
      const list = h('div', { class: 'bmlist fontlist' });
      const row = (p, text, sub, on) => {
        const b = h('b', { text });
        const r = h(
          'button',
          {
            class: 'bmrow' + (p === cur ? ' on' : ''),
            type: 'button',
            onclick: () => {
              close();
              on();
            }
          },
          h('span', null, b, sub ? h('small', { text: sub }) : null)
        );
        if (p) useOwnFont(b, p);
        return r;
      };
      list.append(row('', 'Default (Roboto)', '', () => onChange(undefined)));
      all.forEach(p =>
        list.append(
          row(p, name(p), p.split('/').pop() + (S.files.has(p) ? '' : ' · Kustom folder'), () => onChange(KF + p))
        )
      );
      list.append(
        row('', 'Add font file from PC…', '', () => pickFile('.ttf,.otf', (f, b) => onChange(addAsset('fonts', f, b))))
      );
      document.body.append(list);
      const r = btn.getBoundingClientRect(),
        lh = Math.min(420, innerHeight - 20);
      list.style.maxHeight = lh + 'px';
      list.style.width = Math.max(280, r.width) + 'px';
      list.style.left = Math.min(r.left, innerWidth - Math.max(280, r.width) - 8) + 'px';
      list.style.top = (r.bottom + lh + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - lh - 4)) + 'px';
      const on = list.querySelector('.on');
      if (on) on.scrollIntoView({ block: 'center' });
      const close = () => {
        list.remove();
        document.removeEventListener('pointerdown', off, true);
      };
      const off = ev => {
        if (!list.contains(ev.target)) close();
      };
      setTimeout(() => document.addEventListener('pointerdown', off, true));
    };
    const more = h('button', {
      class: 'fbtn fontmore',
      type: 'button',
      title: 'Font picker (families, preview, Google Fonts)',
      text: 'Aa',
      onclick: () => fontDialog(cur, all, item, p => onChange(p))
    });
    return h('span', { class: 'asset fontfield' }, btn, more);
  }
  // the text a font is previewed with: the item's own text, or KLWP's sample sentence
  function fontSample(item) {
    let t = '';
    try {
      if (item && item.text_expression) t = String(evalNow(String(item.text_expression)).value || '');
    } catch (e) {
      t = '';
    }
    t = t.replace(/\s+/g, ' ').trim();
    return t ? t.slice(0, 80) : 'A brown quick fox jumps over the lazy dog';
  }
  // Google Fonts: the family list comes from fonts.google.com, previews from fonts.googleapis.com (only the letters
  // shown), and the chosen weight is saved into the preset as a .ttf
  let gfList = null,
    gfLoading = null;
  function hostFetch(url, bytes) {
    return new Promise((res, rej) => {
      if (HOST) {
        const id = 'x' + Math.random().toString(36).slice(2);
        webWaits.set(id, t => (t === null ? rej(new Error('download failed')) : res(t)));
        hostMsg('wgx:' + id + '|' + (bytes ? 'b' : 't') + '|' + url);
      } else
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return bytes ? r.arrayBuffer().then(b => new Uint8Array(b)) : r.text();
          })
          .then(res, rej);
    });
  }
  function googleFonts() {
    if (gfList) return Promise.resolve(gfList);
    if (!gfLoading)
      gfLoading = hostFetch('https://fonts.google.com/metadata/fonts')
        .then(t => {
          const j = JSON.parse(String(t).replace(/^\)\]\}'\s*/, ''));
          gfList = (j.familyMetadataList || [])
            .map(f => ({
              fam: f.family,
              cat: f.category || '',
              pop: f.popularity || 9999,
              vars: Object.keys(f.fonts || {}).map(k =>
                k
                  .replace(/^400$/, 'regular')
                  .replace(/^400i$/, 'italic')
                  .replace(/^(\d00)i$/, '$1italic')
              )
            }))
            .sort((a, b) => a.pop - b.pop);
          return gfList;
        })
        .catch(e => {
          gfLoading = null;
          throw e;
        });
    return gfLoading;
  }
  const gfCssDone = new Set();
  function googlePreview(fam, text) {
    const key = fam + '|' + text;
    if (!gfCssDone.has(key)) {
      gfCssDone.add(key);
      document.head.append(
        h('link', {
          rel: 'stylesheet',
          href:
            'https://fonts.googleapis.com/css2?family=' +
            encodeURIComponent(fam).replace(/%20/g, '+') +
            '&text=' +
            encodeURIComponent(fam + text) +
            '&display=swap'
        })
      );
    }
    return "'" + fam.replace(/'/g, '') + "', sans-serif";
  }
  function googleDownload(fam, v) {
    const spec = v === 'regular' ? '400' : v === 'italic' ? '400italic' : v;
    return hostFetch(
      'https://fonts.googleapis.com/css?family=' + encodeURIComponent(fam).replace(/%20/g, '+') + ':' + spec
    )
      .then(css => {
        const m = /url\((https:[^)]+?\.ttf)\)/.exec(String(css)) || /url\((https:[^)]+)\)/.exec(String(css));
        if (!m) throw new Error('no font file offered');
        return hostFetch(m[1], true);
      })
      .then(b => {
        const bytes = typeof b === 'string' ? Uint8Array.from(atob(b), c => c.charCodeAt(0)) : b;
        const p = 'fonts/' + fam.replace(/\s+/g, '_') + (v === 'regular' ? '' : '_' + v) + '.ttf';
        S.files.set(p, bytes);
        A.reset();
        return KF + p;
      });
  }
  function fontDialog(cur, files, item, onPick) {
    const sample = fontSample(item);
    let src = 'local',
      open = cur ? fontLabel(cur).fam : '';
    const q = h('input', { placeholder: 'Search fonts…', type: 'search' });
    const prev = h('input', { class: 'fsample', value: sample, title: 'Preview text' });
    const tabs = h('div', { class: 'ftabs' });
    const body = h('div', { class: 'fontfams' });
    const note = h('div', { class: 'fnote' });
    const tab = (id, text) =>
      h('button', {
        type: 'button',
        class: src === id ? 'on' : '',
        text,
        onclick: () => {
          src = id;
          fill();
        }
      });
    let dl;
    const pick = uri => {
      onPick(uri);
      dl.close();
    };
    const familyRow = (fam, sub, faceFor, variants) => {
      const isOpen = open === fam;
      const pv = h('div', { class: 'fprev', text: prev.value || sample });
      faceFor(pv);
      const head = h(
        'button',
        {
          type: 'button',
          class: 'fhead' + (isOpen ? ' open' : ''),
          onclick: () => {
            if (variants.length === 1) return variants[0].go();
            open = isOpen ? '' : fam;
            fill();
          }
        },
        h('div', { class: 'fname' }, h('b', { text: fam }), h('small', { text: sub })),
        pv
      );
      const box = h('div', { class: 'ffam' + (isOpen ? ' open' : '') }, head);
      if (isOpen)
        box.append(
          h(
            'div',
            { class: 'fvars' },
            variants.map(x => {
              const b = h(
                'button',
                { type: 'button', class: 'fvar' + (x.on ? ' on' : ''), onclick: x.go },
                h('small', { text: x.v }),
                h('span', { text: prev.value || sample })
              );
              x.face(b.lastChild);
              return b;
            })
          )
        );
      return box;
    };
    const fill = () => {
      tabs.innerHTML = '';
      tabs.append(tab('local', 'This preset & Kustom folder'), tab('google', 'Google Fonts'));
      body.innerHTML = '';
      note.textContent = '';
      const f = q.value.trim().toLowerCase();
      if (src === 'local') {
        const fams = new Map();
        files.forEach(p => {
          const l = fontLabel(p);
          if (f && l.fam.toLowerCase().indexOf(f) < 0 && p.toLowerCase().indexOf(f) < 0) return;
          if (!fams.has(l.fam)) fams.set(l.fam, []);
          fams.get(l.fam).push({ p, v: l.v });
        });
        if (!f || 'roboto default'.indexOf(f) >= 0)
          body.append(
            familyRow(
              'Default (Roboto)',
              'built in',
              el => (el.style.fontFamily = (A.font() || 'Roboto') + ', sans-serif'),
              [{ v: 'regular', go: () => pick(undefined), face: () => {} }]
            )
          );
        [...fams.keys()]
          .sort((a, b) => a.localeCompare(b))
          .forEach(fam => {
            const vs = fams.get(fam).sort((a, b) => a.v.localeCompare(b.v));
            const main = vs.find(x => x.v === 'regular') || vs[0];
            body.append(
              familyRow(
                fam,
                vs.length > 1 ? vs.length + ' styles' : main.v,
                el => useOwnFont(el, main.p),
                vs.map(x => ({ v: x.v, on: x.p === cur, go: () => pick(KF + x.p), face: el => useOwnFont(el, x.p) }))
              )
            );
          });
        if (!body.children.length) note.textContent = 'No fonts match.';
        return;
      }
      note.textContent = 'Loading the Google Fonts list…';
      googleFonts()
        .then(list => {
          if (src !== 'google') return;
          note.textContent = '';
          const hits = list.filter(x => !f || x.fam.toLowerCase().indexOf(f) >= 0);
          let shown = 0;
          const more = () => {
            hits.slice(shown, shown + 40).forEach(x =>
              body.append(
                familyRow(
                  x.fam,
                  x.cat + ' · ' + x.vars.length + (x.vars.length === 1 ? ' style' : ' styles'),
                  el => (el.style.fontFamily = googlePreview(x.fam, prev.value || sample)),
                  x.vars.map(v => ({
                    v,
                    on: false,
                    go: () => {
                      note.textContent = 'Downloading ' + x.fam + ' ' + v + '…';
                      googleDownload(x.fam, v)
                        .then(pick)
                        .catch(e => (note.textContent = 'Could not download ' + x.fam + ': ' + e.message));
                    },
                    face: el => {
                      el.style.fontFamily = googlePreview(x.fam, prev.value || sample);
                      el.style.fontWeight = parseInt(v, 10) || 400;
                      el.style.fontStyle = /italic/.test(v) ? 'italic' : 'normal';
                    }
                  }))
                )
              )
            );
            shown += 40;
          };
          more();
          body.onscroll = () => {
            if (shown < hits.length && body.scrollTop + body.clientHeight > body.scrollHeight - 200) more();
          };
          if (!hits.length) note.textContent = 'No Google font matches.';
        })
        .catch(() => {
          if (src === 'google')
            note.textContent = HOST
              ? 'Could not reach Google Fonts.'
              : 'The Google Fonts list needs the Windows app (or an internet connection that allows it).';
        });
    };
    let qt = 0;
    q.oninput = () => {
      clearTimeout(qt);
      qt = setTimeout(fill, 150);
    };
    prev.oninput = () => {
      clearTimeout(qt);
      qt = setTimeout(fill, 250);
    };
    fill();
    dl = dialog('Font', [h('div', { class: 'frow' }, q, prev), tabs, note, body], [['Cancel']], true);
    setTimeout(() => {
      const o = body.querySelector('.ffam.open');
      if (o) o.scrollIntoView({ block: 'center' });
    }, 50);
  }
  function iconPicker(o, onChange) {
    const set = A.iconSet(resolved(o, { k: 'icon_set', d: '' }, ''));
    if (!set) return toast('This icon set has no .json next to its .ttf, so its icons cannot be listed');
    const names = set._names || Object.keys(set),
      fam = set._font && set._font();
    const grid = h('div', { class: 'icongrid' });
    const q = h('input', { placeholder: 'Search ' + names.length + ' icons…' });
    let dl;
    const fill = () => {
      grid.innerHTML = '';
      const f = q.value.toLowerCase();
      names
        .filter(n => n.toLowerCase().indexOf(f) >= 0)
        .slice(0, 400)
        .forEach(n => {
          grid.append(
            h(
              'button',
              {
                class: 'icell',
                title: n,
                onclick: () => {
                  onChange(n);
                  dl.close();
                }
              },
              h('i', { style: { fontFamily: fam || 'sans-serif' }, text: String.fromCodePoint(set[n].code) }),
              h('span', { text: n })
            )
          );
        });
    };
    q.oninput = fill;
    fill();
    dl = dialog('Pick icon', [q, grid], [['Cancel']], true);
  }

  // formula editor dialog
  function formulaDialog(title, value, onOk) {
    const ta = h('textarea', { class: 'fx', rows: 7, spellcheck: 'false', value: value || '' });
    const res = h('div', { class: 'fres' }),
      warn = h('div', { class: 'fwarn', hidden: true });
    const upd = () => {
      const r = evalNow(ta.value);
      res.textContent = r.value;
      res.classList.toggle('err', !!r.error);
      warn.innerHTML = '';
      warn.hidden = !r.errors.length;
      r.errors.forEach(m => warn.append(h('div', { class: 'fw' }, h('b', { text: '⚠' }), h('span', { text: m }))));
      if (r.errors.length)
        warn.append(
          h('div', {
            class: 'fwhint',
            text: 'KLWP shows nothing for a $…$ block it cannot read, so this is what the phone will show too.'
          })
        );
    };
    ta.oninput = upd;
    const ins = t => {
      const s = ta.selectionStart,
        e = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + t.length;
      upd();
    };
    const ref = h('div', { class: 'fref' });
    const q = h('input', { placeholder: 'Search functions…', oninput: () => fillRef() });
    function fillRef() {
      ref.innerHTML = '';
      const f = q.value.toLowerCase();
      SC.FUNCS.filter(x => (x[0] + x[1] + x[2]).toLowerCase().indexOf(f) >= 0).forEach(x =>
        ref.append(
          h(
            'div',
            { class: 'fn' },
            h('b', { text: x[1] }),
            h('span', { text: x[2] }),
            h(
              'div',
              null,
              x[3].map(ex => h('button', { class: 'chip', text: ex, title: 'Insert', onclick: () => ins(ex) }))
            )
          )
        )
      );
    }
    fillRef();
    const gl = globalsFor(S.path).filter(x => x.g.type !== 'FOLDER');
    const fav = S.faves;
    const side = h(
      'div',
      { class: 'fside' },
      h('div', { class: 'sub', text: 'Globals' }),
      h(
        'div',
        { class: 'chips' },
        gl.length
          ? gl.map(x =>
              h('button', { class: 'chip', text: x.key, title: x.g.type, onclick: () => ins('$gv(' + x.key + ')$') })
            )
          : h('i', { text: 'none' })
      ),
      fav.length ? h('div', { class: 'sub', text: 'Favourites (fave_formulas.json)' }) : null,
      fav.length
        ? h(
            'div',
            { class: 'chips' },
            fav.map(x =>
              h('button', {
                class: 'chip',
                text: x.description || x.expression,
                title: x.expression,
                onclick: () => ins(x.expression)
              })
            )
          )
        : null,
      h('div', { class: 'sub', text: 'Functions' }),
      q,
      ref
    );
    dialog(
      title,
      h(
        'div',
        { class: 'fed' },
        h(
          'div',
          { class: 'fmain' },
          ta,
          warn,
          h('div', { class: 'sub', text: 'Result (live, with simulated device data)' }),
          res
        ),
        side
      ),
      [['Cancel'], ['OK', () => onOk(ta.value), true]],
      true
    );
    upd();
  }

  // one KLWP-style property row
  function propRow(o, def, opts) {
    opts = opts || {};
    const k = def.k,
      st = propState(o, k),
      id = (opts.idp || '') + k;
    const get = key => {
      const d2 = (opts.defs || []).find(x => x.k === key);
      return resolved(o, { k: key, d: d2 ? d2.d : '' }, d2 ? d2.d : '');
    };
    if (def.show && !def.show(get)) return null;
    if (def.noStack && opts.inStack) return null;
    if (def.noRoot && opts.inRoot) return null;
    if (def.onlyRoot && !opts.inRoot) return null;
    if (def.rootDefault && opts.inRoot) def = Object.assign({}, def, { d: def.rootDefault });
    const raw = o[k];
    const val = raw === undefined ? def.d : raw;
    let ed;
    const change = (v, final) => {
      setVal(o, k, v, final === false ? id : def.t === 'num' || def.t === 'text' || def.t === 'color' ? id : null);
      if (final !== false && def.t !== 'num' && def.t !== 'text' && def.t !== 'color') renderEditor();
    };
    if (st === 'formula') {
      const fsrc = (o.internal_formulas || {})[k] || '';
      const r = evalNow(fsrc);
      ed = h(
        'button',
        {
          class: 'fbtn' + (r.error ? ' err' : ''),
          title: 'Edit formula',
          onclick: () =>
            formulaDialog(def.l, fsrc, v => {
              snapshot();
              ensure(o, 'internal_formulas')[k] = v;
              renderEditor();
              requestRender();
            })
        },
        h('code', { text: fsrc || '(empty formula)' }),
        h('span', { class: 'fval', text: '= ' + r.value + (r.error ? '  ⚠' : '') })
      );
    } else if (st === 'global') {
      const want =
        def.t === 'color'
          ? ['COLOR']
          : def.t === 'num'
            ? ['NUMBER', 'SWITCH', 'LIST', 'TEXT']
            : def.t === 'bitmap'
              ? ['BITMAP']
              : def.t === 'font'
                ? ['FONT']
                : ['TEXT', 'LIST', 'NUMBER', 'SWITCH', 'COLOR'];
      const gl = globalsFor(S.path).filter(x => want.indexOf(x.g.type) >= 0);
      const curG = (o.internal_globals || {})[k];
      ed = h(
        'select',
        {
          onchange: e => {
            snapshot();
            ensure(o, 'internal_globals')[k] = e.target.value;
            requestRender();
          }
        },
        curG && !gl.find(x => x.key === curG)
          ? h('option', { value: curG, text: curG + ' (missing)', selected: true })
          : null,
        !curG ? h('option', { value: '', text: 'Pick a global…', selected: true }) : null,
        gl.map(x => h('option', { value: x.key, text: x.g.title + '  [' + x.key + ']', selected: x.key === curG }))
      );
    } else
      switch (def.t) {
        case 'num':
          ed = numberEditor(val, def, v => change(v, false));
          break;
        case 'color':
          ed = colorEditor(val, (v, final) => change(v, final));
          break;
        case 'enum':
          ed = enumEditor(val, def.o, v => change(v), def.en);
          break;
        case 'text':
          ed = h('input', { type: 'text', value: val, oninput: e => change(e.target.value, false) });
          break;
        case 'formula': {
          const r = evalNow(String(val));
          ed = h(
            'button',
            {
              class: 'fbtn' + (r.error ? ' err' : ''),
              title: 'Edit',
              onclick: () =>
                formulaDialog(def.l, String(val), v => {
                  snapshot();
                  o[k] = v;
                  renderEditor();
                  requestRender();
                })
            },
            h('code', { text: String(val) || '(empty)' }),
            String(val).indexOf('$') >= 0
              ? h('span', { class: 'fval', text: '= ' + r.value + (r.error ? '  ⚠' : '') })
              : null
          );
          break;
        }
        case 'bitmap':
        case 'font':
        case 'iconset':
          ed = assetEditor(def, val, (v, f) => change(v, f), o);
          break;
        case 'icon':
          ed = h(
            'span',
            { class: 'asset' },
            h('input', { type: 'text', value: val, oninput: e => change(e.target.value, false) }),
            h('button', { class: 'btn sm', text: 'Browse…', onclick: () => iconPicker(o, v => change(v)) })
          );
          break;
        case 'flags':
          ed = h(
            'span',
            { class: 'flags' },
            def.o.map(f =>
              h(
                'label',
                null,
                h('input', {
                  type: 'checkbox',
                  checked: (val || []).indexOf(f) >= 0,
                  onchange: e => {
                    const a = (o[k] || []).filter(x => x !== f);
                    if (e.target.checked) a.push(f);
                    change(a.length ? a : undefined);
                  }
                }),
                SC.optLabel(def.o.en, f) || f
              )
            )
          );
          break;
        case 'global': {
          const gl = globalsFor(S.path).filter(x => x.g.type !== 'FOLDER' && (!def.gt || x.g.type === def.gt || true));
          ed = h(
            'select',
            { onchange: e => change(e.target.value) },
            h('option', { value: '', text: 'Pick a global…' }),
            val && !gl.find(x => x.key === String(val).toLowerCase())
              ? h('option', { value: val, text: val + ' (missing)', selected: true })
              : null,
            gl.map(x =>
              h('option', {
                value: x.key,
                text: x.g.title + '  [' + x.key + ']',
                selected: x.key === String(val).toLowerCase()
              })
            )
          );
          break;
        }
        case 'flow': {
          const fl = root().internal_flows || [];
          ed = h(
            'select',
            { onchange: e => change(e.target.value) },
            h('option', { value: '', text: 'Pick a flow…' }),
            fl.map(f => h('option', { value: f.id, text: f.name || f.id, selected: f.id === val }))
          );
          break;
        }
        case 'keyframes':
          ed = keyframes(o, k);
          break;
        default:
          ed = h('span', { text: String(val) });
      }
    const canBind = def.t !== 'keyframes' && def.t !== 'flags' && def.t !== 'flow' && !opts.noBind;
    const tog = mode => {
      snapshot();
      const t = ensure(o, 'internal_toggles');
      if (st === mode) t[k] = 0;
      else if (mode === 'formula') {
        t[k] = 10;
        const f = ensure(o, 'internal_formulas');
        if (f[k] === undefined) f[k] = raw === undefined ? String(def.d === undefined ? '' : def.d) : String(raw);
      } else {
        t[k] = 100;
        ensure(o, 'internal_globals');
      }
      renderEditor();
      requestRender();
    };
    return h(
      'div',
      { class: 'row' + (st !== 'value' ? ' bound' : '') + (raw === undefined && st === 'value' ? ' dflt' : '') },
      h('div', { class: 'rl', title: def.l + '  ·  ' + k }, h('span', { text: def.l }), h('small', { text: k })),
      h('div', { class: 're' }, ed),
      canBind
        ? h(
            'div',
            { class: 'rb' },
            h('button', {
              class: 'tg' + (st === 'formula' ? ' on' : ''),
              title: 'Formula (calculator)',
              text: 'ƒ',
              onclick: () => tog('formula')
            }),
            def.t !== 'formula' || true
              ? h('button', {
                  class: 'tg' + (st === 'global' ? ' on' : ''),
                  title: 'Bind to a global',
                  text: '◉',
                  onclick: () => tog('global')
                })
              : null,
            raw !== undefined && st === 'value'
              ? h('button', {
                  class: 'tg',
                  title: 'Reset to default',
                  text: '↺',
                  onclick: () => {
                    setVal(o, k, undefined);
                    renderEditor();
                  }
                })
              : null
          )
        : h('div', { class: 'rb' })
    );
  }
  function keyframes(a, k) {
    const list = a[k] || (a[k] = []);
    const rowEl = (kf, i) =>
      h(
        'div',
        { class: 'kf' },
        h('input', {
          type: 'number',
          title: 'Position %',
          value: kf.position,
          oninput: e => {
            snapshot('kf' + i);
            kf.position = parseFloat(e.target.value) || 0;
            requestRender();
          }
        }),
        h(
          'select',
          {
            onchange: e => {
              snapshot();
              kf.property = e.target.value;
              requestRender();
            }
          },
          SC.KEYPROPS.map(p =>
            h('option', {
              value: p,
              text: SC.optLabel('animatorproperty', p) || pretty(p),
              selected: p === kf.property
            })
          )
        ),
        h('input', {
          type: 'number',
          step: 'any',
          title: 'Value',
          value: kf.value,
          oninput: e => {
            snapshot('kfv' + i);
            kf.value = parseFloat(e.target.value) || 0;
            requestRender();
          }
        }),
        h(
          'select',
          {
            onchange: e => {
              snapshot();
              kf.ease = e.target.value;
              requestRender();
            }
          },
          ['STRAIGHT', 'NORMAL', 'ACCELERATE', 'DECELERATE', 'OVERSHOOT', 'BOUNCE'].map(p =>
            h('option', { value: p, text: pretty(p), selected: p === kf.ease })
          )
        ),
        h('button', {
          class: 'ib',
          text: '✕',
          onclick: () => {
            snapshot();
            list.splice(i, 1);
            renderEditor();
            requestRender();
          }
        })
      );
    return h(
      'div',
      { class: 'kfs' },
      list.map(rowEl),
      h('button', {
        class: 'btn sm',
        text: '+ Keyframe',
        onclick: () => {
          snapshot();
          list.push({ position: list.length ? 100 : 0, value: 0, property: 'OPACITY', ease: 'STRAIGHT' });
          renderEditor();
        }
      })
    );
  }

  // ------------------------------------------------------------------ editor panel
  function titleOf(m) {
    return (
      m.internal_title ||
      (SC.MODULES[m.internal_type] || { name: (m.internal_type || 'Unknown').replace('Module', '') }).name
    );
  }
  function summary(m) {
    switch (m.internal_type) {
      case 'TextModule':
      case 'CurvedTextModule':
        return String(m.text_expression === undefined ? '$df(hh:mm)$' : m.text_expression).slice(0, 60);
      case 'ShapeModule':
        return pretty(m.shape_type || 'RECT');
      case 'FontIconModule':
        return m.icon_icon || '';
      case 'ProgressModule':
        return pretty(m.progress_progress || 'BATTERY');
      case 'BitmapModule':
      case 'MovieModule':
        return String(m.bitmap_bitmap || m.bitmap_movie_uri || '')
          .split('/')
          .pop()
          .slice(0, 28);
      default:
        return m.viewgroup_items ? m.viewgroup_items.length + ' item(s)' : '';
    }
  }
  function tabsFor(m) {
    const def = SC.MODULES[m.internal_type];
    const t = def ? def.tabs.slice() : [];
    t.push({ id: 'raw', label: 'Raw', special: 'raw' });
    return t;
  }
  function renderEditor() {
    if (S.panel === 'sim') return renderSim();
    const m = cur(),
      ed = $('#editor');
    const tabs = tabsFor(m);
    if (!tabs.find(t => t.id === S.tab)) S.tab = tabs[0].id;
    const tab = tabs.find(t => t.id === S.tab);
    const sc = ed.querySelector('.body');
    const scrollTop = sc ? sc.scrollTop : 0,
      keep = sc && sc.dataset.k === S.path.join('.') + '/' + S.tab;
    ed.innerHTML = '';
    const head = h(
      'div',
      { class: 'ehead' },
      typeChip(m.internal_type),
      S.path.length
        ? h('input', {
            class: 'etitle',
            value: m.internal_title || '',
            placeholder: titleOf(m),
            title: 'Item name',
            oninput: e => {
              snapshot('title');
              if (e.target.value) m.internal_title = e.target.value;
              else delete m.internal_title;
              renderCrumbs();
            }
          })
        : h('div', { class: 'etitle ro', text: S.preset.preset_info.title || 'Root' }),
      h('span', { class: 'etype', text: (SC.MODULES[m.internal_type] || { name: m.internal_type }).name })
    );
    const tabbar = h(
      'div',
      { class: 'tabs' },
      tabs.map(t =>
        h('button', {
          class: 'tab' + (t.id === S.tab ? ' on' : ''),
          text: t.label,
          onclick: () => {
            S.tab = t.id;
            S.checked.clear();
            renderEditor();
          }
        })
      )
    );
    const body = h('div', { class: 'body' });
    body.dataset.k = S.path.join('.') + '/' + S.tab;
    const parent = S.path.length ? modAt(S.path.slice(0, -1)) : null;
    if (tab.props) {
      const defs = tab.props;
      defs.forEach(d => {
        const r = propRow(m, d, {
          defs,
          inStack: parent && parent.internal_type === 'StackLayerModule',
          inRoot: S.path.length === 1
        });
        if (r) body.append(r);
      });
      if (tab.id === 'layer' && m.internal_type !== 'RootLayerModule')
        body.append(
          h('div', {
            class: 'note',
            text: 'Layer FX, colour filter and location are saved to the preset but not drawn in the preview yet.'
          })
        );
    } else if (tab.special === 'items') itemsTab(m, body);
    else if (tab.special === 'globals') globalsTab(m, body);
    else if (tab.special === 'animations')
      listTab(
        m,
        'internal_animations',
        SC.ANIM,
        'Animation',
        { type: 'SCROLL' },
        body,
        a =>
          (SC.optLabel('animationtype', a.type || 'SCROLL') || pretty(a.type || 'SCROLL')) +
          ' → ' +
          (SC.optLabel('animationaction', a.action || 'SCROLL') || pretty(a.action || 'SCROLL'))
      );
    else if (tab.special === 'events')
      listTab(
        m,
        'internal_events',
        SC.EVENT,
        'Touch action',
        { type: 'SINGLE_TAP', action: 'SWITCH_GLOBAL' },
        body,
        a => pretty(a.type || 'SINGLE_TAP') + ' → ' + pretty(a.action || 'LAUNCH_APP')
      );
    else if (tab.special === 'flows')
      rawEditor(
        body,
        () => m.internal_flows || [],
        v => {
          if (v && v.length) m.internal_flows = v;
          else delete m.internal_flows;
        },
        'Flows are edited as JSON for now. Each flow has an id, a name, triggers ("t") and actions ("a"). They are kept exactly as written.'
      );
    else if (tab.special === 'raw')
      rawEditor(
        body,
        () => {
          const c = Object.assign({}, m);
          delete c.viewgroup_items;
          return c;
        },
        v => {
          const kids = m.viewgroup_items;
          Object.keys(m).forEach(k => delete m[k]);
          Object.assign(m, v);
          if (kids) m.viewgroup_items = kids;
        },
        'Every stored property of this item, exactly as KLWP saves it. Anything this editor has no control for can be edited here.'
      );
    ed.append(h('div', { class: 'crumbs', id: 'crumbs' }), head, tabbar, body);
    renderCrumbs();
    if (keep) body.scrollTop = scrollTop;
  }
  function renderCrumbs() {
    const c = $('#crumbs');
    if (!c) return;
    c.innerHTML = '';
    const ch = chain(S.path);
    ch.forEach((m, i) => {
      if (i) c.append(h('span', { class: 'sep', text: '›' }));
      c.append(
        h('button', {
          class: 'crumb' + (i === ch.length - 1 ? ' on' : ''),
          text: i ? titleOf(m) : 'Root',
          onclick: () => {
            S.path = S.path.slice(0, i);
            S.tab = null;
            S.checked.clear();
            renderEditor();
            requestRender();
          }
        })
      );
    });
  }
  function rawEditor(body, get, set, note) {
    const ta = h('textarea', { class: 'raw', spellcheck: 'false', value: JSON.stringify(get(), null, 2) });
    const msg = h('span', { class: 'rawmsg' });
    body.append(
      h('div', { class: 'note', text: note }),
      ta,
      h(
        'div',
        { class: 'rawbar' },
        h('button', {
          class: 'btn pri',
          text: 'Apply',
          onclick: () => {
            try {
              const v = JSON.parse(ta.value);
              snapshot();
              set(v);
              msg.textContent = 'Applied';
              requestRender();
              renderCrumbs();
            } catch (e) {
              msg.textContent = 'Invalid JSON: ' + e.message;
            }
          }
        }),
        msg
      )
    );
  }

  // --- items tab
  function newModule(type) {
    const m = { internal_type: type };
    if (SC.MODULES[type].tabs[0].special === 'items' || type === 'KomponentModule') m.viewgroup_items = [];
    return m;
  }
  function itemsTab(m, body) {
    const items = m.viewgroup_items || (m.viewgroup_items = []);
    const sel = [...S.checked].filter(i => i < items.length).sort((a, b) => a - b);
    const act = (label, title, fn, on) =>
      h('button', { class: 'btn sm', text: label, title, disabled: !on, onclick: fn });
    const mut = fn => {
      snapshot();
      fn();
      S.checked.clear();
      renderEditor();
      requestRender();
    };
    body.append(
      h(
        'div',
        { class: 'ibar' },
        h('button', { class: 'btn pri sm', text: '+ Add', onclick: () => addDialog(m) }),
        act(
          'Copy',
          'Copy checked items',
          () => {
            S.clipboard = JSON.stringify(sel.map(i => items[i]));
            toast(sel.length + ' item(s) copied');
            renderEditor();
          },
          sel.length
        ),
        act(
          'Cut',
          'Cut checked items',
          () => {
            S.clipboard = JSON.stringify(sel.map(i => items[i]));
            mut(() =>
              sel
                .slice()
                .reverse()
                .forEach(i => items.splice(i, 1))
            );
          },
          sel.length
        ),
        act('Paste', 'Paste here', () => mut(() => JSON.parse(S.clipboard).forEach(x => items.push(x))), !!S.clipboard),
        act(
          'Duplicate',
          'Duplicate checked items',
          () =>
            mut(() =>
              sel
                .slice()
                .reverse()
                .forEach(i => items.splice(i + 1, 0, JSON.parse(JSON.stringify(items[i]))))
            ),
          sel.length
        ),
        act(
          '▲',
          'Move up (draws earlier / further back)',
          () => {
            if (sel[0] === 0) return;
            snapshot();
            sel.forEach(i => {
              const t = items[i - 1];
              items[i - 1] = items[i];
              items[i] = t;
            });
            S.checked = new Set(sel.map(i => i - 1));
            renderEditor();
            requestRender();
          },
          sel.length
        ),
        act(
          '▼',
          'Move down (draws later / in front)',
          () => {
            if (sel[sel.length - 1] === items.length - 1) return;
            snapshot();
            sel
              .slice()
              .reverse()
              .forEach(i => {
                const t = items[i + 1];
                items[i + 1] = items[i];
                items[i] = t;
              });
            S.checked = new Set(sel.map(i => i + 1));
            renderEditor();
            requestRender();
          },
          sel.length
        ),
        act(
          'Group',
          'Wrap checked items in an Overlap Group',
          () =>
            mut(() => {
              const g = { internal_type: 'OverlapLayerModule', viewgroup_items: sel.map(i => items[i]) };
              sel
                .slice()
                .reverse()
                .forEach(i => items.splice(i, 1));
              items.splice(sel[0], 0, g);
            }),
          sel.length
        ),
        act(
          'Delete',
          'Delete checked items',
          () =>
            mut(() =>
              sel
                .slice()
                .reverse()
                .forEach(i => items.splice(i, 1))
            ),
          sel.length
        )
      )
    );
    if (m.internal_type === 'KomponentModule' && !items.length && m.internal_readonly)
      body.append(
        h('div', {
          class: 'note',
          text: 'This Komponent is locked by its author. Its contents are encrypted, so it cannot be previewed or edited here, but it is kept intact on export.'
        })
      );
    if (!items.length) body.append(h('div', { class: 'empty', text: 'No items yet. Use “+ Add” to create one.' }));
    const gp = S.path.slice();
    const rows = [];
    // drag a row to reorder; right-click for the same quick actions as on the canvas
    const rowDrag = (row, i) => {
      row.addEventListener('contextmenu', e => {
        e.preventDefault();
        itemMenu(e.clientX, e.clientY, { gp, i });
      });
      row.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('input,.selt')) return;
        const y0 = e.clientY;
        let on = false,
          to = i,
          mark = null;
        const move = ev => {
          if (!on && Math.abs(ev.clientY - y0) < 6) return;
          if (!on) {
            on = true;
            row.classList.add('dragging');
            mark = h('div', { class: 'dropmark' });
            if (getComputedStyle(body).position === 'static') body.style.position = 'relative';
            body.append(mark);
          }
          to = rows.length;
          for (let j = 0; j < rows.length; j++) {
            const r = rows[j].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) {
              to = j;
              break;
            }
          }
          const ref = rows[Math.min(to, rows.length - 1)].getBoundingClientRect(),
            br = body.getBoundingClientRect();
          mark.style.top = (to < rows.length ? ref.top : ref.bottom) - br.top + body.scrollTop - 1 + 'px';
          row.style.transform = 'translateY(' + (ev.clientY - y0) + 'px)';
        };
        const upH = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', upH);
          if (!on) return;
          row.style.transform = '';
          row.classList.remove('dragging');
          if (mark) mark.remove();
          // swallow the click that ends the drag
          window.addEventListener('click', ce => ce.stopPropagation(), { capture: true, once: true });
          const j = to > i ? to - 1 : to;
          if (j === i) return;
          snapshot();
          const it = items.splice(i, 1)[0];
          items.splice(j, 0, it);
          S.checked.clear();
          S.dirty = true;
          updateBar();
          renderEditor();
          requestRender();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', upH);
      });
      return row;
    };
    items.forEach((it, i) =>
      body.append(
        (rows[i] = rowDrag(
          h(
            'div',
            { class: 'item' + (S.checked.has(i) ? ' ck' : '') },
            h('input', {
              type: 'checkbox',
              checked: S.checked.has(i),
              onchange: e => {
                if (e.target.checked) S.checked.add(i);
                else S.checked.delete(i);
                renderEditor();
              }
            }),
            h(
              'button',
              {
                class: 'ibody',
                onclick: () => {
                  S.path = S.path.concat(i);
                  S.tab = null;
                  S.checked.clear();
                  renderEditor();
                  requestRender();
                }
              },
              typeChip(it.internal_type),
              h('span', { class: 'iname' }, h('b', { text: titleOf(it) }), h('small', { text: summary(it) })),
              (it.internal_animations || []).length
                ? h('span', { class: 'badge', text: 'anim', title: 'Has animations' })
                : null,
              (it.internal_events || []).length
                ? h('span', { class: 'badge', text: 'touch', title: 'Has touch actions' })
                : null,
              it.config_visible && it.config_visible !== 'ALWAYS'
                ? h('span', { class: 'badge', text: pretty(it.config_visible) })
                : null,
              h('span', { class: 'go', text: '›' })
            ),
            h(
              'button',
              {
                class: 'selt' + (it[NOSEL] ? ' off' : ''),
                title: it[NOSEL]
                  ? 'Not selectable in the preview: clicks go to whatever is underneath. Click to make it selectable again.'
                  : 'Selectable in the preview. Click to let clicks pass through it to the items underneath.',
                onclick: () => {
                  snapshot();
                  if (it[NOSEL]) delete it[NOSEL];
                  else it[NOSEL] = true;
                  S.dirty = true;
                  updateBar();
                  renderEditor();
                }
              },
              h('span', { html: '<svg><use href="#' + (it[NOSEL] ? 'i-nosel' : 'i-sel') + '"/></svg>' })
            )
          ),
          i
        ))
      )
    );
  }
  function addDialog(m) {
    let dl;
    const grid = h(
      'div',
      { class: 'addgrid' },
      SC.ADDABLE.map(t =>
        h(
          'button',
          {
            class: 'addc',
            onclick: () => {
              if (t === 'KomponentModule') {
                dl.close();
                return pickFile('.komp,.zip', (f, b) => importKomponent(m, b));
              }
              snapshot();
              m.viewgroup_items.push(newModule(t));
              dl.close();
              S.path = S.path.concat(m.viewgroup_items.length - 1);
              S.tab = null;
              S.checked.clear();
              renderEditor();
              requestRender();
            }
          },
          typeChip(t, true),
          h('span', { text: SC.MODULES[t].name + (t === 'KomponentModule' ? ' (from .komp file)' : '') })
        )
      )
    );
    dl = dialog(
      'Add item',
      [
        grid,
        h('div', {
          class: 'note',
          text: 'Morphing Text and Series are not offered yet: none of your presets use them, so their saved format could not be checked. Existing ones in a loaded preset are kept untouched.'
        })
      ],
      [['Cancel']]
    );
  }
  async function importKomponent(m, bytes) {
    try {
      const z = await JSZip.loadAsync(bytes);
      const jn = Object.keys(z.files).find(n => /komponent\.json$|preset\.json$/.test(n));
      const j = JSON.parse(await z.file(jn).async('string'));
      for (const n of Object.keys(z.files))
        if (!z.files[n].dir && /^(fonts|icons|bitmaps)\//.test(n) && !S.files.has(n))
          S.files.set(n, await z.file(n).async('uint8array'));
      snapshot();
      const k = j.preset_root;
      if (k.internal_type !== 'KomponentModule') k.internal_type = 'KomponentModule';
      m.viewgroup_items.push(k);
      A.reset();
      renderEditor();
      requestRender();
      toast('Komponent added');
    } catch (e) {
      toast('Could not read that Komponent: ' + e.message);
    }
  }

  // --- globals tab
  function globalsTab(m, body) {
    const list = m.globals_list || {};
    const keys = Object.keys(list).sort((a, b) => (list[a].index || 0) - (list[b].index || 0));
    body.append(
      h(
        'div',
        { class: 'ibar' },
        h('button', { class: 'btn pri sm', text: '+ Add global', onclick: () => globalForm(m, null) }),
        h('span', {
          class: 'hint',
          text: 'Values changed by touch actions in the preview are temporary and never saved.'
        })
      )
    );
    if (!keys.length)
      body.append(h('div', { class: 'empty', text: 'No globals. Globals are variables you can bind properties to.' }));
    keys.forEach(key => {
      const g = list[key];
      const depth = key.split('/').length - 1;
      const isF = g.toggles === 10;
      let ed;
      const set = v => {
        snapshot('g:' + key);
        if (v === undefined) delete g.value;
        else g.value = v;
        S.views.forEach(x => x.rt.globals.delete(key));
        requestRender();
      };
      if (g.type === 'FOLDER') ed = h('span', { class: 'hint', text: g.description || 'Folder' });
      else if (isF) {
        const r = evalNow(g.global_formula || '');
        ed = h(
          'button',
          {
            class: 'fbtn' + (r.error ? ' err' : ''),
            onclick: () =>
              formulaDialog(g.title, g.global_formula || '', v => {
                snapshot();
                g.global_formula = v;
                renderEditor();
                requestRender();
              })
          },
          h('code', { text: g.global_formula || '(empty formula)' }),
          h('span', { class: 'fval', text: '= ' + r.value })
        );
      } else
        switch (g.type) {
          case 'COLOR':
            ed = colorEditor(g.value || '#FFFFFFFF', v => set(v));
            break;
          case 'NUMBER':
            ed = numberEditor(g.value === undefined ? 0 : g.value, { min: g.min, max: g.max }, v => set(v));
            break;
          case 'SWITCH':
            ed = h(
              'label',
              { class: 'sw' },
              h('input', {
                type: 'checkbox',
                checked: F.num(g.value) !== 0,
                onchange: e => {
                  set(e.target.checked ? 1 : 0);
                }
              }),
              'On'
            );
            break;
          case 'LIST': {
            const ent = String(g.entries || '')
              .split(',')
              .filter(Boolean)
              .map(s => s.split('##'));
            ed = h(
              'select',
              { onchange: e => set(e.target.value) },
              ent.map(en => h('option', { value: en[0], text: en[1] || en[0], selected: en[0] === String(g.value) }))
            );
            break;
          }
          case 'BITMAP':
            ed = assetEditor({ t: 'bitmap' }, g.value, v => {
              set(v);
              renderEditor();
            });
            break;
          case 'FONT':
            ed = assetEditor({ t: 'font' }, g.value, v => {
              set(v);
              renderEditor();
            });
            break;
          default: {
            const r = evalNow(String(g.value === undefined ? '' : g.value));
            ed = h(
              'button',
              {
                class: 'fbtn',
                onclick: () =>
                  formulaDialog(g.title, String(g.value === undefined ? '' : g.value), v => {
                    snapshot();
                    g.value = v;
                    renderEditor();
                    requestRender();
                  })
              },
              h('code', { text: String(g.value === undefined ? '' : g.value) || '(empty)' }),
              String(g.value).indexOf('$') >= 0 ? h('span', { class: 'fval', text: '= ' + r.value }) : null
            );
          }
        }
      body.append(
        h(
          'div',
          { class: 'row grow' + (isF ? ' bound' : ''), style: { paddingLeft: 12 + depth * 18 + 'px' } },
          h(
            'div',
            { class: 'rl gl' },
            h('span', {
              class: 'gtype g-' + String(g.type || 'TEXT').toLowerCase(),
              title: pretty(g.type || 'TEXT') + (isF ? ' (formula)' : ''),
              html:
                g.type === 'COLOR'
                  ? '<i style="background:' +
                    R.css(isF ? evalNow(g.global_formula || '').value : g.value, '#00000000') +
                    '"></i>'
                  : typeSvg(g.type || 'TEXT')
            }),
            h(
              'div',
              { class: 'rlt' },
              h('span', { text: g.title || key }),
              h('small', { text: pretty(g.type) + ' · gv(' + key + ')' })
            )
          ),
          h('div', { class: 're' }, ed),
          h(
            'div',
            { class: 'rb' },
            g.type !== 'FOLDER'
              ? h('button', {
                  class: 'tg' + (isF ? ' on' : ''),
                  text: 'ƒ',
                  title: 'Formula',
                  onclick: () => {
                    snapshot();
                    if (isF) g.toggles = 0;
                    else {
                      g.toggles = 10;
                      if (g.global_formula === undefined) g.global_formula = '';
                    }
                    renderEditor();
                    requestRender();
                  }
                })
              : null,
            h('button', { class: 'tg', text: '✎', title: 'Edit name / options', onclick: () => globalForm(m, key) }),
            h('button', {
              class: 'tg',
              text: '✕',
              title: 'Delete',
              onclick: () => {
                snapshot();
                Object.keys(list).forEach(k2 => {
                  if (k2 === key || k2.indexOf(key + '/') === 0) delete list[k2];
                });
                renderEditor();
                requestRender();
              }
            })
          )
        )
      );
    });
  }
  function globalForm(m, key) {
    const list = m.globals_list || {};
    const g = key ? list[key] : null;
    const folders = [''].concat(Object.keys(list).filter(k => list[k].type === 'FOLDER'));
    const fields = [
      { k: 'title', l: 'Title', v: g ? g.title : '' },
      { k: 'description', l: 'Description', v: g ? g.description || '' : '' }
    ];
    if (!g) {
      fields.push({ k: 'type', l: 'Type', options: SC.GLOBAL_TYPES, v: 'TEXT' });
      fields.push({ k: 'folder', l: 'Folder', options: folders, v: '' });
    }
    if (!g || g.type === 'NUMBER') {
      fields.push({ k: 'min', l: 'Min (number)', v: g && g.min !== undefined ? g.min : 0, type: 'number' });
      fields.push({ k: 'max', l: 'Max (number)', v: g && g.max !== undefined ? g.max : 720, type: 'number' });
    }
    if (!g || g.type === 'LIST')
      fields.push({
        k: 'entries',
        l: 'List entries (value##Label, comma separated)',
        v: g ? g.entries || '' : '',
        type: 'area'
      });
    form(g ? 'Edit global' : 'Add global', fields, o => {
      if (!o.title.trim()) {
        toast('A title is required');
        return false;
      }
      snapshot();
      if (!m.globals_list) m.globals_list = {};
      const L = m.globals_list;
      if (g) {
        g.title = o.title.trim();
        if (o.description) g.description = o.description;
        else delete g.description;
        if (g.type === 'NUMBER') {
          g.min = parseFloat(o.min) || 0;
          g.max = parseFloat(o.max) || 0;
        }
        if (g.type === 'LIST') g.entries = o.entries;
      } else {
        const k2 =
          (o.folder ? o.folder + '/' : '') +
          o.title
            .trim()
            .toLowerCase()
            .replace(/[\s/]+/g, '_');
        if (L[k2]) {
          toast('A global with that name already exists');
          S.undo.pop();
          return false;
        }
        const ng = {
          index: Object.keys(L).reduce((a, x) => Math.max(a, L[x].index || 0), 0) + 1,
          type: o.type,
          title: o.title.trim()
        };
        if (o.description) ng.description = o.description;
        if (o.type === 'NUMBER') {
          ng.min = parseFloat(o.min) || 0;
          ng.max = parseFloat(o.max) || 0;
          ng.value = 0;
        } else if (o.type === 'COLOR') ng.value = '#FFFFFFFF';
        else if (o.type === 'SWITCH') ng.value = 0;
        else if (o.type === 'LIST') {
          ng.entries = o.entries;
          ng.value = (o.entries.split(',')[0] || '').split('##')[0];
        } else if (o.type === 'TEXT') ng.value = '';
        L[k2] = ng;
      }
      renderEditor();
      requestRender();
    });
  }

  // --- animations / touch lists
  function listTab(m, key, defs, label, fresh, body, describe) {
    const list = m[key] || [];
    body.append(
      h(
        'div',
        { class: 'ibar' },
        h('button', {
          class: 'btn pri sm',
          text: '+ Add ' + label.toLowerCase(),
          onclick: () => {
            snapshot();
            (m[key] = m[key] || []).push(JSON.parse(JSON.stringify(fresh)));
            renderEditor();
            requestRender();
          }
        }),
        key === 'internal_animations'
          ? h('span', {
              class: 'hint',
              text: '▶ Play on an animation runs just that one in the preview: forward, a short pause, then back (scroll animations sweep across the screens).'
            })
          : h('span', { class: 'hint', text: 'Turn on “Touch” above the preview to test actions by clicking.' })
      )
    );
    if (!list.length) body.append(h('div', { class: 'empty', text: 'Nothing here yet.' }));
    list.forEach((a, i) => {
      const card = h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'card-h' },
          h('b', { text: label + ' ' + (i + 1) }),
          h('span', { text: describe(a) }),
          key === 'internal_animations'
            ? h(
                'button',
                {
                  class: 'btn sm playanim',
                  title: 'Play this animation in the preview',
                  onclick: () => {
                    S.views.forEach(v => {
                      v.rt.preview = { m, idx: i, t0: performance.now() };
                    });
                    requestRender();
                  }
                },
                '▶ Play'
              )
            : null,
          h('button', {
            class: 'ib',
            text: '▲',
            title: 'Move up',
            disabled: i === 0,
            onclick: () => {
              snapshot();
              list.splice(i - 1, 0, list.splice(i, 1)[0]);
              renderEditor();
              requestRender();
            }
          }),
          h('button', {
            class: 'ib',
            text: '✕',
            title: 'Remove',
            onclick: () => {
              snapshot();
              list.splice(i, 1);
              if (!list.length) delete m[key];
              renderEditor();
              requestRender();
            }
          })
        )
      );
      defs.forEach(d => {
        const r = propRow(a, d, { defs, idp: key + i + ':' });
        if (r) card.append(r);
      });
      body.append(card);
    });
  }

  // ------------------------------------------------------------------ file IO
  async function openFile(file) {
    thumbUrls.forEach(u => u && URL.revokeObjectURL(u));
    thumbUrls.clear();
    try {
      const z = await JSZip.loadAsync(await file.arrayBuffer());
      const files = new Map();
      for (const n of Object.keys(z.files)) if (!z.files[n].dir) files.set(n, await z.file(n).async('uint8array'));
      const jn =
        [...files.keys()].find(n => /^(preset|komponent)\.json$/.test(n)) ||
        [...files.keys()].find(n => /\.json$/.test(n) && n.indexOf('/') < 0 && n !== META_FILE);
      if (!jn) throw new Error('no preset.json inside');
      const txt = new TextDecoder().decode(files.get(jn));
      const p = JSON.parse(txt);
      if (!p.preset_root) throw new Error('not a Kustom preset');
      S.preset = p;
      S.files = files;
      S.jsonName = jn;
      S.fileName = file.name;
      S.meta = readMeta();
      applyMeta();
      S.baseUsed = usedThings();
      S.pretty = /\n\s+"/.test(txt.slice(0, 400));
      S.path = [];
      S.tab = null;
      S.undo = [];
      S.redo = [];
      S.dirty = false;
      S.checked.clear();
      A.reset();
      S.views.forEach(v => {
        v.rt = R.newRuntime();
      });
      {
        // the screen counts KLWP saved with the preset (preset_info.xscreens / yscreens); worked out from the
        // animations only when they are missing
        const info = p.preset_info || {},
          js = JSON.stringify(p);
        let n = 1;
        if (/"type":"SCROLL"|"center":/.test(js)) n = 3;
        (js.match(/"SCREEN(\d)"/g) || []).forEach(x => {
          n = Math.max(n, parseInt(x.slice(7), 10));
        });
        if (/"CENTER_[MP]2"/.test(js)) n = Math.max(n, 5);
        if (info.xscreens > 0) n = Math.min(9, Math.round(info.xscreens));
        S.screens = n;
        S.scroll = Math.floor((n - 1) / 2);
        let ny = info.yscreens > 0 ? Math.min(9, Math.round(info.yscreens)) : /"type":"SCROLL_Y"/.test(js) ? 3 : 1;
        S.yscreens = ny;
        S.yscroll = 0;
      }
      syncBar();
      renderEditor();
      layoutViews();
      updateBar();
      toast('Opened ' + file.name);
    } catch (e) {
      toast('Could not open ' + file.name + ': ' + e.message);
    }
  }
  // what the preset uses that KLWP records as a required feature
  function usedThings() {
    const used = new Set();
    (function walk(o) {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        if (o.type === 'VISUALIZER' || o.type === 'GYRO') used.add('anim:' + o.type);
        Object.keys(o).forEach(k => walk(o[k]));
      } else if (typeof o === 'string' && o.indexOf('$') >= 0)
        try {
          F.usedFunctions(o).forEach(fn => used.add(fn));
        } catch (e) {
          /* ignore */
        }
    })(S.preset.preset_root);
    return used;
  }
  // KLWP's own feature list is kept as loaded; only things added in this editor contribute new flags
  function usedFeatures() {
    const feats = String(S.preset.preset_info.features || '')
      .split(/\s+/)
      .filter(Boolean);
    usedThings().forEach(u => {
      const f = SC.FEATURES[u];
      if (f && !S.baseUsed.has(u) && feats.indexOf(f) < 0) feats.push(f);
    });
    return feats.join(' ');
  }
  // render the preset off screen; fonts and images that are still loading get a moment and a second pass
  async function renderOff(w, hh) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    const rt = R.newRuntime();
    rt.globals = new Map(S.views[0].rt.globals);
    const o = {
      pxW: w,
      pxH: hh,
      screens: S.screens,
      scroll: Math.min(S.scroll, S.screens - 1),
      locked: false,
      play: false,
      now: simNow()
    };
    R.render(c, state(), o, rt);
    await new Promise(r => setTimeout(r, 400));
    R.render(c, state(), o, rt);
    return { c, rt };
  }
  const jpeg = c =>
    new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', 0.8));
  async function thumb(w, hh) {
    return jpeg((await renderOff(w, hh)).c);
  }
  async function kompThumb() {
    const { c, rt } = await renderOff(1080, 1920);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    rt.hits.forEach(hh => {
      if (hh.m === root()) return;
      [
        [0, 0],
        [hh.w, 0],
        [0, hh.h],
        [hh.w, hh.h]
      ].forEach(([x, y]) => {
        const p = hh.mt.transformPoint(new DOMPoint(x, y));
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      });
    });
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(c.width, Math.ceil(x1));
    y1 = Math.min(c.height, Math.ceil(y1));
    if (!(x1 > x0 && y1 > y0)) return jpeg(c);
    const k = 1024 / Math.max(x1 - x0, y1 - y0),
      out = document.createElement('canvas');
    out.width = Math.max(1, Math.round((x1 - x0) * k));
    out.height = Math.max(1, Math.round((y1 - y0) * k));
    out.getContext('2d').drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
    return jpeg(out);
  }
  function referenced() {
    const s = new Set();
    (function w(o) {
      if (Array.isArray(o)) o.forEach(w);
      else if (o && typeof o === 'object') Object.keys(o).forEach(k => w(o[k]));
      else if (typeof o === 'string' && o.indexOf(KF) >= 0) {
        // a value that is just the address keeps its whole name, spaces included ("fonts/My Font Demo.ttf");
        // inside a formula the name runs up to the file extension
        if (o.indexOf(KF) === 0 && !/[$"]/.test(o)) s.add(o.slice(KF.length));
        else {
          const re =
            /kfile:\/\/org\.kustom\.provider\/((?:fonts|icons|bitmaps)\/(?:IMG[0-9a-f]+|[^"'$,)]+?\.(?:ttf|otf|json|png|jpe?g|gif|webp|bmp|svg)))/gi;
          let m;
          while ((m = re.exec(o))) s.add(m[1]);
        }
      }
    })(S.preset);
    return s;
  }
  function uuid() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }
  // make the archive headers identical to what KLWP (java.util.zip) writes: version 2.0, flags 0x808 (data descriptor + UTF-8), no host system
  function javaZip(u) {
    const d = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = u.length - 22;
    while (e >= 0 && d.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return u;
    let p = d.getUint32(e + 16, true);
    const n = d.getUint16(e + 10, true);
    for (let i = 0; i < n && d.getUint32(p, true) === 0x02014b50; i++) {
      d.setUint16(p + 4, 20, true);
      d.setUint16(p + 6, 20, true);
      d.setUint16(p + 8, d.getUint16(p + 8, true) | 0x808, true);
      d.setUint16(p + 36, 0, true);
      d.setUint32(p + 38, 0, true);
      const l = d.getUint32(p + 42, true);
      if (d.getUint32(l, true) === 0x04034b50) {
        d.setUint16(l + 4, 20, true);
        d.setUint16(l + 6, d.getUint16(l + 6, true) | 0x808, true);
      }
      p += 46 + d.getUint16(p + 28, true) + d.getUint16(p + 30, true) + d.getUint16(p + 32, true);
    }
    return u;
  }
  // Save as: a new file name (the title stays as it is), then save
  function saveAs(mode) {
    const cur =
      S.fileName && /\.(klwp|komp|kwgt|klck|kntf)$/i.test(S.fileName)
        ? S.fileName
        : fileSlug(S.preset.preset_info.title) + '.klwp';
    const ext = (/\.[a-z]+$/i.exec(cur) || ['.klwp'])[0];
    form('Save as', [{ k: 'n', l: 'File name', v: cur.replace(/\.[a-z]+$/i, '') }], o => {
      const n = String(o.n || '')
        .trim()
        .replace(/[|\\/:*?"<>]/g, '_')
        .replace(/\.(klwp|komp|kwgt|klck|kntf)$/i, '');
      if (!n) {
        toast('Type a file name');
        return false;
      }
      S.fileName = n + ext;
      updateBar();
      exportFile(mode === 'wallpaper' ? 'wallpaper' : HOST ? 'kustom' : undefined);
    });
  }
  let exportBusy = false,
    exportMissed = false;
  async function exportFile(mode) {
    exportBusy = true;
    try {
      return await exportFileNow(mode);
    } finally {
      exportBusy = false;
      if (exportMissed) {
        exportMissed = false;
        requestRender();
      }
    }
  }
  async function exportFileNow(mode) {
    const info = S.preset.preset_info;
    // the screen counts, where KLWP keeps them (the wallpaper and the phone read them back)
    info.xscreens = S.screens;
    info.yscreens = S.yscreens > 1 ? S.yscreens : 0;
    info.features = usedFeatures();
    const z = new JSZip();
    const isKomp = /komponent/.test(S.jsonName);
    // pull referenced files in from the Kustom folder library (read from disk now if they were not needed before)
    {
      const want = [];
      referenced().forEach(p => {
        want.push(p);
        if (/^icons\/.*\.ttf$/i.test(p)) want.push(p.replace(/\.ttf$/i, '.json'));
      });
      await Promise.all(want.filter(p => !S.files.has(p) && S.library.has(p)).map(p => S.library.load(p)));
    }
    referenced().forEach(p => {
      if (!S.files.has(p) && S.library.has(p)) S.files.set(p, S.library.get(p));
      if (/^icons\/.*\.ttf$/i.test(p)) {
        const j = p.replace(/\.ttf$/i, '.json');
        if (!S.files.has(j) && S.library.has(j)) S.files.set(j, S.library.get(j));
      }
    });
    const missing = [...referenced()].filter(p => !S.files.has(p));
    // thumbnails the way KLWP saves them: 1024 pixels on the long side at the preset's own screen shape, in portrait
    // and landscape (a komponent: the komponent itself, cropped)
    {
      const v = S.views[0],
        pw = info.width || Math.min(v.w, v.h),
        ph = info.height || Math.max(v.w, v.h),
        sh = Math.floor((1024 * Math.min(pw, ph)) / Math.max(pw, ph));
      try {
        if (isKomp) S.files.set('komponent_thumb.jpg', await kompThumb());
        else {
          S.files.set('preset_thumb_portrait.jpg', await thumb(sh, 1024));
          S.files.set('preset_thumb_landscape.jpg', await thumb(1024, sh));
        }
      } catch (e) {
        /* keep the old thumbnails */
      }
    }
    // bundled images get KLWP-style names (IMG + hash, no extension) and every reference follows
    {
      let js = JSON.stringify(S.preset),
        changed = false;
      for (const n of [...S.files.keys()]) {
        if (!/^bitmaps\/.+\.[A-Za-z0-9]{2,5}$/.test(n)) continue;
        const b = S.files.get(n),
          nn = 'bitmaps/IMG' + hashHex(b);
        S.files.delete(n);
        S.files.set(nn, b);
        js = js.split(JSON.stringify(KF + n).slice(1, -1)).join(KF + nn);
        changed = true;
      }
      if (changed) {
        const path = S.path,
          tab = S.tab;
        S.preset = JSON.parse(js);
        S.path = path;
        S.tab = tab;
        A.reset();
        renderEditor();
        requestRender();
      }
    }
    S.files.set(
      S.jsonName,
      new TextEncoder().encode(S.pretty ? JSON.stringify(S.preset, null, 2) : JSON.stringify(S.preset))
    );
    // the editor's own per-theme settings ride along as an entry KLWP ignores
    if (Object.keys(S.meta || {}).length)
      S.files.set(META_FILE, new TextEncoder().encode(JSON.stringify(Object.assign({ kwlwp: 1 }, S.meta))));
    else S.files.delete(META_FILE);
    saveMeta(false);
    // same layout as KLWP's own archives: preset first, then thumbnails, then assets, and no folder entries
    const rank = n => (n === S.jsonName ? 0 : /thumb/.test(n) ? 1 : 2),
      date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000 - 120000); // zip times are local time (JSZip writes the UTC fields); a time in the phone's future makes KLWP refuse the file
    [...S.files.keys()]
      .sort((a, b) => rank(a) - rank(b))
      .forEach(n => z.file(n, S.files.get(n), { createFolders: false, date }));
    const u8 = javaZip(
        await z.generateAsync({
          type: 'uint8array',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
          platform: 'DOS',
          streamFiles: true
        })
      ),
      blob = new Blob([u8], { type: 'application/zip' });
    let name = S.fileName;
    if (!/\.(klwp|komp|kwgt|klck|kntf)$/i.test(name))
      name = (info.title || 'Untitled').replace(/[^\w.\- ]/g, '_') + '.klwp';
    if (HOST && mode !== 'download') {
      // the app writes it straight into the Kustom folder
      let b = '';
      for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      name = name.replace(/[|\\/:*?"<>]/g, '_');
      S.fileName = name;
      hostMsg('save:' + (mode === 'wallpaper' ? '1' : '0') + '|' + name + '|' + btoa(b));
      S.dirty = false;
      updateBar();
      toast(
        (mode === 'wallpaper'
          ? 'Saved and set as the desktop wallpaper: '
          : 'Saved to your Kustom folder: wallpapers/') +
          name +
          (missing.length ? ' – ' + missing.length + ' referenced file(s) are not in the preset' : '')
      );
      return;
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    S.dirty = false;
    updateBar();
    toast(
      missing.length
        ? 'Exported ' +
            name +
            ' – ' +
            missing.length +
            ' referenced file(s) are not in the preset: ' +
            missing.slice(0, 3).join(', ')
        : 'Exported ' + name
    );
  }
  async function loadLibrary(fileList, quiet) {
    let n = 0,
      skipped = 0;
    const presets = [];
    S.library = new LazyLib();
    for (const f of fileList) {
      let rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      const k = rel.toLowerCase().indexOf('kustom/');
      rel = k >= 0 && (k === 0 || rel[k - 1] === '/') ? rel.slice(k + 7) : rel.split('/').slice(1).join('/');
      if (/\.(klwp|komp)$/i.test(f.name)) {
        presets.push({ file: f, path: rel || f.name });
        continue;
      }
      if (!rel || /^(wallpapers|komponents|autosave|notifications|widgets|lockscreens)\//i.test(rel)) continue;
      if (/\.(kwgt|klck|kntf|zip)$/i.test(f.name)) continue;
      if (f.size > 6e7) {
        skipped++;
        continue;
      }
      if (/^fave_formulas\.json$/.test(rel)) {
        try {
          S.faves = JSON.parse(await f.text());
        } catch (e) {
          /* ignore */
        }
        continue;
      }
      // read later, when something uses it
      S.library.add(rel, () => f.arrayBuffer(), f.size);
      n++;
    }
    if (!quiet) S.presetFiles = presets;
    A.reset();
    renderEditor();
    requestRender();
    if (S.galleryAfterFolder) {
      S.galleryAfterFolder = false;
      browseDialog();
      return;
    }
    if (quiet) return;
    toast(
      n +
        ' files from your Kustom folder are now available (fonts, icon sets, images, text files)' +
        (S.faves.length ? ', plus ' + S.faves.length + ' favourite formulas' : '') +
        (skipped ? '; ' + skipped + ' very large file(s) skipped' : '')
    );
  }

  // ------------------------------------------------------------------ top bars
  function updateBar() {
    $('#ptitle').textContent = (S.preset.preset_info.title || 'Untitled') + (S.dirty ? ' •' : '');
    $('#fname').textContent = S.fileName;
    $('#undo').disabled = !S.undo.length;
    $('#redo').disabled = !S.redo.length;
  }
  function syncBar() {
    $('#screens').value = S.screens;
    $('#yscreens').value = S.yscreens;
    const sl = $('#scroll');
    sl.max = Math.max(0, S.screens - 1);
    sl.value = S.scroll;
    sl.disabled = S.screens < 2;
    $('#scrollv').textContent =
      Math.round((+S.scroll + 1) * 10) / 10 +
      ' / ' +
      S.screens +
      (S.yscreens > 1 ? '  ·  ' + Math.round((+S.yscroll + 1) * 10) / 10 + ' / ' + S.yscreens + ' ↕' : '');
  }
  // a file name made from a title: what KLWP does when it saves ("My Theme 2" -> "My_Theme_2")
  const fileSlug = t =>
    String(t || 'Untitled')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w.\-]/g, '_') || 'Untitled';
  function infoDialog() {
    const i = S.preset.preset_info;
    const m = /^(.*?)(\.(klwp|komp|kwgt|klck|kntf))?$/i.exec(S.fileName || ''),
      ext = m[2] || (/komponent/.test(S.jsonName) ? '.komp' : '.klwp');
    const ins = form(
      'Preset info',
      [
        { k: 'title', l: 'Title', v: i.title },
        { k: 'file', l: 'File name (' + ext + ')', v: m[1] || fileSlug(i.title) },
        { k: 'description', l: 'Description', v: i.description, type: 'area' },
        { k: 'author', l: 'Author', v: i.author || '' },
        { k: 'email', l: 'Email', v: i.email || '' }
      ],
      o => {
        const file = String(o.file || '')
          .trim()
          .replace(/\.(klwp|komp|kwgt|klck|kntf)$/i, '')
          .replace(/[\\/:*?"<>|]/g, '_');
        if (!file) {
          toast('The file name cannot be empty');
          return false;
        }
        snapshot();
        i.title = o.title;
        i.description = o.description;
        if (o.author) i.author = o.author;
        else delete i.author;
        if (o.email) i.email = o.email;
        else delete i.email;
        const renamed = file + ext !== S.fileName;
        S.fileName = file + ext;
        if (renamed) {
          S.dirty = true;
          toast(
            HOST
              ? 'The next save writes ' + S.fileName + ' (the old file is kept)'
              : 'Exports are now named ' + S.fileName
          );
        }
        updateBar();
        renderEditor();
      }
    );
    // the file name follows the title while it still matches it
    let follows = ins.file.value === fileSlug(i.title) || /^Untitled$/i.test(ins.file.value);
    ins.file.addEventListener('input', () => {
      follows = ins.file.value === fileSlug(ins.title.value);
    });
    ins.title.addEventListener('input', () => {
      if (follows) ins.file.value = fileSlug(ins.title.value);
    });
  }
  // ------------------------------------------------------------------ simulated device data
  const ICON_KINDS = [
    'chat',
    'bell',
    'mail',
    'check',
    'phone',
    'music',
    'calendar',
    'download',
    'person',
    'alarm',
    'cloud',
    'dot'
  ];
  const WEATHER_ICONS = [
    'CLEAR',
    'PARTLY_CLOUDY',
    'MOSTLY_CLOUDY',
    'CLOUDY',
    'FOG',
    'MIST',
    'WINDY',
    'SHOWER',
    'RAIN',
    'TSTORM',
    'TSHOWER',
    'SLEET',
    'SNOW',
    'LIGHT_SNOW',
    'HAIL',
    'TORNADO',
    'UNKNOWN'
  ];
  // white status-bar style glyphs, drawn so no artwork has to ship with the editor
  function simImage(uri) {
    const c = document.createElement('canvas'),
      kind = uri.replace(/^sim:(icon\/)?/, '');
    if (kind === 'cover') {
      c.width = c.height = 512;
      const o = c.getContext('2d'),
        g = o.createLinearGradient(0, 0, 512, 512);
      g.addColorStop(0, '#ff7a59');
      g.addColorStop(0.55, '#b5179e');
      g.addColorStop(1, '#3a0ca3');
      o.fillStyle = g;
      o.fillRect(0, 0, 512, 512);
      o.fillStyle = 'rgba(255,255,255,.9)';
      o.beginPath();
      o.ellipse(200, 350, 62, 46, -0.3, 0, 7);
      o.fill();
      o.beginPath();
      o.ellipse(350, 310, 62, 46, -0.3, 0, 7);
      o.fill();
      o.fillRect(246, 130, 22, 225);
      o.fillRect(396, 96, 22, 220);
      o.beginPath();
      o.moveTo(246, 130);
      o.lineTo(418, 96);
      o.lineTo(418, 150);
      o.lineTo(246, 184);
      o.fill();
      return c;
    }
    c.width = c.height = 96;
    const o = c.getContext('2d');
    o.fillStyle = '#fff';
    o.strokeStyle = '#fff';
    o.lineWidth = 9;
    o.lineCap = 'round';
    o.lineJoin = 'round';
    const rr = (x, y, w, hh, r) => {
      o.beginPath();
      o.roundRect(x, y, w, hh, r);
    };
    switch (kind) {
      case 'bell':
        o.beginPath();
        o.moveTo(48, 10);
        o.bezierCurveTo(26, 12, 22, 34, 22, 48);
        o.lineTo(22, 60);
        o.lineTo(12, 72);
        o.lineTo(84, 72);
        o.lineTo(74, 60);
        o.lineTo(74, 48);
        o.bezierCurveTo(74, 34, 70, 12, 48, 10);
        o.fill();
        o.beginPath();
        o.arc(48, 80, 9, 0, Math.PI);
        o.fill();
        break;
      case 'mail':
        rr(10, 20, 76, 56, 8);
        o.fill();
        o.globalCompositeOperation = 'destination-out';
        o.lineWidth = 7;
        o.beginPath();
        o.moveTo(14, 26);
        o.lineTo(48, 52);
        o.lineTo(82, 26);
        o.stroke();
        break;
      case 'check':
        o.beginPath();
        o.arc(48, 48, 38, 0, 7);
        o.fill();
        o.globalCompositeOperation = 'destination-out';
        o.beginPath();
        o.moveTo(29, 49);
        o.lineTo(43, 63);
        o.lineTo(68, 35);
        o.stroke();
        break;
      case 'phone':
        o.beginPath();
        o.moveTo(22, 12);
        o.lineTo(38, 12);
        o.lineTo(44, 32);
        o.lineTo(34, 40);
        o.bezierCurveTo(40, 52, 46, 58, 58, 64);
        o.lineTo(66, 54);
        o.lineTo(86, 60);
        o.lineTo(86, 76);
        o.bezierCurveTo(50, 90, 6, 48, 22, 12);
        o.fill();
        break;
      case 'music':
        o.beginPath();
        o.ellipse(30, 70, 15, 11, -0.3, 0, 7);
        o.fill();
        o.beginPath();
        o.ellipse(68, 62, 15, 11, -0.3, 0, 7);
        o.fill();
        o.fillRect(38, 20, 7, 50);
        o.fillRect(76, 12, 7, 50);
        o.beginPath();
        o.moveTo(38, 20);
        o.lineTo(83, 12);
        o.lineTo(83, 26);
        o.lineTo(38, 34);
        o.fill();
        break;
      case 'calendar':
        rr(12, 18, 72, 66, 8);
        o.fill();
        o.fillRect(26, 8, 9, 20);
        o.fillRect(61, 8, 9, 20);
        o.globalCompositeOperation = 'destination-out';
        o.fillRect(20, 40, 56, 36);
        break;
      case 'download':
        o.beginPath();
        o.moveTo(48, 10);
        o.lineTo(48, 56);
        o.moveTo(28, 40);
        o.lineTo(48, 60);
        o.lineTo(68, 40);
        o.moveTo(16, 80);
        o.lineTo(80, 80);
        o.stroke();
        break;
      case 'person':
        o.beginPath();
        o.arc(48, 30, 18, 0, 7);
        o.fill();
        o.beginPath();
        o.moveTo(12, 86);
        o.bezierCurveTo(12, 50, 84, 50, 84, 86);
        o.fill();
        break;
      case 'alarm':
        o.beginPath();
        o.arc(48, 52, 32, 0, 7);
        o.fill();
        o.beginPath();
        o.moveTo(14, 26);
        o.lineTo(28, 12);
        o.moveTo(82, 26);
        o.lineTo(68, 12);
        o.stroke();
        o.globalCompositeOperation = 'destination-out';
        o.lineWidth = 7;
        o.beginPath();
        o.moveTo(48, 32);
        o.lineTo(48, 54);
        o.lineTo(62, 62);
        o.stroke();
        break;
      case 'cloud':
        o.beginPath();
        o.arc(34, 56, 20, 0, 7);
        o.arc(58, 44, 24, 0, 7);
        o.arc(70, 60, 16, 0, 7);
        o.fill();
        o.fillRect(34, 56, 38, 20);
        break;
      case 'dot':
        o.beginPath();
        o.arc(48, 48, 26, 0, 7);
        o.fill();
        break;
      default:
        rr(10, 14, 76, 54, 14);
        o.fill();
        o.beginPath();
        o.moveTo(24, 62);
        o.lineTo(22, 88);
        o.lineTo(48, 64);
        o.fill();
    }
    return c;
  }
  const SIMSPEC = [
    [
      'Time',
      [
        ['settings.fixedTime', 'Date and time', 'datetime', 'Leave empty to use the live clock'],
        ['settings.clock24h', '24-hour clock', 'bool'],
        ['si.locked_note', 'Lock state', 'note', 'Use the “Locked” button above the preview.']
      ]
    ],
    [
      'Battery',
      [
        ['bi.level', 'Level %', 'range', 0, 100],
        ['bi.charging', 'Charging', 'bool'],
        ['bi.plugged', 'Plugged in', 'bool'],
        ['bi.temp', 'Temperature °C', 'range', 0, 60],
        ['bi.volt', 'Voltage (mV)', 'num'],
        ['bi.source', 'Source', 'text']
      ]
    ],
    [
      'Weather',
      [
        ['wi.temp', 'Temperature', 'range', -30, 50],
        ['wi.flik', 'Feels like', 'range', -30, 50],
        ['wi.tempu', 'Unit', 'select', ['C', 'F']],
        ['wi.cond', 'Condition', 'text'],
        ['wi.icon', 'Icon', 'select', WEATHER_ICONS],
        ['wi.hum', 'Humidity %', 'range', 0, 100],
        ['wi.wspeed', 'Wind speed', 'range', 0, 150],
        ['wi.wdir', 'Wind direction °', 'range', 0, 360],
        ['wi.clouds', 'Clouds %', 'range', 0, 100],
        ['wi.press', 'Pressure', 'num'],
        ['wi.uvindex', 'UV index', 'range', 0, 12],
        [
          'wf',
          'Forecast days',
          'list',
          [
            ['cond', 'Condition', 'text'],
            ['icon', 'Icon', 'select', WEATHER_ICONS],
            ['min', 'Low', 'num'],
            ['max', 'High', 'num'],
            ['rainc', 'Rain chance %', 'range', 0, 100],
            ['wspeed', 'Wind', 'num']
          ],
          {
            min: 14,
            max: 22,
            temp: 18,
            cond: 'Clear',
            icon: 'CLEAR',
            code: 'CLEAR',
            wspeed: 8,
            wdir: 180,
            hum: 50,
            rain: 0,
            rainc: 0
          },
          (it, i) => 'Day ' + i + ' — ' + it.cond
        ]
      ]
    ],
    [
      'Music',
      [
        ['mi.state', 'State', 'select', ['PLAYING', 'PAUSED', 'STOPPED']],
        ['mi.title', 'Title', 'text'],
        ['mi.artist', 'Artist', 'text'],
        ['mi.album', 'Album', 'text'],
        ['mi.len', 'Length (s)', 'num'],
        ['mi.pos', 'Position (s)', 'range', 0, g => F.num(g('mi.len')) || 100],
        ['mi.vol', 'Volume %', 'range', 0, 100],
        ['mi.app', 'Player app', 'text'],
        ['mi.package', 'Player package', 'text'],
        ['mi.coverImg', 'Cover art', 'image', 'sim:cover']
      ]
    ],
    [
      'Notifications',
      [
        [
          'ni.list',
          'Notifications',
          'list',
          [
            ['title', 'Title', 'text'],
            ['text', 'Text', 'text'],
            ['app', 'App name', 'text'],
            ['pkg', 'Package', 'text'],
            ['count', 'Count', 'num'],
            ['time', 'Minutes ago', 'num'],
            ['icon', 'Icon', 'select', ICON_KINDS],
            ['img', 'Own icon image', 'image', it => 'sim:icon/' + (it.icon || 'chat')]
          ],
          {
            title: 'New notification',
            text: 'Notification text',
            app: 'App',
            pkg: 'com.example.app',
            count: 1,
            time: 1,
            icon: 'dot',
            img: ''
          },
          (it, i) => 'ni(' + i + ') — ' + it.app + ': ' + it.title
        ]
      ]
    ],
    [
      'Calendar',
      [
        [
          'ci.list',
          'Events',
          'list',
          [
            ['title', 'Title', 'text'],
            ['loc', 'Location', 'text'],
            ['start', 'Starts in (seconds)', 'num'],
            ['end', 'Ends in (seconds)', 'num'],
            ['allday', 'All day', 'bool'],
            ['color', 'Colour', 'color'],
            ['cname', 'Calendar', 'text']
          ],
          {
            title: 'New event',
            desc: '',
            loc: '',
            start: 3600,
            end: 7200,
            allday: 0,
            color: '#FF4285F4',
            cname: 'Personal'
          },
          (it, i) => 'ci(' + i + ') — ' + it.title
        ]
      ]
    ],
    [
      'Network',
      [
        ['nc.wifi', 'Wi-Fi', 'select', ['CONNECTED', 'ENABLED', 'DISABLED']],
        ['nc.ssid', 'Wi-Fi name', 'text'],
        ['nc.wsig', 'Wi-Fi signal (0–9)', 'range', 0, 9],
        ['nc.cell', 'Mobile', 'select', ['ON', 'OFF', 'AIRPLANE']],
        ['nc.csig', 'Mobile signal (0–4)', 'range', 0, 4],
        ['nc.operator', 'Carrier', 'text'],
        ['nc.dtypes', 'Data type', 'select', ['5G', '4G', '3G', '2G']],
        ['nc.bt', 'Bluetooth (0 off, 1 on, 2 connected)', 'range', 0, 2],
        ['nc.acount', 'Audio devices', 'range', 0, 3],
        ['nc.aname', 'Audio device name', 'text'],
        ['nc.airplane', 'Airplane mode', 'bool']
      ]
    ],
    [
      'System',
      [
        ['si.darkmode', 'Dark mode', 'bool'],
        ['si.ringer', 'Ringer', 'select', ['NORMAL', 'VIBRATE', 'SILENT']],
        ['si.volr', 'Ringer volume %', 'range', 0, 100],
        ['si.vola', 'Alarm volume %', 'range', 0, 100],
        ['si.alarmon', 'Alarm set', 'bool'],
        ['si.wpcolor1', 'Wallpaper colour 1', 'color'],
        ['si.wpcolor2', 'Wallpaper colour 2', 'color'],
        ['si.sysca1', 'System accent 1', 'color'],
        ['si.sysca2', 'System accent 2', 'color'],
        ['si.model', 'Device model', 'text'],
        ['rm.cused', 'CPU used %', 'range', 0, 100],
        ['rm.fcur', 'CPU speed (MHz)', 'num'],
        ['rm.mused', 'Memory used (MB)', 'num'],
        ['rm.mtot', 'Memory total (MB)', 'num'],
        ['rm.fsused', 'Storage used (MB)', 'num'],
        ['rm.fstot', 'Storage total (MB)', 'num'],
        ['ts.wrx', 'Wi-Fi downloaded (bytes)', 'num'],
        ['ts.wtx', 'Wi-Fi uploaded (bytes)', 'num']
      ]
    ],
    [
      'Location',
      [
        ['li.loc', 'City', 'text'],
        ['li.admin', 'Region', 'text'],
        ['li.country', 'Country', 'text'],
        ['li.ccode', 'Country code', 'text'],
        ['li.addr', 'Address', 'text'],
        ['li.lat', 'Latitude', 'num'],
        ['li.lon', 'Longitude', 'num'],
        ['li.alt', 'Altitude', 'num'],
        ['li.spd', 'Speed', 'range', 0, 200],
        ['ai.isday', 'Daytime', 'bool'],
        ['ai.mphase', 'Moon phase', 'text'],
        ['ai.season', 'Season', 'select', ['Spring', 'Summer', 'Autumn', 'Winter']],
        ['ai.zodiac', 'Zodiac', 'text']
      ]
    ],
    [
      'Counters',
      [
        ['uc.sms', 'Unread SMS', 'range', 0, 50],
        ['uc.calls', 'Missed calls', 'range', 0, 50],
        ['uc.gmail', 'Unread Gmail', 'range', 0, 99],
        ['uc.whatsapp', 'Unread WhatsApp', 'range', 0, 99],
        ['fd.steps', 'Steps', 'range', 0, 30000],
        ['fd.cals', 'Calories', 'num'],
        ['fd.dista', 'Distance (m)', 'num'],
        ['aq.index', 'Air quality index', 'range', 0, 400],
        ['aq.label', 'Air quality label', 'text']
      ]
    ],
    ['Raw', 'raw']
  ];
  function simGet(path, base) {
    let o = base || S.sim;
    for (const k of path.split('.')) {
      if (o == null) return undefined;
      o = o[k];
    }
    return o;
  }
  function simSet(path, val, base) {
    let o = base || S.sim;
    const ks = path.split('.');
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
    simChanged();
  }
  let simSaveT = 0;
  function simChanged() {
    requestRender();
    clearTimeout(simSaveT);
    simSaveT = setTimeout(() => {
      try {
        localStorage.setItem('klwp-editor-sim', JSON.stringify(S.sim));
      } catch (e) {
        /* storage unavailable */
      }
    }, 400);
  }
  function pickImageData(cb) {
    pickFile('image/*', (f, b) => {
      createImageBitmap(new Blob([b]))
        .then(bm => {
          const k = Math.min(1, 512 / Math.max(bm.width, bm.height)),
            c = document.createElement('canvas');
          c.width = Math.round(bm.width * k);
          c.height = Math.round(bm.height * k);
          c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
          cb(c.toDataURL('image/png'));
        })
        .catch(() => toast('That file is not an image'));
    });
  }
  function simField(def, base, rerender) {
    const [path, label, type, a, b] = def,
      get = p => simGet(p, base),
      val = get(path);
    let ed;
    const set = v => simSet(path, v, base);
    if (type === 'note') ed = h('span', { class: 'hint', text: a });
    else if (type === 'range') {
      const mx = typeof b === 'function' ? b(p => simGet(p)) : b;
      const num = h('input', { type: 'number', class: 'simnum', value: val === undefined ? 0 : val, min: a, max: mx }),
        sl = h('input', { type: 'range', min: a, max: mx, step: 1, value: val === undefined ? 0 : val });
      sl.oninput = () => {
        num.value = sl.value;
        set(parseFloat(sl.value));
      };
      num.oninput = () => {
        const n = parseFloat(num.value);
        if (isFinite(n)) {
          sl.value = n;
          set(n);
        }
      };
      ed = h('span', { class: 'simrange' }, sl, num);
    } else if (type === 'num')
      ed = h('input', {
        type: 'number',
        step: 'any',
        value: val === undefined ? '' : val,
        oninput: e => {
          const n = parseFloat(e.target.value);
          set(isFinite(n) ? n : 0);
        }
      });
    else if (type === 'bool')
      ed = h(
        'label',
        { class: 'sw' },
        h('input', {
          type: 'checkbox',
          checked: val === true || F.num(val) !== 0,
          onchange: e => set(path === 'settings.clock24h' ? e.target.checked : e.target.checked ? 1 : 0)
        }),
        'On'
      );
    else if (type === 'select')
      ed = h(
        'select',
        {
          onchange: e => {
            set(e.target.value);
            if (path === 'wi.icon') simSet('wi.code', e.target.value);
            if (path === 'icon' && base) {
              base.code = e.target.value;
            }
            if (rerender) rerender();
          }
        },
        (a.indexOf(val) < 0 && val !== undefined ? a.concat([val]) : a).map(o =>
          h('option', { value: o, text: /^[A-Z_0-9]+$/.test(o) && o.length > 2 ? pretty(o) : o, selected: o === val })
        )
      );
    else if (type === 'color') ed = colorEditor(val || '#FFFFFFFF', v => set(v));
    else if (type === 'datetime')
      ed = h(
        'span',
        { class: 'asset' },
        h('input', { type: 'datetime-local', step: 1, value: val || '', oninput: e => set(e.target.value) }),
        h('button', {
          class: 'btn sm',
          text: 'Live',
          title: a,
          onclick: () => {
            set('');
            renderEditor();
          }
        })
      );
    else if (type === 'image') {
      const fb = typeof a === 'function' ? a(base) : a,
        src = val || fb;
      const im = h('canvas', { class: 'simthumb', width: 56, height: 56 });
      const paint = () => {
        const g = A.image(src),
          o = im.getContext('2d');
        o.clearRect(0, 0, 56, 56);
        if (g) o.drawImage(g, 0, 0, 56, 56);
        else setTimeout(paint, 200);
      };
      paint();
      ed = h(
        'span',
        { class: 'asset' },
        im,
        h('button', {
          class: 'btn sm',
          text: 'Choose image…',
          onclick: () =>
            pickImageData(d => {
              set(d);
              (rerender || renderEditor)();
            })
        }),
        val
          ? h('button', {
              class: 'btn sm',
              text: 'Use built-in',
              onclick: () => {
                set('');
                (rerender || renderEditor)();
              }
            })
          : null
      );
    } else ed = h('input', { type: 'text', value: val === undefined ? '' : val, oninput: e => set(e.target.value) });
    return h(
      'div',
      { class: 'row sim' },
      h(
        'div',
        { class: 'rl' },
        h('span', { text: label }),
        base ? null : h('small', { text: path.replace('.', '(') + ')' })
      ),
      h('div', { class: 're' }, ed),
      h('div', { class: 'rb' })
    );
  }
  function simList(def, body) {
    const [path, label, , fields, fresh, describe] = def;
    let list = simGet(path);
    if (!Array.isArray(list)) {
      list = [];
      simSet(path, list);
    }
    const wrap = h('div', { class: 'simlist' });
    body.append(wrap);
    const draw = () => {
      wrap.innerHTML = '';
      wrap.append(
        h(
          'div',
          { class: 'ibar' },
          h('b', { text: label + ' (' + list.length + ')' }),
          h('button', {
            class: 'btn pri sm',
            text: '+ Add',
            onclick: () => {
              list.push(JSON.parse(JSON.stringify(fresh)));
              simChanged();
              draw();
            }
          })
        )
      );
      if (!list.length)
        wrap.append(h('div', { class: 'empty', text: 'None. Formulas that read this will see an empty list.' }));
      list.forEach((it, i) => {
        const card = h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'card-h' },
            h('b', { text: describe(it, i) }),
            h('span'),
            h('button', {
              class: 'ib',
              text: '▲',
              title: 'Move up',
              disabled: i === 0,
              onclick: () => {
                list.splice(i - 1, 0, list.splice(i, 1)[0]);
                simChanged();
                draw();
              }
            }),
            h('button', {
              class: 'ib',
              text: '✕',
              title: 'Remove',
              onclick: () => {
                list.splice(i, 1);
                simChanged();
                draw();
              }
            })
          )
        );
        fields.forEach(f => card.append(simField(f, it, draw)));
        wrap.append(card);
      });
    };
    draw();
  }
  function renderSim() {
    const ed = $('#editor');
    ed.innerHTML = '';
    if (!SIMSPEC.find(s => s[0] === S.simTab)) S.simTab = SIMSPEC[0][0];
    const sec = SIMSPEC.find(s => s[0] === S.simTab);
    const body = h('div', { class: 'body' });
    if (!S.useSim)
      body.append(
        h(
          'div',
          { class: 'note warnnote' },
          "The preview is showing this PC's real data right now, so changes here only show once you switch back to simulated data (the phone button under the preview). ",
          h('button', {
            class: 'btn sm',
            text: 'Use simulated data',
            onclick: () => $('#usesim').click()
          })
        )
      );
    ed.append(
      h(
        'div',
        { class: 'ehead' },
        h('span', { class: 'chip-t t-K', text: 'Sim' }),
        h('div', { class: 'etitle ro', text: 'Simulated device data' }),
        h('button', {
          class: 'btn sm',
          text: 'Reset all',
          onclick: () => {
            S.sim = JSON.parse(JSON.stringify(F.DEFAULT_SIM));
            A.images.clear();
            simChanged();
            renderSim();
          }
        }),
        h('button', {
          class: 'btn pri sm',
          text: 'Done',
          onclick: () => {
            S.panel = 'edit';
            $('#sim').classList.remove('on');
            renderEditor();
          }
        })
      ),
      h(
        'div',
        { class: 'tabs' },
        SIMSPEC.map(s =>
          h('button', {
            class: 'tab' + (s[0] === S.simTab ? ' on' : ''),
            text: s[0],
            onclick: e => {
              S.simTab = s[0];
              const x = e.currentTarget.parentNode.scrollLeft;
              renderSim();
              const t = document.querySelector('#editor .tabs');
              if (t) {
                t.scrollLeft = x;
                const on = t.querySelector('.on');
                if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
            }
          })
        )
      ),
      body
    );
    if (sec[1] === 'raw') {
      const ta = h('textarea', {
          class: 'raw',
          spellcheck: 'false',
          value: JSON.stringify(
            S.sim,
            (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 40) + '…(image)' : v),
            1
          )
        }),
        msg = h('span', { class: 'rawmsg' });
      body.append(
        h('div', {
          class: 'note',
          text: 'Everything the preview feeds to formulas, as JSON. Extra keys can be added here: for example a key under "br" named "tasker/myvar" answers $br(tasker, myvar)$, and a key under "wg" answers a wg() call with the same arguments ("*" answers any).'
        }),
        ta,
        h(
          'div',
          { class: 'rawbar' },
          h('button', {
            class: 'btn pri',
            text: 'Apply',
            onclick: () => {
              try {
                if (ta.value.indexOf('…(image)') >= 0) {
                  msg.textContent = 'Images are shortened in this view; remove them in their own tab before applying.';
                  return;
                }
                S.sim = JSON.parse(ta.value);
                A.images.clear();
                simChanged();
                msg.textContent = 'Applied';
              } catch (e) {
                msg.textContent = 'Invalid JSON: ' + e.message;
              }
            }
          }),
          msg
        )
      );
      return;
    }
    body.append(
      h('div', {
        class: 'note',
        text: 'These values stand in for your phone. They change the preview straight away and are never written into the wallpaper.'
      })
    );
    sec[1].forEach(def => {
      if (def[2] === 'list') simList(def, body);
      else body.append(simField(def));
    });
  }

  // ---- preset thumbnails for the open dialog: only the thumbnail entry is read out of each archive
  const THUMB_NAMES = ['preset_thumb_portrait.jpg', 'komponent_thumb.jpg', 'preset_thumb_landscape.jpg'];
  async function zipThumb(src) {
    const tailLen = Math.min(src.size, 65557),
      tail = await src.read(src.size - tailLen, src.size),
      dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (dv.getUint32(i, true) === 0x06054b50) {
        e = i;
        break;
      }
    if (e < 0) return null;
    const cdSize = dv.getUint32(e + 12, true),
      cdOff = dv.getUint32(e + 16, true);
    const cd = await src.read(cdOff, cdOff + cdSize),
      c = new DataView(cd.buffer, cd.byteOffset, cd.byteLength),
      found = {};
    for (let p = 0; p + 46 <= cd.length && c.getUint32(p, true) === 0x02014b50; ) {
      const nlen = c.getUint16(p + 28, true),
        name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nlen));
      if (THUMB_NAMES.indexOf(name) >= 0)
        found[name] = {
          method: c.getUint16(p + 10, true),
          size: c.getUint32(p + 20, true),
          at: c.getUint32(p + 42, true)
        };
      p += 46 + nlen + c.getUint16(p + 30, true) + c.getUint16(p + 32, true);
    }
    const ent = THUMB_NAMES.map(n => found[n]).find(Boolean);
    if (!ent || (ent.method !== 0 && ent.method !== 8)) return null;
    const lh = await src.read(ent.at, ent.at + 30),
      l = new DataView(lh.buffer, lh.byteOffset, 30),
      start = ent.at + 30 + l.getUint16(26, true) + l.getUint16(28, true);
    let bytes = await src.read(start, start + ent.size);
    if (ent.method === 8)
      bytes = new Uint8Array(
        await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()
      );
    return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  }
  const fileSrc = f => ({
    size: f.size,
    read: (a, b) =>
      f
        .slice(a, b)
        .arrayBuffer()
        .then(x => new Uint8Array(x))
  });
  // a file served by the Windows app: ranged reads, or the whole file once if ranges are not supported
  const urlSrc = (url, size) => {
    let whole = null;
    return {
      size,
      async read(a, b) {
        if (whole) return whole.subarray(a, b);
        const r = await fetch(url, { headers: { Range: 'bytes=' + a + '-' + (b - 1) }, cache: 'no-store' }),
          buf = new Uint8Array(await r.arrayBuffer());
        if (r.status === 206) return buf;
        whole = buf;
        return whole.subarray(a, b);
      }
    };
  };
  const thumbCache = new Map();
  let thumbBusy = 0;
  const thumbWait = [];
  function loadThumb(key, src, img) {
    const done = url => {
      if (url) img.src = url;
      else img.parentNode.classList.add('none');
    };
    if (thumbCache.has(key)) return thumbCache.get(key).then(done);
    const run = () => {
      thumbBusy++;
      const pr = zipThumb(src())
        .catch(() => null)
        .finally(() => {
          thumbBusy--;
          if (thumbWait.length) thumbWait.shift()();
        });
      thumbCache.set(key, pr);
      pr.then(done);
    };
    thumbBusy < 4 ? run() : thumbWait.push(run);
  }
  // items: [{ name, sub, key, src: () => source, open: () => void }]
  function presetGallery(title, items, empty, buttons) {
    const grid = h('div', { class: 'kgrid' });
    let d;
    const seen = new IntersectionObserver(
      es =>
        es.forEach(e => {
          if (!e.isIntersecting) return;
          seen.unobserve(e.target);
          const it = items[+e.target.dataset.i];
          loadThumb(it.key, it.src, e.target.querySelector('img'));
        }),
      { root: grid, rootMargin: '200px' }
    );
    if (!items.length) grid.append(h('div', { class: 'sub', text: empty }));
    items.forEach((it, i) => {
      const card = h(
        'button',
        {
          class: 'kcard',
          title: it.name,
          onclick: () => {
            if (S.dirty && !confirm('Discard unsaved changes?')) return;
            d.close();
            seen.disconnect();
            it.open();
          }
        },
        h('div', { class: 'kthumb' }, h('img', { alt: '' })),
        h('b', { text: it.name.replace(/\.(klwp|komp)$/i, '') }),
        h('small', { text: it.sub })
      );
      card.dataset.i = i;
      grid.append(card);
      seen.observe(card);
    });
    // search by file name (and title, once its thumbnail has been read)
    const q = h('input', {
      class: 'ksearch',
      type: 'search',
      placeholder: 'Search ' + items.length + ' file' + (items.length === 1 ? '' : 's') + '…',
      oninput: () => {
        const f = q.value.trim().toLowerCase();
        let shown = 0;
        grid.querySelectorAll('.kcard').forEach(c => {
          const it = items[+c.dataset.i],
            hit = !f || (it.name + ' ' + (it.sub || '')).toLowerCase().indexOf(f) >= 0;
          c.hidden = !hit;
          if (hit) shown++;
        });
        none.hidden = shown > 0 || !items.length;
      }
    });
    const none = h('div', { class: 'sub', text: 'Nothing matches.', hidden: true });
    grid.append(none);
    d = dialog(title, items.length ? [q, grid] : grid, buttons, true);
    d.box.classList.add('gallery');
    if (items.length) setTimeout(() => q.focus(), 40);
  }
  const sizeText = n => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  // the browser version: wallpapers from a folder you choose (your Kustom folder, or any folder of presets)
  function browseDialog() {
    const items = (S.presetFiles || [])
      .slice()
      .sort((a, b) => b.file.lastModified - a.file.lastModified)
      .map(p => ({
        name: p.file.name,
        key: p.path + '|' + p.file.lastModified + '|' + p.file.size,
        sub:
          (/\.komp$/i.test(p.file.name) ? 'Komponent · ' : '') +
          new Date(p.file.lastModified).toLocaleDateString() +
          ' · ' +
          sizeText(p.file.size),
        src: () => fileSrc(p.file),
        open: () => openFile(p.file)
      }));
    presetGallery(
      'Open a wallpaper',
      items,
      S.presetFiles
        ? 'No .klwp or .komp files in that folder.'
        : 'Choose your Kustom folder (or any folder with .klwp files) to see your wallpapers here, or browse for a single file.',
      [
        [
          S.presetFiles ? 'Other folder…' : 'Choose folder…',
          () => {
            S.galleryAfterFolder = true;
            $('#dir').click();
          }
        ],
        ['Browse files…', () => $('#file').click()],
        ['Cancel']
      ]
    );
  }
  // ---- running inside the Windows app
  async function hostLibrary() {
    const list = await hostList();
    S.kustom = list;
    const files = list.map(f => ({
      webkitRelativePath: 'Kustom/' + f.p,
      name: f.p.split('/').pop(),
      size: f.s,
      text: () => fetch(kustomUrl(f.p), { cache: 'no-store' }).then(r => r.text()),
      arrayBuffer: () => fetch(kustomUrl(f.p), { cache: 'no-store' }).then(r => r.arrayBuffer())
    }));
    await loadLibrary(files, true);
  }
  function openDialog() {
    hostList().then(list => {
      S.kustom = list;
      const items = list
        .filter(f => /^(wallpapers|komponents)\/[^/]+\.(klwp|komp)$/i.test(f.p))
        .sort((a, b) => b.m - a.m)
        .map(f => ({
          name: f.p.split('/').pop(),
          key: f.p + '|' + f.m + '|' + f.s,
          sub: (/^komp/.test(f.p) ? 'Komponent · ' : '') + new Date(f.m).toLocaleDateString() + ' · ' + sizeText(f.s),
          src: () => urlSrc(kustomUrl(f.p), f.s),
          open: () =>
            fetch(kustomUrl(f.p), { cache: 'no-store' })
              .then(r => r.blob())
              .then(b => openFile(new File([b], f.p.split('/').pop())))
              .catch(e => toast('Could not open: ' + e.message))
        }));
      presetGallery(
        'Open from your Kustom folder',
        items,
        'Nothing in your Kustom folder yet. Save a wallpaper, or copy .klwp files into its "wallpapers" folder.',
        [['Browse…', () => $('#file').click()], ['Cancel']]
      );
    });
  }
  // the Windows app's editor window has no title bar of its own: the app bar is the title bar
  function hostWindow() {
    $('#wmin').onclick = () => hostMsg('win:min');
    $('#wmax').onclick = () => hostMsg('win:max');
    $('#wclose').onclick = () => hostMsg('win:close');
    const bar = $('.appbar'),
      empty = t => t === bar || (t.classList && (t.classList.contains('sp') || t.classList.contains('wctl')));
    // used only if the window cannot treat the bar as its caption by itself
    bar.addEventListener('mousedown', e => {
      if (e.button === 0 && empty(e.target) && e.detail === 1) hostMsg('win:drag');
    });
    bar.addEventListener('dblclick', e => {
      if (empty(e.target)) hostMsg('win:max');
    });
    const grip = h('div', {
      class: 'topgrip',
      onmousedown: e => {
        if (e.button === 0) {
          e.preventDefault();
          hostMsg('win:size:top');
        }
      }
    });
    document.body.append(grip);
    window.KHost.win = st => {
      const mx = !!(st && st.max);
      document.body.classList.toggle('maxed', mx);
      $('#wmax').title = mx ? 'Restore' : 'Maximise';
      $('#wmax').innerHTML = '<svg><use href="#' + (mx ? 'i-wrestore' : 'i-wmax') + '"/></svg>';
    };
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && (k === 'r' || k === 'p' || k === 'f' || k === 'g' || k === 'u'))
      )
        e.preventDefault();
    });
    window.addEventListener('dragstart', e => {
      if (!(e.target.closest && e.target.closest('[draggable="true"]'))) e.preventDefault();
    });
    hostMsg('win:hello');
  }
  // open the wallpaper that is on the desktop right now (the app passes it in the address)
  async function openCurrent() {
    const m = /[?&]current=([^&]+)/.exec(location.search);
    if (!m) return;
    const url = decodeURIComponent(m[1]),
      nm = /[?&]name=([^&]+)/.exec(location.search),
      name = nm ? decodeURIComponent(nm[1]) : url.split('/').pop().split('?')[0];
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      await openFile(new File([await r.blob()], decodeURIComponent(name)));
      toast('Opened the current desktop wallpaper: ' + decodeURIComponent(name));
    } catch (e) {
      toast('Could not open the current wallpaper: ' + e.message);
    }
  }
  function hostEditor() {
    document.body.classList.add('hosted');
    hostWindow();
    openCurrent();
    $('#open').onclick = openDialog;
    $('#lib').onclick = () => hostMsg('pickkustom');
    $('#lib').title = 'Choose the folder the app and the wallpaper use for presets, fonts, icon sets and images';
    $('#export').onclick = () => exportFile('kustom');
    $('#export').title = 'Save into your Kustom folder (Ctrl+S)';
    $('#export').querySelector('span').textContent = 'Save';
    hostLibrary().catch(() => {});
  }
  function init() {
    S.preset = newPreset();
    try {
      const saved = JSON.parse(localStorage.getItem('klwp-editor-sim') || 'null');
      if (saved && saved.bi && saved.ni && Array.isArray(saved.ni.list)) {
        const base = JSON.parse(JSON.stringify(F.DEFAULT_SIM));
        // saved before a key was added or renamed: keep the new keys
        Object.keys(saved).forEach(k => {
          base[k] =
            base[k] &&
            typeof base[k] === 'object' &&
            !Array.isArray(base[k]) &&
            saved[k] &&
            typeof saved[k] === 'object'
              ? Object.assign({}, base[k], saved[k])
              : saved[k];
        });
        S.sim = base;
      }
    } catch (e) {
      /* ignore */
    }
    loadSettings();
    applySettings();
    window.addEventListener('storage', e => {
      if (e.key === SET_KEY) {
        loadSettings();
        applySettings();
      }
    });
    $('#settings').onclick = settingsDialog;
    $('#settings2').onclick = settingsDialog;
    // live data pushed by the Windows app (what is playing, battery...); in the editor only while live data is on
    window.KData = o => {
      Object.keys(o || {}).forEach(k => {
        if (S.live[k] && typeof S.live[k] === 'object' && !Array.isArray(S.live[k])) Object.assign(S.live[k], o[k]);
        else S.live[k] = o[k];
      });
      if (liveOn()) requestRender();
    };
    setInterval(() => {
      updateAstro();
      if (liveOn()) requestRender();
    }, 60000);
    try {
      const sn = localStorage.getItem('kwlwp-snap');
      if (sn !== null) S.snap = sn === '1';
    } catch (e) {
      /* ignore */
    }
    $('#snap').classList.toggle('on', S.snap);
    $('#touch').classList.toggle('on', S.touch);
    document.body.classList.toggle('touchmode', S.touch);
    $('#open').onclick = browseDialog;
    $('#file').onchange = e => {
      if (e.target.files[0]) openFile(e.target.files[0]);
      e.target.value = '';
    };
    $('#lib').onclick = () => $('#dir').click();
    $('#dir').onchange = e => loadLibrary(e.target.files);
    $('#new').onclick = () => {
      if (S.dirty && !confirm('Discard unsaved changes?')) return;
      S.preset = newPreset();
      S.files = new Map();
      S.meta = {};
      S.fileName = 'Untitled.klwp';
      S.jsonName = 'preset.json';
      S.baseUsed = new Set();
      S.path = [];
      S.tab = null;
      S.undo = [];
      S.redo = [];
      S.dirty = false;
      A.reset();
      S.views.forEach(v => {
        v.rt = R.newRuntime();
      });
      renderEditor();
      requestRender();
      updateBar();
    };
    $('#export').onclick = () => exportFile();
    // the arrow beside Save: the other ways to save
    $('#saveMore').onclick = e => {
      e.stopPropagation();
      const pop = $('#savemenu');
      if (!pop.hidden) return (pop.hidden = true);
      pop.innerHTML = '';
      const item = (label, kbd, fn) =>
        pop.append(
          h(
            'button',
            {
              onclick: () => {
                pop.hidden = true;
                fn();
              }
            },
            h('span', { text: label }),
            kbd ? h('kbd', { text: kbd }) : null
          )
        );
      item(HOST ? 'Save' : 'Export .klwp', 'Ctrl S', () => exportFile(HOST ? 'kustom' : undefined));
      item('Save as…', 'Ctrl Shift S', saveAs);
      if (HOST) {
        item('Save and use as desktop wallpaper', '', () => exportFile('wallpaper'));
        item('Save as… and use as desktop wallpaper', '', () => saveAs('wallpaper'));
        item('Download a copy…', '', () => exportFile('download'));
      }
      pop.hidden = false;
    };
    document.addEventListener('click', () => {
      $('#savemenu').hidden = true;
    });
    $('#info').onclick = infoDialog;
    $('#ttl').onclick = infoDialog;
    {
      const pop = $('#filemenu');
      $('#menu').onclick = e => {
        e.stopPropagation();
        pop.hidden = !pop.hidden;
      };
      document.addEventListener('click', () => {
        pop.hidden = true;
      });
    }
    $('#scrdec').onclick = () => {
      $('#screens').value = S.screens - 1;
      $('#screens').onchange({ target: $('#screens') });
    };
    $('#scrinc').onclick = () => {
      $('#screens').value = S.screens + 1;
      $('#screens').onchange({ target: $('#screens') });
    };
    // fullscreen preview: nothing but the wallpaper, always in touch mode
    const setFs = on => {
      if (!!S.fs === on) return;
      S.fs = on;
      document.body.classList.toggle('fs', on);
      if (on) {
        S.touchBefore = S.touch;
        S.touch = true;
        try {
          const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (r && r.catch) r.catch(() => {});
        } catch (e) {
          /* stays in the window */
        }
      } else {
        S.touch = !!S.touchBefore;
        try {
          if (document.fullscreenElement) document.exitFullscreen();
        } catch (e) {
          /* ignore */
        }
      }
      document.body.classList.toggle('touchmode', S.touch);
      $('#touch').classList.toggle('on', S.touch);
      layoutViews();
      setTimeout(layoutViews, 250);
    };
    $('#fs').onclick = () => setFs(true);
    $('#fsexit').onclick = () => setFs(false);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && S.fs) setFs(false);
      else layoutViews();
    });
    window.addEventListener(
      'keydown',
      e => {
        if (e.key === 'Escape' && S.fs) {
          e.stopImmediatePropagation();
          setFs(false);
        }
      },
      true
    );
    $('#sim').onclick = () => {
      S.panel = S.panel === 'sim' ? 'edit' : 'sim';
      $('#sim').classList.toggle('on', S.panel === 'sim');
      renderEditor();
    };
    $('#undo').onclick = () => restore(S.undo, S.redo);
    $('#redo').onclick = () => restore(S.redo, S.undo);
    $('#addview').onclick = () => {
      if (S.views.length >= 4) return toast('Up to 4 previews side by side');
      const used = S.views.map(v => v.name);
      const d =
        DEVICES.find(x => used.indexOf(x[0]) < 0 && /Tablet/.test(x[0])) ||
        DEVICES.find(x => used.indexOf(x[0]) < 0) ||
        DEVICES[0];
      S.views.push({ name: d[0], w: d[1], h: d[2], rt: R.newRuntime() });
      layoutViews();
    };
    $('#screens').onchange = e => {
      const n = Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1));
      if (n !== S.screens) {
        S.screens = n;
        S.dirty = true;
        updateBar();
      }
      S.scroll = Math.min(S.scroll, S.screens - 1);
      syncBar();
      requestRender();
    };
    $('#yscreens').onchange = e => {
      const n = Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1));
      if (n !== S.yscreens) {
        S.yscreens = n;
        S.dirty = true;
        updateBar();
      }
      S.yscroll = Math.min(S.yscroll, S.yscreens - 1);
      syncBar();
      requestRender();
    };
    $('#yscrdec').onclick = () => {
      $('#yscreens').value = S.yscreens - 1;
      $('#yscreens').onchange({ target: $('#yscreens') });
    };
    $('#yscrinc').onclick = () => {
      $('#yscreens').value = S.yscreens + 1;
      $('#yscreens').onchange({ target: $('#yscreens') });
    };
    $('#scroll').oninput = e => {
      S.scroll = parseFloat(e.target.value);
      syncBar();
      requestRender();
    };
    const tgl = (id, key, after) => {
      $(id).onclick = () => {
        S[key] = !S[key];
        $(id).classList.toggle('on', S[key]);
        if (after) after();
        requestRender();
      };
    };
    tgl('#lock', 'locked');
    tgl('#touch', 'touch', () => {
      document.body.classList.toggle('touchmode', S.touch);
    });
    // which data the editor's preview reads: the simulated phone, or this PC
    try {
      const us = localStorage.getItem('kwlwp-usesim');
      if (us !== null && !WALL) S.useSim = us === '1';
    } catch (e) {
      /* ignore */
    }
    const simBtn = () => {
      $('#usesim').classList.toggle('on', S.useSim);
      $('#usesim').title = S.useSim
        ? "Showing simulated data (Device data panel). Click to preview with this PC's real data: weather, location, battery, music, system info..."
        : "Showing this PC's real data. Click to go back to the simulated data from the Device data panel.";
    };
    simBtn();
    tgl('#usesim', 'useSim', () => {
      try {
        localStorage.setItem('kwlwp-usesim', S.useSim ? '1' : '0');
      } catch (e) {
        /* ignore */
      }
      simBtn();
      scheduleWeather(true);
      hostMsg('livedata:' + (S.useSim ? 0 : 1));
      toast(S.useSim ? 'Preview uses the simulated data' : "Preview uses this PC's real data");
      if (S.panel === 'sim') renderSim();
    });
    tgl('#snap', 'snap', () => {
      try {
        localStorage.setItem('kwlwp-snap', S.snap ? '1' : '0');
      } catch (e) {
        /* ignore */
      }
      toast(S.snap ? 'Snapping on (hold Alt while dragging to move freely)' : 'Snapping off');
    });
    $('#resetg').onclick = () => {
      S.views.forEach(v => v.rt.globals.clear());
      requestRender();
      if (S.tab === 'globals') renderEditor();
      toast('Preview globals are back to their saved values');
    };
    window.addEventListener('resize', layoutViews);
    // the wheel over a closed dropdown steps through its choices, so each one shows on the canvas straight away
    document.addEventListener(
      'wheel',
      e => {
        // tab rows that run off the side scroll sideways with the wheel
        const bar = e.target.closest && e.target.closest('.tabs');
        if (bar && bar.scrollWidth > bar.clientWidth) {
          e.preventDefault();
          bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          return;
        }
        const sel = e.target.closest && e.target.closest('select');
        if (!sel || sel.disabled || sel.multiple) return;
        e.preventDefault();
        const step = e.deltaY > 0 ? 1 : -1;
        let i = sel.selectedIndex;
        do i += step;
        while (i >= 0 && i < sel.options.length && (sel.options[i].disabled || sel.options[i].value === '\u0001'));
        if (i < 0 || i >= sel.options.length) return;
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        sel.dispatchEvent(new Event('input', { bubbles: true }));
      },
      { passive: false }
    );
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (!typing && !document.querySelector('.back') && itemKeys(e)) {
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) saveAs();
        else $('#export').click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        $('#open').click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? restore(S.redo, S.undo) : restore(S.undo, S.redo);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        restore(S.redo, S.undo);
      } else if (!typing && S.path.length === 1 && /^Arrow/.test(e.key) && !document.querySelector('.back')) {
        const m = cur(),
          d = e.shiftKey ? 10 : 1,
          an = String(m.position_anchor || 'CENTER'),
          dx = /RIGHT/.test(an) ? -d : d,
          dy = /^BOTTOM/.test(an) ? -d : d;
        snapshot('nudge');
        if (e.key === 'ArrowLeft') m.position_offset_x = (m.position_offset_x || 0) - dx;
        if (e.key === 'ArrowRight') m.position_offset_x = (m.position_offset_x || 0) + dx;
        if (e.key === 'ArrowUp') m.position_offset_y = (m.position_offset_y || 0) - dy;
        if (e.key === 'ArrowDown') m.position_offset_y = (m.position_offset_y || 0) + dy;
        e.preventDefault();
        requestRender();
        if (S.tab === 'position') renderEditor();
      } else if (!typing && e.key === 'Escape' && S.path.length && !document.querySelector('.back')) {
        S.path = S.path.slice(0, -1);
        S.tab = null;
        renderEditor();
        requestRender();
      }
    });
    window.addEventListener('beforeunload', e => {
      if (S.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    document.addEventListener('focusout', () => {
      S.editKey = null;
    });
    syncBar();
    renderEditor();
    layoutViews();
    updateBar();
    if (HOST) document.addEventListener('contextmenu', ctxMenu);
    window.KApp = {
      S,
      openFile,
      exportFile,
      renderEditor,
      requestRender,
      layoutViews,
      A,
      settingsDialog,
      SET: () => SET
    };
    window.KHost = {
      onList: l => {
        const w = listWait;
        listWait = null;
        if (w) w(Array.isArray(l) ? l : []);
      },
      reload: () => hostLibrary().catch(() => {}),
      // the answer to a "wg:" download request
      wg: (id, ok, text) => {
        const f = webWaits.get(id);
        webWaits.delete(id);
        if (f) f(ok ? text : null);
      },
      say: m => toast(m)
    };
    if (WALL) {
      S.fs = true;
      S.touch = true;
      S.play = true;
      S.panel = 'edit';
      document.body.classList.add('fs', 'wall', 'touchmode');
      layoutViews();
      const cvEl = () => document.querySelector('#stage .cv'),
        dpr = () => window.devicePixelRatio || 1;
      window.KWall = {
        // url of a .klwp served by the host; pages 0 = work it out from the preset
        load: async (url, pages) => {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const b = await r.blob();
            await openFile(new File([b], 'wallpaper.klwp'));
            if (pages > 0) {
              S.screens = Math.min(9, pages);
              S.scroll = Math.floor((S.screens - 1) / 2);
            }
            S.path = [];
            layoutViews();
            hostMsg('loaded:' + S.screens);
          } catch (e) {
            hostMsg('error:' + e.message);
          }
        },
        // pointer position in physical pixels relative to the wallpaper window
        ptr: (type, x, y) => {
          const el = cvEl();
          if (!el) return;
          el.dispatchEvent(
            new PointerEvent('pointer' + type, {
              clientX: x / dpr(),
              clientY: y / dpr(),
              pointerId: 1,
              isPrimary: true,
              bubbles: true,
              button: 0,
              buttons: type === 'up' ? 0 : 1
            })
          );
        },
        wheel: (d, shift) => {
          const el = cvEl();
          if (el) el.dispatchEvent(new WheelEvent('wheel', { deltaY: d, shiftKey: !!shift, cancelable: true }));
        },
        // 'fill' = cover the monitor (what KLWP does in landscape), 'phone' = keep the preset's own portrait shape, centred
        fit: mode => {
          S.wallFit = mode === 'phone' ? 'phone' : 'fill';
          layoutViews();
        },
        pause: on => {
          S.paused = !!on;
          if (!on) requestRender();
        },
        pages: n => {
          if (n > 0) {
            S.screens = Math.min(9, n);
            S.scroll = Math.min(S.scroll, S.screens - 1);
            requestRender();
          }
        },
        // real device data from the host, e.g. { bi: { level: 80, charging: 1 } }
        data: o => window.KData(o),
        // the tray menu's "Use the editor's simulated data"
        useSim: on => {
          S.useSim = !!on;
          scheduleWeather(true);
          requestRender();
        }
      };
      if (HOST)
        hostLibrary()
          .catch(() => {})
          .then(() => hostMsg('ready'));
      else hostMsg('ready');
    } else if (HOST) hostEditor();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
