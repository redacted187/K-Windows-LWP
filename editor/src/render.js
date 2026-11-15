// Layout + canvas renderer for Kustom presets.
(function (G) {
  'use strict';
  const F = G.KFormula;
  const LAYERS = { RootLayerModule: 1, OverlapLayerModule: 1, StackLayerModule: 1, KomponentModule: 1 };
  const D2R = Math.PI / 180;

  // ---------------- value resolution ----------------
  function makeEnv(state, view, rt) {
    const env = { state, view, rt, scopes: [], depth: 0, errors: 0 };
    env.fctx = {
      sim: state.sim,
      now: view.now || new Date(),
      h24: !!(state.sim.settings && state.sim.settings.clock24h),
      time: rt.time || 0,
      screen: {
        w: view.kw,
        h: view.kh,
        pw: view.pxW,
        ph: view.pxH,
        screen: Math.round(view.scroll) + 1,
        screens: view.screens,
        land: view.kw > view.kh,
        locked: view.locked
      },
      gv: name => gv(env, name),
      readText: state.assets.readText,
      listFiles: state.assets.listFiles
    };
    return env;
  }
  function evalF(env, tpl) {
    if (env.depth > 24) return '';
    env.depth++;
    try {
      const r = F.evaluate(tpl, env.fctx);
      if (r.error) env.errors++;
      return r.value;
    } finally {
      env.depth--;
    }
  }
  function globalValue(env, scopeIdx, key) {
    const sc = env.scopes[scopeIdx],
      g = sc.list[key];
    if (scopeIdx === 0 && env.rt.globals && env.rt.globals.has(key)) return env.rt.globals.get(key);
    const m = sc.mod,
      tg = m.internal_toggles && m.internal_toggles[key];
    // komponent globals may be bound to the parent scope
    if (scopeIdx > 0 && (tg === 100 || tg === 10)) {
      const saved = env.scopes;
      env.scopes = saved.slice(0, scopeIdx);
      try {
        if (tg === 100 && m.internal_globals && m.internal_globals[key] !== undefined) {
          const v = gv(env, m.internal_globals[key]);
          if (v !== undefined) return v;
        }
        if (tg === 10 && m.internal_formulas && m.internal_formulas[key] !== undefined)
          return evalF(env, m.internal_formulas[key]);
      } finally {
        env.scopes = saved;
      }
    }
    if (g.toggles === 100 && g.global) {
      // global bound to a global of an outer scope
      const saved = env.scopes;
      env.scopes = saved.slice(0, Math.max(1, scopeIdx));
      env.depth++;
      try {
        if (env.depth < 24 && !(scopeIdx === 0 && String(g.global).toLowerCase() === key)) {
          const v = gv(env, g.global);
          if (v !== undefined) return v;
        }
      } finally {
        env.scopes = saved;
        env.depth--;
      }
    }
    if (g.toggles === 10 && g.global_formula) {
      const r = evalF(env, g.global_formula);
      if (r !== '' || g.value === undefined || (g.type !== 'BITMAP' && g.type !== 'FONT')) return r;
    }
    let v = g.value;
    if (v === undefined) v = g.type === 'COLOR' ? '#FFFFFFFF' : g.type === 'NUMBER' || g.type === 'SWITCH' ? 0 : '';
    if (typeof v === 'string' && v.indexOf('$') >= 0) return evalF(env, v);
    return v;
  }
  function gv(env, name) {
    const key = String(name).toLowerCase();
    for (let i = env.scopes.length - 1; i >= 0; i--) {
      if (env.scopes[i].list && Object.prototype.hasOwnProperty.call(env.scopes[i].list, key))
        return globalValue(env, i, key);
    }
    if (env.rt.globals && env.rt.globals.has(key)) return env.rt.globals.get(key);
    return undefined;
  }
  // Resolve a property of a module (or animation/event object) honouring formula / global toggles.
  function P(env, m, k, d) {
    let v;
    const tg = m.internal_toggles ? m.internal_toggles[k] : 0;
    if (tg === 10 && m.internal_formulas && m.internal_formulas[k] !== undefined)
      v = evalF(env, m.internal_formulas[k]);
    else if (tg === 100 && m.internal_globals && m.internal_globals[k] !== undefined) {
      v = gv(env, m.internal_globals[k]);
      if (v === undefined) v = m[k];
    } else {
      v = m[k];
      if (typeof v === 'string' && v.indexOf('$') >= 0 && k !== 'text_expression') v = evalF(env, v);
    }
    if (v === undefined || v === null || v === '') return d;
    if (typeof d === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(v);
      return isFinite(n) ? n : d;
    }
    if (typeof d === 'string' && /^[A-Z0-9_]+$/.test(d) && typeof v === 'string' && !/^(#|kfile|http)/.test(v))
      return v.toUpperCase().trim();
    return v;
  }
  function css(c, fallback) {
    const p = F.parseColor(c) || F.parseColor(fallback || '#FFFFFFFF');
    return 'rgba(' + p.r + ',' + p.g + ',' + p.b + ',' + (p.a / 255).toFixed(4) + ')';
  }

  // ---------------- animations ----------------
  // Android's interpolators, which is what the phone uses
  const accDec = t => Math.cos((t + 1) * Math.PI) / 2 + 0.5,
    twoWay = f => t => (t < 0.5 ? f(t * 2) : f(2 - t * 2));
  const EASE = {
    NORMAL: accDec,
    STRAIGHT: t => t,
    LINEAR: t => t,
    INVERTED: t => 1 - t,
    OVERSHOOT: t => {
      const s = 2;
      t -= 1;
      return t * t * ((s + 1) * t + s) + 1;
    },
    ANTICIPATE: t => {
      const s = 2;
      return t * t * ((s + 1) * t - s);
    },
    ANTICIPATE_OVERSHOOT: t => {
      const s = 3;
      return t < 0.5
        ? 0.5 * (4 * t * t * ((s + 1) * 2 * t - s))
        : 0.5 * ((2 * t - 2) * (2 * t - 2) * ((s + 1) * (2 * t - 2) + s) + 2);
    },
    BOUNCE: t => {
      const b = x => x * x * 8;
      t *= 1.1226;
      return t < 0.3535
        ? b(t)
        : t < 0.7408
          ? b(t - 0.54719) + 0.7
          : t < 0.9644
            ? b(t - 0.8526) + 0.9
            : b(t - 1.0435) + 0.95;
    },
    ACCELERATE: t => t * t,
    DECELERATE: t => 1 - (1 - t) * (1 - t),
    NORMAL_2W: twoWay(accDec),
    STRAIGHT_2W: twoWay(t => t)
  };
  function centerScreen(center, n) {
    const mid = Math.floor((n - 1) / 2);
    if (center === 'FIRST') return 0;
    if (center === 'LAST') return n - 1;
    let m = /^SCREEN(\d+)$/.exec(center);
    if (m) return parseInt(m[1], 10) - 1;
    m = /^CENTER_([MP])(\d)$/.exec(center);
    if (m) return mid + (m[1] === 'M' ? -1 : 1) * parseInt(m[2], 10);
    return mid;
  }
  // A switch-driven animation runs from where it is to its new end over "duration", eased in time (so an overshoot
  // lands at the end of the move, whichever way it is going).
  function switchProgress(env, id, on, durS, delayS, ease) {
    const rt = env.rt,
      t = rt.time || 0,
      target = on ? 1 : 0;
    let st = rt.sw.get(id);
    if (!st) {
      st = { on, t0: -1e9, from: target, dur: 0, delay: 0, ease };
      rt.sw.set(id, st);
      return target;
    }
    const at = () => {
      const k = st.dur <= 0 ? 1 : Math.max(0, Math.min(1, (t - st.t0 - st.delay) / st.dur));
      return k >= 1 ? (st.on ? 1 : 0) : st.from + ((st.on ? 1 : 0) - st.from) * (st.ease || EASE.NORMAL)(k);
    };
    const cur = at();
    if (st.on !== on) {
      st.from = Math.max(0, Math.min(1, cur));
      st.on = on;
      st.t0 = t;
      st.dur = durS;
      st.delay = delayS;
      st.ease = ease;
      rt.animating = true;
      return st.from;
    }
    if (t - st.t0 - st.delay < st.dur) rt.animating = true;
    return cur;
  }
  function animTransform(env, m, node) {
    const tr = { dx: 0, dy: 0, alpha: 1, sx: 1, sy: 1, rot: 0, px: 0.5, py: 0.5 };
    const list = m.internal_animations;
    if (!list || !list.length) return tr;
    const v = env.view;
    list.forEach((a, idx) => {
      const type = P(env, a, 'type', 'SCROLL');
      if (type === 'DISABLED') return;
      const action = P(env, a, 'action', 'SCROLL'),
        speed = P(env, a, 'speed', 100) / 100,
        amount = P(env, a, 'amount', 100) / 100;
      const angle = P(env, a, 'angle', 0),
        easeN = P(env, a, 'ease', 'NORMAL'),
        ease = EASE[easeN] || EASE.NORMAL;
      const dur = P(env, a, 'duration', 10) / 10,
        delay = P(env, a, 'delay', 0) / 10;
      let p = 0,
        signed = 0,
        scrollLike = false;
      if (type === 'SCROLL') {
        const rule = P(env, a, 'rule', 'CENTER');
        let raw = v.scroll - centerScreen(P(env, a, 'center', 'CENTER'), v.screens);
        // the "In" actions (Scale In, Fade In, Color Filter In) run on the other side of the centre screen
        if (rule !== 'CENTER' && /^(SCALE|SCALE_X|SCALE_Y|FADE|COLOR)_INVERTED$/.test(action)) raw = -raw;
        if (rule === 'BEFORE_CENTER' || rule === 'UP_TO_CENTER') raw = Math.min(raw, 0);
        if (rule === 'AFTER_CENTER' || rule === 'FROM_CENTER') raw = Math.max(raw, 0);
        signed = raw;
        p = Math.min(1, Math.abs(raw) * speed);
        scrollLike = true;
        // "Before/After Center" play towards the centre screen and are complete on it; the other rules start from it
        if (rule === 'BEFORE_CENTER' || rule === 'AFTER_CENTER') p = 1 - p;
      } else if (type === 'LOOP_FW' || type === 'LOOP_2W' || type === 'LOOP') {
        const t = ((env.rt.time || 0) - delay) / Math.max(0.05, dur);
        let k = t - Math.floor(t);
        // two-way loops play the eased move out, then the same eased move back (a bounce settles at each end)
        p = type === 'LOOP_2W' ? (k < 0.5 ? ease(k * 2) : 1 - ease(k * 2 - 1)) : ease(k);
        signed = p;
        if (v.play) env.rt.animating = true;
      } else if (type === 'SWITCH') {
        const on =
          F.num(gv(env, P(env, a, 'trigger', '')) || 0) !== 0 || String(gv(env, P(env, a, 'trigger', ''))) === 'true';
        p = switchProgress(env, node.id + ':' + idx, on, dur, on ? delay : 0, ease);
        signed = p;
      } else if (type === 'FORMULA') {
        const on = F.num(evalF(env, a.formula || '')) !== 0;
        p = switchProgress(env, node.id + ':' + idx, on, dur, on ? delay : 0, ease);
        signed = p;
      } else if (type === 'UNLOCK') {
        p = switchProgress(env, node.id + ':' + idx, !!v.locked, dur, 0, ease);
        signed = p;
      } else if (type === 'VISUALIZER') {
        p = v.play ? 0.5 + 0.5 * Math.sin((env.rt.time || 0) * 9 + idx * 1.7 + (node.id % 7)) : 0.5;
        signed = p;
        if (v.play) env.rt.animating = true;
      } else if (type === 'GYRO') {
        p = 0;
      }
      const inv = /_INVERTED$/.test(action),
        base = action.replace(/_INVERTED$/, '');
      const anchor = P(env, a, 'anchor', 'MODULE_CENTER');
      if (base !== 'SCROLL' && base !== 'FADE' && base !== 'ADVANCED') {
        if (/^MODULE_/.test(anchor)) {
          if (/LEFT/.test(anchor)) tr.px = 0;
          else if (/RIGHT/.test(anchor)) tr.px = 1;
          if (/TOP/.test(anchor)) tr.py = 0;
          else if (/BOTTOM/.test(anchor)) tr.py = 1;
        }
      }
      switch (base) {
        case 'SCROLL': {
          // distance is a percentage of the 720-point screen width; page scrolling moves against the scroll
          // at 100% an item keeps pace with the wallpaper, which is "xscreens" screens wide and spread over all the pages
          const dist = scrollLike
            ? -signed * 720 * speed * (v.screens > 1 ? Math.max(1, (v.xscreens || 2) - 1) / (v.screens - 1) : 0)
            : p * 720 * speed;
          const s = inv ? -1 : 1;
          tr.dx += s * dist * Math.cos(angle * D2R);
          tr.dy += s * dist * Math.sin(angle * D2R);
          break;
        }
        case 'FADE':
          tr.alpha *= Math.max(0, 1 - (inv ? 1 - p : p) * amount);
          break;
        case 'ROTATE':
          tr.rot += (inv ? -1 : 1) * p * 360 * amount;
          break;
        // "Scale Out" shrinks by amount, "Scale In" (inverted) grows by amount
        case 'SCALE': {
          const s = inv ? 1 + p * amount * 14 : Math.max(0, 1 - p * amount);
          tr.sx *= s;
          tr.sy *= s;
          break;
        }
        case 'SCALE_X':
          tr.sx *= Math.max(0, 1 - p * amount);
          break;
        case 'SCALE_Y':
          tr.sy *= Math.max(0, 1 - p * amount);
          break;
        case 'ADVANCED': {
          const by = {};
          (a.animator || []).forEach(kf => {
            (by[kf.property] = by[kf.property] || []).push(kf);
          });
          const pos = p * 100;
          Object.keys(by).forEach(prop => {
            const ks = by[prop].slice().sort((x, y) => x.position - y.position);
            let val;
            if (pos <= ks[0].position) val = ks[0].value;
            else if (pos >= ks[ks.length - 1].position) val = ks[ks.length - 1].value;
            else
              for (let i = 0; i < ks.length - 1; i++)
                if (pos >= ks[i].position && pos <= ks[i + 1].position) {
                  const k = (pos - ks[i].position) / Math.max(1e-6, ks[i + 1].position - ks[i].position);
                  val = ks[i].value + (ks[i + 1].value - ks[i].value) * (EASE[ks[i + 1].ease] || EASE.STRAIGHT)(k);
                  break;
                }
            if (prop === 'X_OFFSET') tr.dx += val;
            else if (prop === 'Y_OFFSET') tr.dy += val;
            else if (prop === 'OPACITY') tr.alpha *= Math.max(0, Math.min(1, 1 - val / 100));
            else if (prop === 'SCALE_XY') {
              tr.sx *= val;
              tr.sy *= val;
            } else if (prop === 'SCALE_X') tr.sx *= val;
            else if (prop === 'SCALE_Y') tr.sy *= val;
            else if (prop === 'ROTATE') tr.rot += val;
          });
          break;
        }
      }
    });
    return tr;
  }
  function rotation(env, m, modeKey, offKey) {
    const mode = P(env, m, modeKey, 'NONE'),
      off = P(env, m, offKey, 0),
      now = env.fctx.now;
    const r = { deg: 0, fx: 1, fy: 1 };
    switch (mode) {
      case 'MANUAL':
        r.deg = off;
        break;
      case 'DEG90':
        r.deg = 90;
        r.quarter = true;
        break;
      case 'DEG180':
        r.deg = 180;
        break;
      case 'DEG270':
        r.deg = 270;
        r.quarter = true;
        break;
      case 'CLOCK_MINUTE_SMOOTH':
        r.deg = now.getMinutes() * 6 + now.getSeconds() / 10 + off;
        break;
      case 'CLOCK_SECOND_SMOOTH':
        r.deg = (now.getSeconds() + now.getMilliseconds() / 1000) * 6 + off;
        break;
      case 'FLIP_X':
        r.fx = -1;
        r.deg = off;
        break;
      case 'FLIP_Y':
        r.fy = -1;
        r.deg = off;
        break;
      case 'CLOCK_HOUR':
        r.deg = (now.getHours() % 12) * 30 + off;
        break;
      case 'CLOCK_HOUR_SMOOTH':
        r.deg = (now.getHours() % 12) * 30 + now.getMinutes() / 2 + off;
        break;
      case 'CLOCK_MINUTE':
        r.deg = now.getMinutes() * 6 + off;
        break;
      case 'CLOCK_SECOND':
        r.deg = now.getSeconds() * 6 + off;
        break;
    }
    return r;
  }
  const ROTKEYS = {
    TextModule: ['text_rotate_mode', 'text_rotate_offset'],
    ShapeModule: ['shape_rotate_mode', 'shape_rotate_offset'],
    BitmapModule: ['bitmap_rmode', 'bitmap_rotate'],
    MovieModule: ['bitmap_rmode', 'bitmap_rotate'],
    FontIconModule: ['icon_rotate_mode', 'icon_rotate_offset'],
    ProgressModule: ['progress_rotate_mode', 'progress_rotate_offset'],
    CurvedTextModule: ['text_rotate_mode', 'text_rotate_offset'],
    OverlapLayerModule: ['config_rotate_mode', 'config_rotate_offset'],
    StackLayerModule: ['config_rotate_mode', 'config_rotate_offset'],
    KomponentModule: ['config_rotate_mode', 'config_rotate_offset']
  };

  // ---------------- paint helpers ----------------
  const BLEND = {
    XOR: 'xor',
    CLEAR: 'destination-out',
    DST_OUT: 'destination-out',
    DARKEN: 'darken',
    LIGHTEN: 'lighten',
    SCREEN: 'screen',
    ADD: 'lighter',
    OVERLAY: 'overlay',
    DIFFERENCE: 'difference',
    SRC_ATOP: 'source-atop',
    DST_OVER: 'destination-over'
  };
  const strokeW = (env, m) => {
    const v = P(env, m, 'paint_stroke', 5);
    return v > 0 ? v : 0.7;
  }; // a zero-width stroke is a hairline
  // Paint modes work against what has already been drawn (never the wallpaper behind), the way Android's do:
  // Multiply only tints existing pixels, Src replaces them, Clear punches a hole.
  function blend(env, ctx, m, w, h, paint) {
    const mode = P(env, m, 'paint_mode', 'NORMAL');
    if (mode === 'DST') return;
    if (mode === 'MULTIPLY') {
      const k = Math.abs(env.rt.base.a) || 1,
        box = devBox(ctx, 0, 0, w, h, 8 * k, 0);
      if (!box) return;
      const tmp = subLayer(env, ctx, box),
        o = tmp.getContext('2d');
      paint(o, false);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = 'destination-in';
      o.globalAlpha = 1;
      o.drawImage(ctx.canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      blit(env, ctx, tmp, box, true);
      ctx.restore();
      return;
    }
    if (mode === 'SRC') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      paint(ctx, true);
      ctx.restore();
      paint(ctx, false);
      return;
    }
    ctx.save();
    if (BLEND[mode]) ctx.globalCompositeOperation = BLEND[mode];
    paint(ctx, mode === 'CLEAR');
    ctx.restore();
  }
  function fillStyle(env, ctx, m, w, h, colorKey) {
    const col = P(env, m, colorKey || 'paint_color', '#FFFFFFFF');
    const g = P(env, m, 'fx_gradient', 'NONE');
    if (g === 'NONE') return css(col);
    const c2 = css(P(env, m, 'fx_gradient_color', '#FF000000')),
      c1 = css(col);
    const gw = Math.max(0.001, P(env, m, 'fx_gradient_width', 100) / 100),
      go = P(env, m, 'fx_gradient_offset', 50) / 100;
    const a = Math.max(0, Math.min(1, go - gw / 2)),
      b = Math.max(0, Math.min(1, go + gw / 2));
    let gr;
    if (g === 'HORIZONTAL') gr = ctx.createLinearGradient(0, 0, w, 0);
    else if (g === 'VERTICAL') gr = ctx.createLinearGradient(0, 0, 0, h);
    else if (g === 'RADIAL' || g === 'SWEEP') {
      // the centre moves against the X / Y centre offsets, the radius is the item's longer side, and the colour
      // change sits at "offset" along it and is "width" wide, like the linear ones (measured on phone screenshots)
      const cx = w * (0.5 - P(env, m, 'fx_gradient_offset_x', 0) / 100),
        cy = h * (0.5 - P(env, m, 'fx_gradient_offset_y', 0) / 100);
      if (g === 'SWEEP' && ctx.createConicGradient) {
        gr = ctx.createConicGradient(0, cx, cy);
        gr.addColorStop(0, c1);
        gr.addColorStop(a, c1);
        gr.addColorStop(Math.max(a, b), c2);
        gr.addColorStop(1, c2);
        return gr;
      }
      gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
      gr.addColorStop(0, c1);
      gr.addColorStop(a, c1);
      gr.addColorStop(Math.max(a, b), c2);
      return gr;
    } else if (g === 'BITMAP') {
      const img = env.state.assets.image(P(env, m, 'fx_gradient_bitmap', ''));
      if (!img) return c1;
      const bw = P(env, m, 'fx_gradient_bitmap_width', 0) || w,
        sc = bw / img.width;
      const pat = ctx.createPattern(
        img,
        P(env, m, 'fx_gradient_bitmap_mode', 'FIT_CENTER') === 'REPEAT' ? 'repeat' : 'no-repeat'
      );
      if (pat.setTransform)
        pat.setTransform(
          new DOMMatrix()
            .translate(
              ((w - bw) / 2) * (P(env, m, 'fx_gradient_bitmap_mode', 'FIT_CENTER') === 'REPEAT' ? 0 : 1),
              ((h - img.height * sc) / 2) * (P(env, m, 'fx_gradient_bitmap_mode', 'FIT_CENTER') === 'REPEAT' ? 0 : 1)
            )
            .scale(sc)
        );
      return pat;
    } else return c1;
    if (a > 0) gr.addColorStop(0, c1);
    gr.addColorStop(a, c1);
    gr.addColorStop(b, c2);
    if (b < 1) gr.addColorStop(1, c2);
    return gr;
  }
  const TUNE = { textPad: 1, blurK: 0.115, shadowRoom: 1, bgBlur: 0.34, hueK: 1.8 };
  // "Outer" shadow, as Android's outer blur draws it: a blurred copy of the item in the shadow colour that is only
  // visible outside the item's own outline, at the shadow colour's full strength however see-through the fill is.
  // Device-space box of a local rectangle, grown by a margin and kept to the canvas (plus "over" pixels beyond its edges).
  function devBox(ctx, x0, y0, x1, y1, margin, over) {
    const t = ctx.getTransform(),
      cv = ctx.canvas,
      W = cv._w || cv.width,
      H = cv._h || cv.height;
    let a = 1e9,
      b = 1e9,
      c = -1e9,
      d = -1e9;
    [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1]
    ].forEach(p => {
      const X = t.a * p[0] + t.c * p[1] + t.e,
        Y = t.b * p[0] + t.d * p[1] + t.f;
      if (X < a) a = X;
      if (Y < b) b = Y;
      if (X > c) c = X;
      if (Y > d) d = Y;
    });
    over = over || 0;
    a = Math.max(-over, Math.floor(a - margin));
    b = Math.max(-over, Math.floor(b - margin));
    c = Math.min(W + over, Math.ceil(c + margin));
    d = Math.min(H + over, Math.ceil(d + margin));
    if (c - a < 1 || d - b < 1 || c <= 0 || d <= 0 || a >= W || b >= H) return null;
    return { x: a, y: b, w: c - a, h: d - b };
  }
  // A scratch layer covering just "box" of ctx's canvas, drawing with the same coordinates as ctx.
  function subLayer(env, ctx, box) {
    const c = env.rt.layer(box.w, box.h),
      o = c.getContext('2d'),
      t = ctx.getTransform(),
      cv = ctx.canvas;
    o.setTransform(t.a, t.b, t.c, t.d, t.e - box.x, t.f - box.y);
    c._ox = (cv._ox || 0) + box.x;
    c._oy = (cv._oy || 0) + box.y;
    return c;
  }
  function blit(env, ctx, c, box, keepAlpha) {
    ctx.save();
    const al = ctx.globalAlpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = keepAlpha ? al : ctx.globalAlpha;
    ctx.drawImage(c, 0, 0, box.w, box.h, box.x, box.y, box.w, box.h);
    ctx.restore();
    env.rt.release(c);
  }
  function shadowPass(env, ctx, m, paintColor, draw, w, h, full) {
    if (env.rt.maskMode || P(env, m, 'fx_shadow', 'NONE') !== 'OUTER') return;
    // with no shadow colour chosen the shadow takes the item's own colour
    const sc = Object.assign(
      {},
      F.parseColor(P(env, m, 'fx_shadow_color', paintColor)) || { a: 255, r: 0, g: 0, b: 0 }
    );
    // as on Android: a fully opaque shadow colour takes on the see-through-ness of the item's own colour
    if (sc.a >= 255) {
      const pc = F.parseColor(paintColor);
      if (pc) sc.a = pc.a;
    }
    if (sc.a <= 0) return;
    const t = ctx.getTransform(),
      k = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
    const dir = P(env, m, 'fx_shadow_direction', 0),
      dist = P(env, m, 'fx_shadow_distance', 0),
      blur = P(env, m, 'fx_shadow_blur', 5);
    const dx = Math.cos(dir * D2R) * dist * k,
      dy = -Math.sin(dir * D2R) * dist * k,
      sigma = (blur * TUNE.blurK + 0.5) * k; // measured against phone screenshots
    const reach = Math.ceil(3 * sigma + Math.abs(dx) + Math.abs(dy) + 12 * k),
      box = devBox(ctx, 0, 0, w, h, reach, reach);
    if (!box) return;
    const sil = subLayer(env, ctx, box),
      a = sil.getContext('2d'); // the item's silhouette
    a.fillStyle = '#000';
    a.strokeStyle = '#000';
    draw(a);
    const off = env.rt.layer(box.w, box.h),
      o = off.getContext('2d'); // blurred, tinted, with the inside removed
    o.filter = 'blur(' + sigma.toFixed(2) + 'px)';
    o.drawImage(sil, 0, 0, box.w, box.h, dx, dy, box.w, box.h);
    o.filter = 'none';
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = 'rgba(' + sc.r + ',' + sc.g + ',' + sc.b + ',' + (sc.a / 255).toFixed(4) + ')';
    o.fillRect(0, 0, box.w, box.h);
    // nothing of the shadow shows through the item itself (its outline is widened a touch so no fringe is left at the edge)
    // text, icon glyphs and outlines keep the whole soft copy; a filled shape's shadow is hollow where the shape's
    // shifted copy sits (widened a touch so no fringe is left at the edge)
    if (!full) {
      o.globalCompositeOperation = 'destination-out';
      o.drawImage(sil, 0, 0, box.w, box.h, dx, dy, box.w, box.h);
      o.filter = 'blur(' + Math.max(0.6, 0.5 * k).toFixed(2) + 'px)';
      for (let i = 0; i < 3; i++) o.drawImage(sil, 0, 0, box.w, box.h, dx, dy, box.w, box.h);
      o.filter = 'none';
    }
    env.rt.release(sil);
    blit(env, ctx, off, box, true);
  }
  function paintPath(env, ctx, m, w, h, path) {
    if (env.rt.maskMode) {
      ctx.fillStyle = '#000';
      ctx.fill(path);
      return;
    }
    const stroke = P(env, m, 'paint_style', 'FILL') === 'STROKE',
      lw = strokeW(env, m);
    const draw = c => {
      if (stroke) {
        c.lineWidth = lw;
        c.lineJoin = 'round';
        c.stroke(path);
      } else c.fill(path);
    };
    {
      const pc = F.parseColor(P(env, m, 'paint_color', '#FFFFFFFF'));
      shadowPass(
        env,
        ctx,
        m,
        P(env, m, 'paint_color', '#FFFFFFFF'),
        draw,
        w,
        h,
        stroke || (pc && pc.a === 0 && P(env, m, 'fx_gradient', 'NONE') === 'NONE')
      );
    } // an invisible shape used only for its glow keeps all of it
    const fs = fillStyle(env, ctx, m, w, h);
    blend(env, ctx, m, w, h, (c, solid) => {
      c.strokeStyle = c.fillStyle = solid ? '#000' : fs;
      draw(c);
    });
  }

  // ---------------- module measure/draw ----------------
  function shapePath(type, w, h, corners, angle) {
    const p = new Path2D();
    switch (type) {
      case 'CIRCLE':
        p.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
        break;
      case 'OVAL':
        p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        break;
      case 'TRIANGLE':
        p.moveTo(w / 2, 0);
        p.lineTo(w, h);
        p.lineTo(0, h);
        p.closePath();
        break;
      case 'RTRIANGLE':
        p.moveTo(0, 0);
        p.lineTo(w, h);
        p.lineTo(0, h);
        p.closePath();
        break;
      case 'EXAGON':
        for (let i = 0; i < 6; i++) {
          const a = (i * 60 - 90) * D2R,
            x = w / 2 + (w / 2) * Math.cos(a),
            y = w / 2 + (w / 2) * Math.sin(a);
          i ? p.lineTo(x, y) : p.moveTo(x, y);
        }
        p.closePath();
        break;
      case 'SQUIRCLE': {
        const r = w / 2,
          n = 4;
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * 2 * Math.PI,
            c = Math.cos(t),
            s = Math.sin(t);
          const x = r + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
            y = r + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
          i ? p.lineTo(x, y) : p.moveTo(x, y);
        }
        p.closePath();
        break;
      }
      case 'SLICE':
        p.moveTo(w / 2, w / 2);
        p.arc(w / 2, w / 2, w / 2, -Math.PI / 2, -Math.PI / 2 + (angle || 90) * D2R);
        p.closePath();
        break;
      case 'ARC': {
        const r = w / 2,
          th = Math.min(r, h);
        p.arc(r, r, r, -Math.PI / 2, -Math.PI / 2 + (angle || 90) * D2R);
        p.arc(r, r, Math.max(0, r - th), -Math.PI / 2 + (angle || 90) * D2R, -Math.PI / 2, true);
        p.closePath();
        break;
      }
      default: {
        const r = Math.max(0, Math.min(corners || 0, w / 2, h / 2));
        if (p.roundRect) p.roundRect(0, 0, w, h, r);
        else p.rect(0, 0, w, h);
      }
    }
    return p;
  }
  const SQUARE = { SQUARE: 1, CIRCLE: 1, EXAGON: 1, SQUIRCLE: 1, SLICE: 1, ARC: 1 };

  function parseMarkup(s) {
    const runs = [];
    const st = [{ b: false, i: false, u: false, c: null, s: null }];
    const re = /\[(\/?)(b|i|u|c|s)(?:=([^\]]*))?\]/gi;
    let last = 0,
      m;
    const push = t => {
      if (t) runs.push(Object.assign({ t }, st[st.length - 1]));
    };
    while ((m = re.exec(s))) {
      push(s.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) {
        if (st.length > 1) st.pop();
      } else {
        const n = Object.assign({}, st[st.length - 1]);
        const k = m[2].toLowerCase();
        if (k === 'b') n.b = true;
        else if (k === 'i') n.i = true;
        else if (k === 'u') n.u = true;
        else if (k === 'c') n.c = m[3];
        else if (k === 's') n.s = parseFloat(m[3]) || null;
        st.push(n);
      }
    }
    push(s.slice(last));
    return runs;
  }
  function textValue(env, m) {
    let s = m.text_expression === undefined ? '$df(hh:mm)$' : String(m.text_expression);
    if (
      m.internal_toggles &&
      m.internal_toggles.text_expression === 100 &&
      m.internal_globals &&
      m.internal_globals.text_expression
    ) {
      const v = gv(env, m.internal_globals.text_expression);
      if (v !== undefined) s = String(v);
    }
    s = evalF(env, s);
    (m.text_filter || []).forEach(f => {
      if (f === 'UP') s = s.toUpperCase();
      else if (f === 'LO') s = s.toLowerCase();
      else if (f === 'CAP') s = s.replace(/(^|\s)(\S)/g, (x, p, c) => p + c.toUpperCase());
      else if (f === 'REV') s = [...s].reverse().join('');
      else if (f === 'NS') s = s.replace(/\s+/g, '');
      else if (f === 'N2W' || f === 'ROMAN')
        s = evalF(env, '$tc(' + (f === 'N2W' ? 'n2w' : 'roman') + ', "' + s.replace(/"/g, '') + '")$');
    });
    return s;
  }
  function fontOf(env, m, size, run) {
    const fam = env.state.assets.font(P(env, m, 'text_family', '')) || 'Roboto, "Segoe UI", sans-serif';
    return (run && run.i ? 'italic ' : '') + (run && run.b ? 'bold ' : '') + size + 'px ' + fam;
  }

  function fontMetrics(env, m) {
    return env.state.assets.fontMetrics(P(env, m, 'text_family', ''));
  }
  function layoutText(env, ctx, m, size, maxW, maxLines) {
    const runs = parseMarkup(textValue(env, m));
    const lines = [];
    let cur = { items: [], w: 0, asc: 0, desc: 0 };
    const FM = fontMetrics(env, m);
    // line box from the font's own tables (ascent + descent + line gap), as Android lays text out
    const metricsFor = r => {
      const z = r.s || size;
      return { asc: FM.asc * z, desc: FM.desc * z };
    };
    const newLine = () => {
      lines.push(cur);
      cur = { items: [], w: 0, asc: 0, desc: 0 };
    };
    const add = (txt, r) => {
      ctx.font = fontOf(env, m, r.s || size, r);
      const w = ctx.measureText(txt).width,
        mm = metricsFor(r);
      cur.items.push({ t: txt, r, w, x: cur.w });
      cur.w += w;
      cur.asc = Math.max(cur.asc, mm.asc);
      cur.desc = Math.max(cur.desc, mm.desc);
    };
    runs.forEach(r => {
      r.t.split('\n').forEach((seg, si) => {
        if (si > 0) newLine();
        if (!maxW) {
          add(seg, r);
          return;
        }
        seg.split(/(\s+)/).forEach(word => {
          if (word === '') return;
          ctx.font = fontOf(env, m, r.s || size, r);
          const w = ctx.measureText(word).width;
          if (cur.w + w > maxW + 0.01 && cur.items.length && !/^\s+$/.test(word)) newLine();
          if (/^\s+$/.test(word) && !cur.items.length) return;
          add(word, r);
        });
      });
    });
    newLine();
    const mm = metricsFor({});
    lines.forEach(l => {
      if (!l.items.length) {
        l.asc = mm.asc;
        l.desc = mm.desc;
      }
    });
    let out = lines;
    let truncated = false;
    if (maxLines && out.length > maxLines) {
      out = out.slice(0, maxLines);
      truncated = true;
    }
    const padT = TUNE.textPad ? Math.max(0, FM.top - FM.asc) * size : 0,
      padB = 0; // the box runs from the font's top line to its descent
    const w = out.reduce((a, l) => Math.max(a, l.w), 0),
      h = out.reduce((a, l) => a + l.asc + l.desc, 0) + padT + padB;
    return { lines: out, w, h, truncated, all: lines.length, padT };
  }
  function measureText(env, ctx, m) {
    const type = P(env, m, 'text_size_type', 'SINGLE_FONT_HEIGHT');
    let size = P(env, m, 'text_size', 20);
    const tw = P(env, m, 'text_width', 100),
      th = P(env, m, 'text_height', 100),
      ml = Math.round(P(env, m, 'text_lines', 0));
    let L, boxW, boxH;
    if (type === 'FIXED_WIDTH') {
      L = layoutText(env, ctx, m, size, tw, ml || 0);
      boxW = tw;
      boxH = L.h;
    } else if (type === 'SINGLE_FIXED_WIDTH' || type === 'FIT_WIDTH') {
      L = layoutText(env, ctx, m, 100, 0, 0);
      size = L.w > 0 ? (100 * tw) / L.w : size;
      L = layoutText(env, ctx, m, size, 0, 0);
      boxW = tw;
      boxH = L.h;
    } else if (type === 'FIT_TO_BOX') {
      // text is linear in its size until it wraps, so solve directly, then shrink if wrapping made it overflow
      L = layoutText(env, ctx, m, 100, 0, 0);
      const FM = fontMetrics(env, m),
        fitH = L.h - L.padT + Math.max(0, FM.bottom - FM.desc) * 100;
      // the height sets the size; a line that is still too wide gives way a little, then is cut short with an ellipsis
      const byH = fitH > 0 ? (100 * th) / fitH : 1e9,
        byW = L.w > 0 ? (100 * tw) / L.w : 1e9;
      size = Math.max(1, Math.min(byH, Math.max(byW, byH * 0.75)));
      L = layoutText(env, ctx, m, size, 0, 0);
      L.h -= L.padT;
      L.padT = 0;
      boxW = tw;
      boxH = th;
      L.lines.forEach(l => {
        if (l.w <= tw + 0.5 || !l.items.length) return;
        const it = l.items[l.items.length - 1];
        ctx.font = fontOf(env, m, it.r.s || size, it.r);
        let t = l.items.map(x => x.t).join('');
        while (t.length > 1 && ctx.measureText(t + '…').width > tw) t = t.slice(0, -1);
        t = t.replace(/\s+$/, '') + '…';
        l.items = [{ t, r: l.items[0].r, w: ctx.measureText(t).width, x: 0 }];
        l.w = l.items[0].w;
      });
      L.w = L.lines.reduce((a, l) => Math.max(a, l.w), 0);
      boxW = Math.min(tw, L.w); // the item is only as wide as its text
    } else {
      L = layoutText(env, ctx, m, size, 0, 0);
      boxW = L.w;
      boxH = L.h;
    }
    const align = P(env, m, 'text_align', 'LEFT');
    return {
      w: boxW,
      h: boxH,
      draw(ctx) {
        const stroke = P(env, m, 'paint_style', 'FILL') === 'STROKE';
        const paint = (c, over) => {
          let y = (boxH - L.h) / 2 + L.padT;
          c.textBaseline = 'alphabetic';
          c.textAlign = 'left';
          c.lineWidth = strokeW(env, m);
          c.lineJoin = 'round';
          L.lines.forEach(l => {
            const x0 = align === 'RIGHT' ? boxW - l.w : align === 'CENTER' ? (boxW - l.w) / 2 : 0;
            y += l.asc;
            l.items.forEach(it => {
              c.font = fontOf(env, m, it.r.s || size, it.r);
              const st = over || (it.r.c ? css(it.r.c) : fs);
              if (stroke) {
                c.strokeStyle = st;
                c.strokeText(it.t, x0 + it.x, y);
              } else {
                c.fillStyle = st;
                c.fillText(it.t, x0 + it.x, y);
              }
              if (it.r.u) {
                c.fillStyle = st;
                c.fillRect(x0 + it.x, y + size * 0.08, it.w, Math.max(1, size * 0.06));
              }
            });
            y += l.desc;
          });
        };
        let fs = '#000';
        if (env.rt.maskMode) return paint(ctx, '#000');
        shadowPass(env, ctx, m, P(env, m, 'paint_color', '#FFFFFFFF'), c => paint(c, '#000'), boxW, boxH, true);
        fs = fillStyle(env, ctx, m, boxW, boxH);
        blend(env, ctx, m, boxW, boxH, (c, solid) => paint(c, solid ? '#000' : null));
      }
    };
  }
  // "Morphing Text": one line; Ratio flattens the letters, Skew slants them, Spacing spreads them, Justify fills Width.
  function measureCurved(env, ctx, m) {
    const size = P(env, m, 'text_size', 20),
      ratio = P(env, m, 'text_ratio', 0) / 100,
      skew = P(env, m, 'text_skew', 0) / 200;
    const txt = textValue(env, m)
        .replace(/\[[^\]]*\]/g, '')
        .trim(),
      chars = [...txt];
    ctx.font = fontOf(env, m, size);
    const FM = fontMetrics(env, m),
      asc = FM.top * size,
      desc = FM.desc * size;
    let spacing = P(env, m, 'text_spacing', 0),
      natural = 0;
    const ws = chars.map(ch => {
      const w = ctx.measureText(ch).width;
      natural += w;
      return w;
    });
    const tw = P(env, m, 'text_width', 0);
    if (P(env, m, 'text_mode', 'AUTO') === 'JUSTIFY' && tw > 0 && chars.length > 1)
      spacing = (tw - natural) / (chars.length - 1);
    const sy = ratio > 0 ? Math.min(1, Math.sqrt(ratio)) : 1; // how much the letters are flattened
    const w = Math.max(0, natural + spacing * Math.max(0, chars.length - 1)),
      h = ratio > 0 ? size * ratio * 1.16 : asc + desc;
    return {
      w,
      h,
      draw(ctx) {
        const stroke = P(env, m, 'paint_style', 'FILL') === 'STROKE';
        const paint = c => {
          c.save();
          c.translate(0, (h - (asc + desc) * sy) / 2 + asc * sy);
          c.transform(1, 0, -skew * sy, sy, 0, 0); // baseline, slant, flatten
          c.font = fontOf(env, m, size);
          c.textBaseline = 'alphabetic';
          c.textAlign = 'left';
          c.lineJoin = 'round';
          if (stroke) c.lineWidth = strokeW(env, m);
          let x = 0;
          chars.forEach((ch, i) => {
            stroke ? c.strokeText(ch, x, 0) : c.fillText(ch, x, 0);
            x += ws[i] + spacing;
          });
          c.restore();
        };
        if (env.rt.maskMode) {
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#000';
          return paint(ctx);
        }
        shadowPass(env, ctx, m, P(env, m, 'paint_color', '#FFFFFFFF'), paint, w, h, true);
        const fs = fillStyle(env, ctx, m, w, h);
        blend(env, ctx, m, w, h, (c, solid) => {
          c.fillStyle = c.strokeStyle = solid ? '#000' : fs;
          paint(c);
        });
      }
    };
  }
  function measureShape(env, ctx, m) {
    const type = P(env, m, 'shape_type', 'SQUARE'),
      w = P(env, m, 'shape_width', 100);
    let h = P(env, m, 'shape_height', 100);
    if (SQUARE[type]) h = w;
    const path = shapePath(
      type,
      w,
      type === 'ARC' ? P(env, m, 'shape_height', 100) : h,
      P(env, m, 'shape_corners', 0),
      P(env, m, 'shape_angle', 0)
    );
    return {
      w,
      h,
      path,
      draw(ctx) {
        paintPath(env, ctx, m, w, h, path);
      }
    };
  }
  function bitmapFilter(env, m, pre) {
    const f = [];
    const blur = P(env, m, pre + 'blur', 0),
      dim = P(env, m, pre + 'dim', 0),
      flt = P(env, m, pre + 'filter', 'NONE'),
      amt = P(env, m, pre + 'filter_amount', 100);
    if (blur > 0) f.push('blur(' + (blur / 6).toFixed(2) + 'px)');
    if (dim > 0) f.push('brightness(' + Math.max(0, 1 - dim / 100).toFixed(3) + ')');
    switch (flt) {
      case 'DESATURATE':
        f.push('grayscale(' + amt + '%)');
        break;
      case 'BW':
        f.push('grayscale(100%)');
        break;
      case 'SEPIA':
        f.push('sepia(' + amt + '%)');
        break;
      case 'BRIGHTEN':
        f.push('brightness(' + (1 + amt / 100) + ')');
        break;
      case 'DARKEN':
        f.push('brightness(' + Math.max(0, 1 - amt / 100) + ')');
        break;
      case 'CONTRAST':
        f.push('contrast(' + (1 + amt / 100) + ')');
        break;
      case 'SATURATE':
        f.push('saturate(' + (1 + amt / 100) + ')');
        break;
      case 'HUE':
        f.push('hue-rotate(' + (amt * TUNE.hueK).toFixed(1) + 'deg)');
        break;
    }
    return {
      css: f.length ? f.join(' ') : 'none',
      colorize: flt === 'COLORIZE' ? { color: P(env, m, pre + 'filter_color', '#FFFFFFFF'), amt: amt / 100 } : null
    };
  }
  function drawImageFx(env, ctx, img, x, y, w, h, fx, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (fx.colorize) {
      const t = ctx.getTransform(),
        k = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
      const cw = Math.max(1, Math.min(2048, Math.ceil(w * k))),
        ch = Math.max(1, Math.min(2048, Math.ceil(h * k)));
      const off = env.rt.scratch(cw, ch),
        o = off.getContext('2d');
      o.filter = fx.css;
      o.drawImage(img, 0, 0, cw, ch);
      o.filter = 'none';
      o.globalAlpha = fx.colorize.amt;
      o.filter = (fx.css === 'none' ? '' : fx.css + ' ') + 'grayscale(100%)';
      o.drawImage(img, 0, 0, cw, ch);
      o.filter = 'none';
      o.globalCompositeOperation = 'multiply';
      o.fillStyle = css(fx.colorize.color);
      o.fillRect(0, 0, cw, ch);
      o.globalCompositeOperation = 'destination-in';
      o.globalAlpha = 1;
      o.drawImage(img, 0, 0, cw, ch);
      o.globalCompositeOperation = 'source-over';
      ctx.drawImage(off, x, y, w, h);
    } else {
      if (fx.css !== 'none') ctx.filter = fx.css;
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  }
  function placeholder(ctx, w, h, label) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeRect(0, 0, w, h);
    if (label && w > 30) {
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = Math.max(8, Math.min(14, w / 8)) + 'px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(label, w / 2, h / 2, w - 4);
    }
    ctx.restore();
  }
  function measureBitmap(env, ctx, m) {
    const movie = m.internal_type === 'MovieModule';
    const uri = P(env, m, movie ? 'bitmap_movie_uri' : 'bitmap_bitmap', '');
    const img = env.state.assets.image(uri);
    const w = P(env, m, 'bitmap_width', 100);
    const ar = img ? img.height / img.width : 1,
      h = w * ar;
    return {
      w,
      h,
      draw(ctx) {
        if (!img) return placeholder(ctx, w, h, uri ? 'image' : 'no image');
        shadowPass(env, ctx, m, '#FF000000', c => c.drawImage(img, 0, 0, w, h), w, h);
        drawImageFx(env, ctx, img, 0, 0, w, h, bitmapFilter(env, m, 'bitmap_'), P(env, m, 'bitmap_alpha', 100) / 100);
      }
    };
  }
  function measureIcon(env, ctx, m) {
    const size = P(env, m, 'icon_size', 80),
      set = env.state.assets.iconSet(P(env, m, 'icon_set', '')),
      name = String(P(env, m, 'icon_icon', ''));
    const ic = set && (set[name] || set[name.toLowerCase()]);
    const fam = set && set._font && set._font();
    return {
      w: size,
      h: size,
      draw(ctx) {
        if (!ic || !fam) return placeholder(ctx, size, size, name || 'icon');
        // draw the real glyph from the icon font, centred in its square
        const ch = String.fromCodePoint(ic.code);
        ctx.font = size + 'px ' + fam;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        const mt = ctx.measureText(ch);
        const gw = mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight,
          gh = mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent;
        const x = (size - gw) / 2 + mt.actualBoundingBoxLeft,
          y = (size - gh) / 2 + mt.actualBoundingBoxAscent;
        if (env.rt.maskMode) {
          ctx.fillStyle = '#000';
          ctx.fillText(ch, x, y);
          return;
        }
        const stroke = P(env, m, 'paint_style', 'FILL') === 'STROKE',
          lw = strokeW(env, m);
        const paint = c => {
          c.lineWidth = lw;
          c.font = size + 'px ' + fam;
          c.textBaseline = 'alphabetic';
          c.textAlign = 'left';
          stroke ? c.strokeText(ch, x, y) : c.fillText(ch, x, y);
        };
        shadowPass(env, ctx, m, P(env, m, 'paint_color', '#FFFFFFFF'), paint, size, size, true);
        const fs = fillStyle(env, ctx, m, size, size);
        blend(env, ctx, m, size, size, (c, solid) => {
          c.strokeStyle = c.fillStyle = solid ? '#000' : fs;
          paint(c);
        });
      }
    };
  }
  function progressValue(env, m) {
    const src = P(env, m, 'progress_progress', 'BATTERY');
    const s = env.state.sim,
      now = env.fctx.now;
    if (src === 'CUSTOM') {
      const mn = P(env, m, 'progress_min', 0),
        mx = P(env, m, 'progress_max', 100),
        v = P(env, m, 'progress_level', 50);
      return mx === mn ? 0 : Math.max(0, Math.min(1, (v - mn) / (mx - mn)));
    }
    if (src === 'MUSIC') return s.mi.len ? Math.max(0, Math.min(1, F.num(s.mi.pos) / F.num(s.mi.len))) : 0;
    if (src === 'MUSIC_VOLUME') return F.num(s.mi.vol) / 100;
    if (src === 'H12') return (now.getHours() % 12) / 12;
    if (src === 'H24') return now.getHours() / 24;
    if (src === 'MINS') return now.getMinutes() / 60;
    if (src === 'MINS_5') return Math.floor(now.getMinutes() / 5) / 12;
    if (src === 'SECS') return now.getSeconds() / 60;
    return (s.bi.level || 0) / 100;
  }
  function measureProgress(env, ctx, m) {
    const style = P(env, m, 'style_style', 'LINEAR'),
      size = P(env, m, 'style_size', 100),
      sw = P(env, m, 'style_width', 100),
      sh = P(env, m, 'style_height', 10);
    const mode = P(env, m, 'progress_mode', 'FLAT'),
      count = Math.max(1, Math.round(P(env, m, 'progress_count', 12)));
    const circ = style !== 'LINEAR';
    const w = size,
      h = circ ? size : sh; // a linear bar is "size" long and "height" thick
    return {
      w,
      h,
      draw(ctx) {
        const v = progressValue(env, m),
          fg = css(P(env, m, 'color_fgcolor', '#FFFFFFFF')),
          bg = css(P(env, m, 'color_bgcolor', '#44FFFFFF'));
        if (!circ) {
          if (mode === 'FLAT') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = fg;
            ctx.fillRect(0, 0, w * v, h);
          } else {
            const gap = (w / count) * 0.25,
              bw = w / count - gap;
            for (let i = 0; i < count; i++) {
              ctx.fillStyle = (i + 0.5) / count <= v ? fg : bg;
              ctx.fillRect(i * (bw + gap) + gap / 2, 0, bw, h);
            }
          }
          return;
        }
        const r = size / 2 - sh / 2;
        ctx.lineWidth = sh;
        ctx.lineCap = 'butt';
        const arc = (a0, a1, col) => {
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, Math.max(0.1, r), a0 - Math.PI / 2, a1 - Math.PI / 2);
          ctx.stroke();
        };
        if (mode === 'FLAT') {
          arc(0, Math.PI * 2, bg);
          if (v > 0) arc(0, Math.PI * 2 * v, fg);
        } else {
          const seg = (Math.PI * 2) / count,
            gap = seg * 0.2;
          for (let i = 0; i < count; i++)
            arc(i * seg + gap / 2, (i + 1) * seg - gap / 2, (i + 0.5) / count <= v ? fg : bg);
        }
      }
    };
  }

  // ---------------- layout tree ----------------
  let NID = 0;
  function visibleMode(env, m) {
    return P(env, m, 'config_visible', 'ALWAYS');
  }
  function build(env, ctx, m, parentIsStack, parentIsRoot) {
    const t = m.internal_type;
    const node = { m, id: ++NID, w: 0, h: 0, kids: null };
    const outerScopes = env.scopes;
    if (t === 'KomponentModule') env.scopes = env.scopes.concat([{ list: m.globals_list || {}, mod: m }]);
    node.scopes = env.scopes;
    try {
      return buildInner(env, ctx, m, parentIsStack, parentIsRoot, node, t);
    } finally {
      env.scopes = outerScopes;
    }
  }
  function buildInner(env, ctx, m, parentIsStack, parentIsRoot, node, t) {
    node.pl = P(env, m, 'position_padding_left', 0);
    node.pt = P(env, m, 'position_padding_top', 0);
    node.pr = P(env, m, 'position_padding_right', 0);
    node.pb = P(env, m, 'position_padding_bottom', 0);
    node.anchor = P(env, m, 'position_anchor', parentIsRoot ? 'TOP' : 'CENTER');
    node.ox = parentIsStack ? 0 : P(env, m, 'position_offset_x', 0);
    node.oy = parentIsStack ? 0 : P(env, m, 'position_offset_y', 0);
    const vis = visibleMode(env, m);
    node.hidden =
      vis === 'NEVER' ||
      vis === 'REMOVE' ||
      (vis === 'IF_LOCKED' && !env.view.locked) ||
      (vis === 'IF_NOT_LOCKED' && env.view.locked) ||
      (vis === 'IF_LANDSCAPE' && env.view.kw <= env.view.kh) ||
      (vis === 'IF_PORTRAIT' && env.view.kw > env.view.kh);
    node.removed = vis === 'REMOVE';
    let body;
    if (LAYERS[t]) {
      const isK = t === 'KomponentModule';
      const items = m.viewgroup_items || [];
      const stack = t === 'StackLayerModule';
      node.kids = items.map(c => build(env, ctx, c, stack, t === 'RootLayerModule')).filter(k => !k.removed);
      const scale = t === 'RootLayerModule' ? 1 : P(env, m, 'config_scale_value', 100) / 100;
      let cw = 0,
        ch = 0;
      if (stack) {
        const st = P(env, m, 'config_stacking', 'VERTICAL_LEFT'),
          margin = P(env, m, 'config_margin', 0),
          hor = /^HORIZONTAL/.test(st),
          al = st.split('_')[1];
        let pos = 0;
        node.kids.forEach((k, i) => {
          const ow = k.w + k.pl + k.pr,
            oh = k.h + k.pt + k.pb;
          if (i) pos += margin;
          if (hor) {
            k.x = pos + k.pl;
            pos += ow;
            ch = Math.max(ch, oh);
          } else {
            k.y = pos + k.pt;
            pos += oh;
            cw = Math.max(cw, ow);
          }
        });
        if (hor) cw = pos;
        else ch = pos;
        node.kids.forEach(k => {
          const ow = k.w + k.pl + k.pr,
            oh = k.h + k.pt + k.pb;
          if (hor) k.y = (al === 'TOP' ? 0 : al === 'BOTTOM' ? ch - oh : (ch - oh) / 2) + k.pt;
          else k.x = (al === 'LEFT' ? 0 : al === 'RIGHT' ? cw - ow : (cw - ow) / 2) + k.pl;
        });
      } else {
        if (t === 'RootLayerModule') {
          cw = env.view.kw;
          ch = env.view.kh;
        } else
          node.kids.forEach(k => {
            cw = Math.max(cw, k.w + k.pl + k.pr);
            ch = Math.max(ch, k.h + k.pt + k.pb);
          });
        node.kids.forEach(k => {
          const ow = k.w + k.pl + k.pr,
            oh = k.h + k.pt + k.pb,
            a = k.anchor;
          // offsets point inward from the anchored edge: mirrored for right / bottom anchors
          k.x =
            (/LEFT/.test(a) ? 0 : /RIGHT/.test(a) ? cw - ow : (cw - ow) / 2) + k.pl + (/RIGHT/.test(a) ? -k.ox : k.ox);
          k.y =
            (/^TOP/.test(a) ? 0 : /^BOTTOM/.test(a) ? ch - oh : (ch - oh) / 2) +
            k.pt +
            (/^BOTTOM/.test(a) ? -k.oy : k.oy);
        });
      }
      node.scale = scale;
      node.w = cw * scale;
      node.h = ch * scale;
      node.cw = cw;
      node.ch = ch;
      node.ownLayer = t !== 'RootLayerModule' && node.kids.some(k => k.blends); // a paint mode only reaches as far as the group it is in
      node.locked = isK && !items.length && !!m.internal_readonly;
      if (node.locked) {
        node.w = node.h = 120 * scale;
      }
    } else {
      body =
        t === 'TextModule'
          ? measureText(env, ctx, m)
          : t === 'ShapeModule'
            ? measureShape(env, ctx, m)
            : t === 'BitmapModule' || t === 'MovieModule'
              ? measureBitmap(env, ctx, m)
              : t === 'FontIconModule'
                ? measureIcon(env, ctx, m)
                : t === 'ProgressModule'
                  ? measureProgress(env, ctx, m)
                  : t === 'CurvedTextModule'
                    ? measureCurved(env, ctx, m)
                    : {
                        w: 60,
                        h: 60,
                        draw(c) {
                          placeholder(c, 60, 60, (t || '?').replace('Module', ''));
                        }
                      };
      node.w = body.w;
      node.h = body.h;
      node.body = body;
      node.mask = P(env, m, 'fx_mask', 'NONE');
      node.ex = 0;
      node.ey = 0;
      {
        const pm = P(env, m, 'paint_mode', 'NORMAL');
        node.blends =
          pm !== 'NORMAL' &&
          pm !== 'SRC_OVER' &&
          (t === 'ShapeModule' || t === 'TextModule' || t === 'FontIconModule' || t === 'CurvedTextModule');
      }
      // an item with a shadow reserves room for it: its box covers the item and a copy pushed twice the shadow distance,
      // so the item itself sits on the side away from the shadow; stroked shapes also reserve their line width
      if (TUNE.shadowRoom && t !== 'ProgressModule') {
        if (t === 'ShapeModule' && P(env, m, 'paint_style', 'FILL') === 'STROKE') {
          const sw = P(env, m, 'paint_stroke', 5);
          node.w += sw;
          node.h += sw;
          node.ex = sw / 2;
          node.ey = sw / 2;
        }
        const dist = P(env, m, 'fx_shadow', 'NONE') === 'OUTER' ? P(env, m, 'fx_shadow_distance', 0) : 0;
        if (dist) {
          const dir = P(env, m, 'fx_shadow_direction', 0),
            dx = Math.cos(dir * D2R) * dist,
            dy = -Math.sin(dir * D2R) * dist;
          node.w += 2 * Math.abs(dx);
          node.h += 2 * Math.abs(dy);
          if (dx < 0) node.ex -= 2 * dx;
          if (dy < 0) node.ey -= 2 * dy;
        }
      }
    }
    const rk = ROTKEYS[t];
    node.rot = rk ? rotation(env, m, rk[0], rk[1]) : { deg: 0, fx: 1, fy: 1 };
    if (!node.kids && (node.rot.deg === 90 || node.rot.deg === 270) && node.rot.quarter) {
      node.bw = node.w;
      node.bh = node.h;
      node.w = node.bh;
      node.h = node.bw;
    }
    node.tr = animTransform(env, m, node);
    return node;
  }
  function drawBackground(env, ctx, clipOnly) {
    const root = env.state.preset.preset_root,
      v = env.view;
    const type = P(env, root, 'background_type', 'SOLID');
    ctx.fillStyle = css(P(env, root, 'background_color', '#FF000000'));
    ctx.fillRect(0, 0, v.kw, v.kh);
    if (type === 'IMAGE') {
      const img = env.state.assets.image(P(env, root, 'background_bitmap', ''));
      if (img) {
        const sc = Math.max(v.kw / img.width, v.kh / img.height),
          dw = img.width * sc,
          dh = img.height * sc;
        const scrollable = P(env, root, 'background_scroll', 'NORMAL') !== 'NONE' && v.screens > 1;
        const extra = dw - v.kw;
        const x = scrollable && extra > 0 ? -extra * (v.scroll / (v.screens - 1)) : -extra / 2;
        drawImageFx(env, ctx, img, x, (v.kh - dh) / 2, dw, dh, bitmapFilter(env, root, 'background_'), 1);
      }
    }
  }
  function bgLayer(env) {
    if (env.rt.bg && env.rt.bgFor === env) return env.rt.bg;
    const cv = env.rt.main,
      c = env.rt.bg || (env.rt.bg = document.createElement('canvas'));
    c.width = cv.width;
    c.height = cv.height;
    const o = c.getContext('2d');
    o.setTransform(env.rt.base);
    drawBackground(env, o);
    env.rt.bgFor = env;
    return c;
  }
  // the wallpaper background blurred by sigma device pixels: worked out on a shrunken copy with its edges stretched outwards so the blur never pulls in emptiness
  function blurBg(env, sig) {
    const src = bgLayer(env),
      f = Math.min(1, 5 / sig),
      w = Math.max(2, Math.round(src.width * f)),
      h = Math.max(2, Math.round(src.height * f)),
      s2 = sig * f,
      pad = Math.ceil(s2 * 3) + 1;
    const map = env.rt.bb || (env.rt.bb = {}),
      key = Math.round(sig * 4);
    let e = map[key];
    if (e && e.env === env) return e;
    if (!e) {
      if (Object.keys(map).length > 12) env.rt.bb = {};
      e = env.rt.bb[key] = { a: document.createElement('canvas'), c: document.createElement('canvas') };
    }
    e.env = env;
    e.w = w;
    e.h = h;
    e.pad = pad;
    const W = w + pad * 2,
      H = h + pad * 2;
    e.a.width = W;
    e.a.height = H;
    e.c.width = W;
    e.c.height = H;
    const a = e.a.getContext('2d'),
      sw = src.width,
      sh = src.height;
    a.imageSmoothingQuality = 'high';
    a.drawImage(src, 0, 0, 1, 1, 0, 0, pad, pad);
    a.drawImage(src, sw - 1, 0, 1, 1, pad + w, 0, pad, pad);
    a.drawImage(src, 0, sh - 1, 1, 1, 0, pad + h, pad, pad);
    a.drawImage(src, sw - 1, sh - 1, 1, 1, pad + w, pad + h, pad, pad);
    a.drawImage(src, 0, 0, sw, 1, pad, 0, w, pad);
    a.drawImage(src, 0, sh - 1, sw, 1, pad, pad + h, w, pad);
    a.drawImage(src, 0, 0, 1, sh, 0, pad, pad, h);
    a.drawImage(src, sw - 1, 0, 1, sh, pad + w, pad, pad, h);
    a.drawImage(src, pad, pad, w, h);
    const c = e.c.getContext('2d');
    c.filter = 'blur(' + s2.toFixed(2) + 'px)';
    c.drawImage(e.a, 0, 0);
    c.filter = 'none';
    return e;
  }
  function nodeTransform(ctx, node) {
    const tr = node.tr,
      r = node.rot;
    ctx.translate(node.x + tr.dx, node.y + tr.dy);
    if (r.deg || r.fx !== 1 || r.fy !== 1) {
      ctx.translate(node.w / 2, node.h / 2);
      ctx.rotate(r.deg * D2R);
      ctx.scale(r.fx, r.fy);
      ctx.translate(-(node.bw || node.w) / 2, -(node.bh || node.h) / 2);
    }
    if (tr.rot || tr.sx !== 1 || tr.sy !== 1) {
      const px = node.w * tr.px,
        py = node.h * tr.py;
      ctx.translate(px, py);
      ctx.rotate(tr.rot * D2R);
      ctx.scale(tr.sx, tr.sy);
      ctx.translate(-px, -py);
    }
  }
  function drawNode(env, ctx, node, maskDraw) {
    if (node.hidden) return;
    const tr = node.tr,
      savedScopes = env.scopes,
      cv = ctx.canvas;
    env.scopes = node.scopes;
    ctx.save();
    nodeTransform(ctx, node);
    ctx.globalAlpha *= Math.max(0, Math.min(1, tr.alpha));
    if (!maskDraw) {
      let mt = ctx.getTransform();
      if (cv._ox || cv._oy) mt = new DOMMatrix().translate(cv._ox || 0, cv._oy || 0).multiply(mt);
      env.rt.hits.push({ m: node.m, mt, w: node.bw || node.w, h: node.bh || node.h, depth: env.rt.depth });
    }
    if (node.kids) {
      if (node.locked) placeholder(ctx, node.w, node.h, 'locked komponent');
      if (node.scale !== 1) ctx.scale(node.scale, node.scale);
      env.rt.depth++;
      const lb =
        node.ownLayer && !maskDraw
          ? devBox(ctx, 0, 0, node.cw, node.ch, 240 * (Math.abs(env.rt.base.a) || 1), 0)
          : null;
      if (lb) {
        const off = subLayer(env, ctx, lb);
        drawKids(env, off.getContext('2d'), node.kids);
        blit(env, ctx, off, lb, true);
      } else if (!node.ownLayer || maskDraw) drawKids(env, ctx, node.kids);
      env.rt.depth--;
    } else if (node.body && ctx.globalAlpha > 0.002) {
      const mk = node.mask,
        k = Math.abs(env.rt.base.a) || 1;
      // nothing of an item that sits wholly off the canvas needs drawing
      const box = devBox(ctx, 0, 0, node.bw || node.w, node.bh || node.h, maskDraw ? 2 : 80 * k, 0);
      if (box && !maskDraw && (mk === 'BACKGROUND' || mk === 'BLURRED')) {
        const bb = devBox(ctx, 0, 0, node.bw || node.w, node.bh || node.h, 2, 0);
        if (bb) {
          const off = subLayer(env, ctx, bb),
            o = off.getContext('2d');
          o.translate(node.ex || 0, node.ey || 0);
          const mt = o.getTransform();
          node.body.draw(o);
          o.setTransform(1, 0, 0, 1, 0, 0);
          o.globalCompositeOperation = 'source-in';
          o.globalAlpha = 1;
          {
            const fx = bitmapFilter(env, node.m, 'fx_bitmap_'),
              rest = fx.css === 'none' ? '' : fx.css.replace(/blur\([^)]*\)\s*/, '').trim();
            const sig = mk === 'BLURRED' ? P(env, node.m, 'fx_bitmap_blur', 0) * TUNE.bgBlur * k : 0,
              bg = bgLayer(env);
            o.filter =
              ((fx.colorize ? 'grayscale(' + Math.round(fx.colorize.amt * 100) + '%) ' : '') + rest).trim() || 'none';
            if (sig > 0.3) {
              const bl = blurBg(env, sig);
              o.drawImage(bl.c, bl.pad, bl.pad, bl.w, bl.h, -off._ox, -off._oy, bg.width, bg.height);
            } else o.drawImage(bg, -off._ox, -off._oy);
            o.filter = 'none';
            if (fx.colorize) {
              // tint, then cut back to the item's outline
              o.globalCompositeOperation = 'multiply';
              o.globalAlpha = fx.colorize.amt;
              o.fillStyle = css(fx.colorize.color);
              o.fillRect(0, 0, off.width, off.height);
              o.globalAlpha = 1;
              o.globalCompositeOperation = 'destination-in';
              o.setTransform(mt);
              node.body.draw(o);
              o.setTransform(1, 0, 0, 1, 0, 0);
            }
            o.globalCompositeOperation = 'source-over';
          }
          blit(env, ctx, off, bb, true);
        }
      } else if (box) {
        if (node.ex || node.ey) ctx.translate(node.ex, node.ey);
        node.body.draw(ctx);
      }
    }
    ctx.restore();
    env.scopes = savedScopes;
  }
  function drawKids(env, ctx, kids) {
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (!k.hidden && (k.mask === 'CLIP_NEXT' || k.mask === 'CLIP_ALL') && i + 1 < kids.length) {
        const targets = k.mask === 'CLIP_NEXT' ? [kids[i + 1]] : kids.slice(i + 1),
          cv = ctx.canvas;
        ctx.save();
        nodeTransform(ctx, k);
        const box = devBox(ctx, 0, 0, k.bw || k.w, k.bh || k.h, 2, 0);
        {
          let mt = ctx.getTransform();
          if (cv._ox || cv._oy) mt = new DOMMatrix().translate(cv._ox || 0, cv._oy || 0).multiply(mt);
          env.rt.hits.push({ m: k.m, mt, w: k.bw || k.w, h: k.bh || k.h, depth: env.rt.depth });
        }
        ctx.restore();
        if (box) {
          // only the part of the canvas under the mask can show anything
          const off = subLayer(env, ctx, box),
            o = off.getContext('2d'),
            al = ctx.globalAlpha;
          o.globalAlpha = 1;
          drawKids(env, o, targets);
          o.globalCompositeOperation = 'destination-in';
          o.globalAlpha = 1;
          env.rt.maskMode = true;
          try {
            drawNode(env, o, k, true);
          } finally {
            env.rt.maskMode = false;
          }
          o.globalCompositeOperation = 'source-over';
          blit(env, ctx, off, box, true);
        }
        i += targets.length;
        continue;
      }
      drawNode(env, ctx, k);
    }
  }

  // ---------------- public ----------------
  function newRuntime() {
    const pool = [];
    return {
      globals: new Map(),
      sw: new Map(),
      hits: [],
      time: 0,
      depth: 0,
      animating: false,
      base: new DOMMatrix(),
      // scratch canvases are reused; one that is big enough is taken as it is and only its top-left w x h is used
      layer(w, h) {
        let best = -1;
        for (let i = 0; i < pool.length; i++) {
          const p = pool[i];
          if (p.width >= w && p.height >= h && (best < 0 || p.width * p.height < pool[best].width * pool[best].height))
            best = i;
        }
        let c;
        if (best >= 0) c = pool.splice(best, 1)[0];
        else {
          c = pool.length > 12 ? pool.shift() : document.createElement('canvas');
          c.width = Math.ceil(w / 128) * 128;
          c.height = Math.ceil(h / 128) * 128;
        }
        const o = c.getContext('2d');
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.globalAlpha = 1;
        o.globalCompositeOperation = 'source-over';
        o.filter = 'none';
        o.shadowColor = 'transparent';
        o.setLineDash([]);
        o.clearRect(0, 0, c.width, c.height);
        c._w = w;
        c._h = h;
        c._ox = 0;
        c._oy = 0;
        return c;
      },
      release(c) {
        pool.push(c);
      },
      _scratch: null,
      scratch(w, h) {
        if (!this._scratch) this._scratch = document.createElement('canvas');
        const c = this._scratch;
        c.width = w;
        c.height = h;
        return c;
      }
    };
  }
  // view: { pxW, pxH, screens, scroll, locked, play, now }
  function render(canvas, state, view, rt) {
    const ctx = canvas.getContext('2d');
    const root = state.preset.preset_root;
    const short = Math.min(canvas.width, canvas.height);
    const f = short / 720;
    view.kw = canvas.width / f;
    view.kh = canvas.height / f;
    view.xscreens = (state.preset.preset_info || {}).xscreens;
    const env = makeEnv(state, view, rt);
    const rs = P(env, root, 'config_scale_value', 100) / 100; // root scale
    view.kw /= rs;
    view.kh /= rs;
    env.fctx.screen.w = view.kw;
    env.fctx.screen.h = view.kh;
    env.fctx.screen.land = view.kw > view.kh;
    env.scopes.push({ list: root.globals_list || {}, mod: root });
    rt.hits = [];
    rt.depth = 0;
    rt.animating = false;
    rt.main = canvas;
    NID = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(f * rs, 0, 0, f * rs, 0, 0);
    rt.base = ctx.getTransform();
    let tree;
    try {
      tree = build(env, ctx, root, false);
      tree.x = 0;
      tree.y = 0;
      drawNode(env, ctx, tree);
    } catch (e) {
      console.error(e);
      rt.error = e;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.filter = 'none';
    ctx.shadowColor = 'transparent';
    ctx.drawImage(bgLayer(env), 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    rt.env = env;
    rt.formulaErrors = env.errors;
    return rt;
  }
  // Evaluate any formula in the context of the last render (used by the formula editor).
  function evalIn(state, view, rt, mod, tpl, pathScopes) {
    const env = makeEnv(state, view, rt);
    env.scopes.push({ list: state.preset.preset_root.globals_list || {}, mod: state.preset.preset_root });
    (pathScopes || []).forEach(k => env.scopes.push({ list: k.globals_list || {}, mod: k }));
    return F.evaluate(tpl, env.fctx);
  }
  function resolve(state, view, rt, mod, key, dflt, pathScopes) {
    const env = makeEnv(state, view, rt);
    env.scopes.push({ list: state.preset.preset_root.globals_list || {}, mod: state.preset.preset_root });
    (pathScopes || []).forEach(k => env.scopes.push({ list: k.globals_list || {}, mod: k }));
    return P(env, mod, key, dflt);
  }
  G.KRender = { render, newRuntime, evalIn, resolve, LAYERS, css, TUNE };
})(window);
