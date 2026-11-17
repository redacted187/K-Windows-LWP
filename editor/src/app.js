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
    library: new Map(),
    jsonName: 'preset.json',
    fileName: 'Untitled.klwp',
    pretty: false,
    sim: JSON.parse(JSON.stringify(F.DEFAULT_SIM)),
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
    locked: false,
    play: true,
    touch: false,
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
  const A = {
    images: new Map(),
    fonts: new Map(),
    sets: new Map(),
    bytes(uri) {
      if (!uri || typeof uri !== 'string') return null;
      let p = uri.indexOf(KF) === 0 ? uri.slice(KF.length) : uri.replace(/^kfile:\/\/[^/]+\//, '');
      try {
        p = decodeURIComponent(p);
      } catch (e) {
        /* keep */
      }
      const hit = S.files.get(p) || S.library.get(p) || S.files.get(uri);
      if (hit) return hit;
      const dev = A.devPath(uri);
      return dev !== null ? S.library.get(dev) || null : null;
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
    image(uri) {
      if (!uri) return null;
      uri = String(uri);
      const c = A.images.get(uri);
      if (c) return c.img;
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
      if (!b) return null;
      createImageBitmap(new Blob([b]))
        .then(bm => {
          rec.img = bm;
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
      if (!uri) return null;
      const c = A.fonts.get(uri);
      if (c) return c.ready ? c.family : null;
      const b = A.bytes(uri);
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
    fontMetrics(uri) {
      if (uri) {
        A.font(uri);
        const c = A.fonts.get(uri);
        if (c && c.metrics) return c.metrics;
      }
      return ROBOTO;
    },
    iconSet(uri) {
      if (!uri) return null;
      if (A.sets.has(uri)) return A.sets.get(uri);
      let b = A.bytes(uri.replace(/\.ttf$/i, '.json'));
      if (!b && uri.indexOf('/') < 0)
        b = S.files.get('icons/' + uri + '.json') || S.library.get('icons/' + uri + '.json');
      let map = null;
      if (b)
        try {
          const j = JSON.parse(new TextDecoder().decode(b));
          map = {};
          (j.icons || []).forEach(ic => {
            const d = { code: (ic.properties && ic.properties.code) || ic.icon.defaultCode || 0 };
            String((ic.properties && ic.properties.name) || '')
              .split(',')
              .forEach(n => {
                n = n.trim();
                if (n) map[n] = d;
              });
          });
          const ttf = /\.ttf$/i.test(uri) ? uri : KF + 'icons/' + uri + '.ttf';
          Object.defineProperty(map, '_font', { value: () => A.font(ttf), enumerable: false });
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
  const state = () => ({ preset: S.preset, assets: A, sim: S.sim });

  // ------------------------------------------------------------------ rendering
  let raf = 0;
  function requestRender() {
    if (!raf) raf = requestAnimationFrame(renderAll);
  }
  function simNow() {
    const f = S.sim.settings && S.sim.settings.fixedTime;
    if (f) {
      const d = new Date(f);
      if (!isNaN(d)) return d;
    }
    return new Date();
  }
  function viewOpts(v) {
    return {
      pxW: v.w,
      pxH: v.h,
      screens: S.screens,
      scroll: Math.max(0, Math.min(S.scroll, S.screens - 1)),
      locked: S.locked,
      play: S.play,
      now: simNow()
    };
  }
  function renderAll() {
    raf = 0;
    if (!S.preset || S.paused) return;
    let animating = false;
    const sel = cur(),
      time = (performance.now() - S.t0) / 1000;
    S.views.forEach(v => {
      if (!v.canvas) return;
      v.rt.time = time;
      v.opts = viewOpts(v);
      R.render(v.canvas, state(), v.opts, v.rt);
      animating = animating || v.rt.animating;
      const o = v.overlay.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, v.overlay.width, v.overlay.height);
      if (S.path.length && !S.touch && S.panel !== 'sim')
        v.rt.hits.forEach(hh => {
          if (hh.m !== sel) return;
          o.setTransform(hh.mt);
          const k = Math.sqrt(Math.abs(hh.mt.a * hh.mt.d - hh.mt.b * hh.mt.c)) || 1;
          o.lineWidth = 2 / k;
          o.strokeStyle = '#ff4081';
          o.setLineDash([6 / k, 4 / k]);
          o.strokeRect(0, 0, hh.w, hh.h);
        });
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
    if (animating) requestRender(); // only loops, visualizers and running transitions need a new frame
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
      v.overlay = h('canvas', {
        class: 'ovl',
        width: Math.round(cw * dpr),
        height: Math.round(ch * dpr),
        style: { width: cw + 'px', height: ch + 'px' }
      });
      const sel = h(
        'select',
        {
          title: 'Device preset',
          onchange: e => {
            const d = DEVICES[e.target.value];
            if (d) {
              v.name = d[0];
              v.w = d[1];
              v.h = d[2];
            } else v.name = 'Custom';
            layoutViews();
          }
        },
        DEVICES.map((d, di) => h('option', { value: di, text: d[0], selected: d[0] === v.name })),
        h('option', { value: -1, text: 'Custom', selected: v.name === 'Custom' })
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
  function scrollTo(target, ms) {
    cancelAnimationFrame(scrollAnim);
    const from = S.scroll,
      t0 = performance.now();
    target = Math.max(0, Math.min(S.screens - 1, target));
    const step = now => {
      const k = Math.min(1, (now - t0) / (ms || 260)),
        e = 1 - Math.pow(1 - k, 3);
      S.scroll = from + (target - from) * e;
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
  function bindCanvas(v, el) {
    let drag = null,
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
      const hits = hitAt(v, e).filter(x => x.m !== root());
      if (!hits.length) {
        S.path = [];
        S.tab = null;
        renderEditor();
        requestRender();
        return;
      }
      const selM = cur();
      let pick = hits[hits.length - 1];
      // prefer: the current selection if clicked again, else the top-most leaf
      const again = hits.find(x => x.m === selM);
      if (again && !e.altKey) pick = again;
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
        parent.internal_type !== 'StackLayerModule' &&
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
        if (touch.moved && !touch.held && S.screens > 1) {
          S.scroll = Math.max(-0.12, Math.min(S.screens - 1 + 0.12, touch.s0 - dx / touch.w));
          syncBar();
          requestRender();
        }
        if (now - touch.lt > 16) {
          touch.vx = (e.clientX - touch.lx) / (now - touch.lt);
          touch.lx = e.clientX;
          touch.lt = now;
        }
        return;
      }
      if (!drag) return;
      const dx = (e.clientX - drag.x) / drag.k,
        dy = (e.clientY - drag.y) / drag.k;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 4) return;
      if (!drag.moved) {
        snapshot();
        drag.moved = true;
      }
      drag.m.position_offset_x = Math.round(drag.ox + dx * drag.sx);
      drag.m.position_offset_y = Math.round(drag.oy + dy * drag.sy);
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
          const from = Math.round(t.s0),
            d = S.scroll - t.s0;
          let target = from;
          if (Math.abs(t.vx) > 0.45 && performance.now() - t.lt < 90) target = from + (t.vx < 0 ? 1 : -1);
          else if (Math.abs(d) > 0.33) target = from + Math.sign(d);
          scrollTo(target, 280);
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
      if (drag && drag.moved) renderEditor();
      drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => {
      if (touch) {
        clearTimeout(touch.hold);
        touch = null;
        scrollTo(Math.round(S.scroll));
      }
      drag = null;
    });
    el.addEventListener(
      'wheel',
      e => {
        if (!S.touch || S.screens < 2) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 4) return;
        if (el._wl && performance.now() - el._wl < 350) return;
        el._wl = performance.now();
        scrollTo(Math.round(S.scroll) + (d > 0 ? 1 : -1));
      },
      { passive: false }
    );
    el.addEventListener('dblclick', e => {
      if (S.touch) return;
      const hits = hitAt(v, e).filter(x => x.m !== root());
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
        if (ma === 'PLAY_PAUSE') S.sim.mi.state = S.sim.mi.state === 'PLAYING' ? 'PAUSED' : 'PLAYING';
        else if (ma === 'VOLUME_UP') S.sim.mi.vol = Math.min(100, F.num(S.sim.mi.vol) + 10);
        else if (ma === 'VOLUME_DOWN') S.sim.mi.vol = Math.max(0, F.num(S.sim.mi.vol) - 10);
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
    if (!v || !v.opts) return { value: '', error: null };
    return R.evalIn(state(), v.opts, v.rt, null, tpl, kompScopes(S.path));
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
  function assetEditor(def, val, onChange) {
    const dir = def.t === 'font' ? 'fonts' : def.t === 'iconset' ? 'icons' : 'bitmaps';
    const re = def.t === 'font' ? /\.(ttf|otf)$/i : def.t === 'iconset' ? /\.ttf$/i : null;
    const items = A.list(dir, re);
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
  function iconPicker(o, onChange) {
    const set = A.iconSet(resolved(o, { k: 'icon_set', d: '' }, ''));
    if (!set) return toast('Pick an icon set first (it needs its .json next to the .ttf)');
    const names = Object.keys(set),
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
    const res = h('div', { class: 'fres' });
    const upd = () => {
      const r = evalNow(ta.value);
      res.textContent = r.value;
      res.classList.toggle('err', !!r.error);
      if (r.error) res.textContent = (r.value ? r.value + '\n' : '') + '⚠ ' + r.error;
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
          ed = assetEditor(def, val, v => change(v));
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
      h('span', { class: 'chip-t t-' + (TYPE_CHIP[m.internal_type] || 'x'), text: TYPE_CHIP[m.internal_type] || '?' }),
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
    items.forEach((it, i) =>
      body.append(
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
            h('span', {
              class: 'chip-t t-' + (TYPE_CHIP[it.internal_type] || 'x'),
              text: TYPE_CHIP[it.internal_type] || '?'
            }),
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
          )
        )
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
          h('span', { class: 'chip-t big t-' + TYPE_CHIP[t], text: TYPE_CHIP[t] }),
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
            { class: 'rl' },
            h('span', { text: g.title || key }),
            h('small', { text: pretty(g.type) + ' · gv(' + key + ')' })
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
              text: 'Use the scroll slider, ▶ and the lock toggle above the preview to see animations. Timing and distances are approximated.'
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
    try {
      const z = await JSZip.loadAsync(await file.arrayBuffer());
      const files = new Map();
      for (const n of Object.keys(z.files)) if (!z.files[n].dir) files.set(n, await z.file(n).async('uint8array'));
      const jn =
        [...files.keys()].find(n => /^(preset|komponent)\.json$/.test(n)) ||
        [...files.keys()].find(n => /\.json$/.test(n) && n.indexOf('/') < 0);
      if (!jn) throw new Error('no preset.json inside');
      const txt = new TextDecoder().decode(files.get(jn));
      const p = JSON.parse(txt);
      if (!p.preset_root) throw new Error('not a Kustom preset');
      S.preset = p;
      S.files = files;
      S.jsonName = jn;
      S.fileName = file.name;
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
        const js = JSON.stringify(p);
        let n = 1;
        if (/"type":"SCROLL"|"center":/.test(js)) n = 3;
        (js.match(/"SCREEN(\d)"/g) || []).forEach(x => {
          n = Math.max(n, parseInt(x.slice(7), 10));
        });
        if (/"CENTER_[MP]2"/.test(js)) n = Math.max(n, 5);
        S.screens = n;
        S.scroll = Math.floor((n - 1) / 2);
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
  function thumb(w, hh) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hh;
    const rt = R.newRuntime();
    const o = {
      pxW: w,
      pxH: hh,
      screens: S.screens,
      scroll: Math.min(S.scroll, S.screens - 1),
      locked: false,
      play: false,
      now: new Date()
    };
    R.render(c, state(), o, rt);
    return new Promise(res => c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/jpeg', 0.85));
  }
  function referenced() {
    const s = new Set();
    (function w(o) {
      if (Array.isArray(o)) o.forEach(w);
      else if (o && typeof o === 'object') Object.keys(o).forEach(k => w(o[k]));
      else if (typeof o === 'string' && o.indexOf(KF) >= 0) {
        const re = /kfile:\/\/org\.kustom\.provider\/([^\s"',)$]+)/g;
        let m;
        while ((m = re.exec(o))) s.add(m[1]);
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
  async function exportFile(mode) {
    const info = S.preset.preset_info;
    info.features = usedFeatures();
    const z = new JSZip();
    const isKomp = /komponent/.test(S.jsonName);
    // pull referenced files in from the Kustom folder library
    referenced().forEach(p => {
      if (!S.files.has(p) && S.library.has(p)) S.files.set(p, S.library.get(p));
      if (/^icons\/.*\.ttf$/i.test(p)) {
        const j = p.replace(/\.ttf$/i, '.json');
        if (!S.files.has(j) && S.library.has(j)) S.files.set(j, S.library.get(j));
      }
    });
    const missing = [...referenced()].filter(p => !S.files.has(p));
    const v = S.views[0];
    const port = v.w <= v.h ? [v.w, v.h] : [v.h, v.w];
    const fresh = ![...S.files.keys()].some(n => /thumb/.test(n)),
      want = n => fresh || S.files.has(n); // refresh the thumbnails KLWP shows in its preset list
    try {
      if (isKomp) {
        if (want('komponent_thumb.jpg')) S.files.set('komponent_thumb.jpg', await thumb(400, 400));
      } else {
        if (want('preset_thumb_portrait.jpg'))
          S.files.set('preset_thumb_portrait.jpg', await thumb(540, Math.round((540 * port[1]) / port[0])));
        if (want('preset_thumb_landscape.jpg'))
          S.files.set('preset_thumb_landscape.jpg', await thumb(Math.round((540 * port[1]) / port[0]), 540));
      }
    } catch (e) {
      /* keep old thumbs */
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
    S.library = new Map();
    for (const f of fileList) {
      let rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      const k = rel.toLowerCase().indexOf('kustom/');
      rel = k >= 0 && (k === 0 || rel[k - 1] === '/') ? rel.slice(k + 7) : rel.split('/').slice(1).join('/');
      if (!rel || /^(wallpapers|komponents|autosave|notifications|widgets|lockscreens)\//i.test(rel)) continue;
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
      S.library.set(rel, new Uint8Array(await f.arrayBuffer()));
      n++;
    }
    A.reset();
    renderEditor();
    requestRender();
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
    const sl = $('#scroll');
    sl.max = Math.max(0, S.screens - 1);
    sl.value = S.scroll;
    sl.disabled = S.screens < 2;
    $('#scrollv').textContent = Math.round((+S.scroll + 1) * 10) / 10 + ' / ' + S.screens;
  }
  function infoDialog() {
    const i = S.preset.preset_info;
    form(
      'Preset info',
      [
        { k: 'title', l: 'Title', v: i.title },
        { k: 'description', l: 'Description', v: i.description, type: 'area' },
        { k: 'author', l: 'Author', v: i.author || '' },
        { k: 'email', l: 'Email', v: i.email || '' }
      ],
      o => {
        snapshot();
        i.title = o.title;
        i.description = o.description;
        if (o.author) i.author = o.author;
        else delete i.author;
        if (o.email) i.email = o.email;
        else delete i.email;
        updateBar();
        renderEditor();
      }
    );
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
        ['rm.cpu', 'CPU %', 'range', 0, 100],
        ['rm.used', 'Memory used (MB)', 'num'],
        ['rm.total', 'Memory total (MB)', 'num']
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
            onclick: () => {
              S.simTab = s[0];
              renderSim();
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
    const body = h('div', { class: 'klist' }, h('div', { class: 'sub', text: 'Loading…' }));
    let d;
    hostList().then(list => {
      S.kustom = list;
      body.innerHTML = '';
      const ws = list.filter(f => /^(wallpapers|komponents)\/[^/]+\.(klwp|komp)$/i.test(f.p)).sort((a, b) => b.m - a.m);
      if (!ws.length)
        body.append(
          h('div', {
            class: 'sub',
            text: 'Nothing in your Kustom folder yet. Save a wallpaper, or copy .klwp files into its "wallpapers" folder.'
          })
        );
      ws.forEach(f =>
        body.append(
          h(
            'button',
            {
              class: 'krow',
              onclick: () => {
                if (S.dirty && !confirm('Discard unsaved changes?')) return;
                d.close();
                fetch(kustomUrl(f.p), { cache: 'no-store' })
                  .then(r => r.blob())
                  .then(b => openFile(new File([b], f.p.split('/').pop())))
                  .catch(e => toast('Could not open: ' + e.message));
              }
            },
            h('b', { text: f.p.split('/').pop() }),
            h('small', {
              text:
                (/^komp/.test(f.p) ? 'Komponent · ' : '') +
                new Date(f.m).toLocaleDateString() +
                ' · ' +
                (f.s > 1e6 ? (f.s / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(f.s / 1e3)) + ' KB')
            })
          )
        )
      );
    });
    d = dialog('Open from your Kustom folder', body, [
      [
        'Browse…',
        () => {
          $('#file').click();
        }
      ],
      ['Cancel']
    ]);
  }
  function hostEditor() {
    document.body.classList.add('hosted');
    $('#open').onclick = openDialog;
    $('#lib').onclick = () => hostMsg('pickkustom');
    $('#lib').title = 'Choose the folder the app and the wallpaper use for presets, fonts, icon sets and images';
    $('#export').onclick = () => exportFile('kustom');
    $('#export').title = 'Save into your Kustom folder (Ctrl+S)';
    $('#export').querySelector('span').textContent = 'Save';
    $('#export2').onclick = () => exportFile('download');
    $('#export2').firstChild.textContent = 'Download a copy';
    const sw = h('button', {
      id: 'setwall',
      text: 'Save and use as desktop wallpaper',
      onclick: () => exportFile('wallpaper')
    });
    $('#export2').after(sw);
    hostLibrary().catch(() => {});
  }
  function init() {
    S.preset = newPreset();
    try {
      const saved = JSON.parse(localStorage.getItem('klwp-editor-sim') || 'null');
      if (saved && saved.bi && saved.ni && Array.isArray(saved.ni.list)) {
        const base = JSON.parse(JSON.stringify(F.DEFAULT_SIM));
        Object.keys(saved).forEach(k => {
          base[k] = saved[k];
        });
        S.sim = base;
      }
    } catch (e) {
      /* ignore */
    }
    $('#play').classList.toggle('on', S.play);
    $('#open').onclick = () => $('#file').click();
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
    $('#export2').onclick = () => exportFile();
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
      S.screens = Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1));
      S.scroll = Math.min(S.scroll, S.screens - 1);
      syncBar();
      requestRender();
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
    tgl('#play', 'play');
    tgl('#touch', 'touch', () => {
      document.body.classList.toggle('touchmode', S.touch);
    });
    $('#resetg').onclick = () => {
      S.views.forEach(v => v.rt.globals.clear());
      requestRender();
      if (S.tab === 'globals') renderEditor();
      toast('Preview globals are back to their saved values');
    };
    window.addEventListener('resize', layoutViews);
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        $('#open').click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? restore(S.redo, S.undo) : restore(S.undo, S.redo);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        restore(S.redo, S.undo);
      } else if (!typing && S.path.length && /^Arrow/.test(e.key) && !document.querySelector('.back')) {
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
    window.KApp = { S, openFile, exportFile, renderEditor, requestRender, layoutViews, A };
    window.KHost = {
      onList: l => {
        const w = listWait;
        listWait = null;
        if (w) w(Array.isArray(l) ? l : []);
      },
      reload: () => hostLibrary().catch(() => {}),
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
        wheel: d => {
          const el = cvEl();
          if (el) el.dispatchEvent(new WheelEvent('wheel', { deltaY: d, cancelable: true }));
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
        data: o => {
          Object.keys(o || {}).forEach(k => {
            if (S.sim[k] && typeof S.sim[k] === 'object' && !Array.isArray(S.sim[k])) Object.assign(S.sim[k], o[k]);
            else S.sim[k] = o[k];
          });
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
