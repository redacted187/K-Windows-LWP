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
      live: !!state.live,
      palette: state.assets.palette,
      webGet: state.live ? state.assets.webGet : undefined,
      now: view.now || new Date(),
      h24: !!(state.sim.settings && state.sim.settings.clock24h),
      time: rt.time || 0,
      screen: {
        w: view.kw,
        h: view.kh,
        pw: view.pxW,
        ph: view.pxH,
        screen: Math.round(view.scroll) + 1,
        screeny: Math.round(view.yscroll || 0) + 1,
        screensy: view.yscreens || 1,
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
  const KD = G.KDefaults;
  // left to each caller: the anchor depends on where the item sits, and a bitmap texture's width is handled locally
  const NO_KD = new Set(['position_anchor', 'fx_gradient_bitmap_width']);
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
    if (v === undefined || v === null || v === '') {
      // a setting KLWP left out of the file has KLWP's own default value
      const kd = m.internal_type && KD ? KD.get(m.internal_type, k) : undefined;
      if (kd === undefined || NO_KD.has(k)) return d;
      return typeof d === 'number' && typeof kd !== 'number' ? parseFloat(kd) : kd;
    }
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
  // ---- KLWP's own animation logic (org.kustom.lib.render.AnimationModule and the Animation* option enums) ----
  // Screens are indexed from 0; "last" is the highest index. The centre screen is ceil(last / 2).
  function centerScreen(center, screens) {
    const last = Math.max(0, screens - 1),
      mid = Math.ceil(last / 2);
    if (center === 'FIRST') return 0;
    if (center === 'LAST') return last;
    let m = /^SCREEN(\d+)$/.exec(center);
    if (m) return parseInt(m[1], 10) - 1;
    m = /^CENTER_([MP])(\d)$/.exec(center);
    if (m) return m[1] === 'M' ? Math.max(0, mid - parseInt(m[2], 10)) : Math.min(last, mid + parseInt(m[2], 10));
    return mid;
  }
  // eased value (0..100) of a timed animation at progress f (0..100) running in direction dir (1 forward, -1 back, 0 idle)
  function easeApply(name, f, dir) {
    const normal = x => (x === 0 ? 0 : accDec(x * 0.01) * 100),
      tri = x => (x <= 50 ? x * 2 : (100 - x) * 2),
      there = fn => (f === 0 ? 0 : dir === 1 ? fn(f * 0.01) * 100 : 100 - fn(1 - f * 0.01) * 100);
    switch (name) {
      case 'INVERTED':
        return Math.max(0, Math.min(100, 100 - normal(f)));
      case 'BOUNCE':
        return there(EASE.BOUNCE);
      case 'OVERSHOOT':
        return there(EASE.OVERSHOOT);
      case 'STRAIGHT':
      case 'LINEAR':
        return f;
      case 'NORMAL_2W':
        return normal(tri(f));
      case 'STRAIGHT_2W':
        return tri(f);
      // KLWP hands these interpolators the raw 0..100 progress rather than 0..1, so they shoot far past 100
      case 'ACCELERATE':
        return f * f;
      case 'DECELERATE':
        return 1 - (1 - f) * (1 - f);
      case 'ANTICIPATE':
        return EASE.ANTICIPATE(f);
      case 'ANTICIPATE_OVERSHOOT':
        return EASE.ANTICIPATE_OVERSHOOT(f);
      default:
        return normal(f);
    }
  }
  // A triggered animation (switch, formula, unlock): runs towards target (0 or 100) over delay + duration, and a
  // change of mind half-way turns it round from where it is. Times in milliseconds.
  function timedProgress(env, id, target, durMs, delayMs) {
    const rt = env.rt,
      now = (rt.time || 0) * 1000,
      total = Math.max(1, delayMs + durMs);
    let st = rt.sw.get(id);
    if (!st) {
      st = { dir: 0, t0: 0, f: target };
      rt.sw.set(id, st);
    }
    const dir = st.f > target ? -1 : 1;
    if (st.dir !== dir && st.f !== target) {
      st.t0 = st.dir === 0 ? now : now - (total - (now - st.t0));
      st.dir = dir;
    }
    if (st.dir !== 0) {
      let f = Math.max(0, Math.min(100, ((now - (st.t0 + delayMs)) * 100) / Math.max(1, durMs)));
      if (st.dir === -1) f = 100 - f;
      st.f = f;
      const d = st.dir;
      if (now - st.t0 > total) st.dir = 0;
      else rt.animating = true;
      return { f, dir: d };
    }
    return { f: st.f, dir: 0 };
  }
  function animTransform(env, m, node) {
    // ops are rotate / scale / skew steps, each about its own pivot, applied in list order after the translation
    const tr = { dx: 0, dy: 0, alpha: 1, ops: [] };
    const list = m.internal_animations;
    if (!list || !list.length) return tr;
    const v = env.view;
    // the editor's "Play" on one animation: rt.preview = { m, idx, t0 } runs it forward, holds, then back
    const pv = env.rt.preview && env.rt.preview.m === m ? env.rt.preview : null;
    list.forEach((a, idx) => {
      const type = P(env, a, 'type', 'SCROLL');
      if (type === 'DISABLED') return;
      let preview = null;
      if (pv && pv.idx === idx) {
        const now = performance.now() - pv.t0,
          leg = Math.max(400, P(env, a, 'duration', 10) * 100),
          hold = 500,
          scrollType = type === 'SCROLL' || type === 'SCROLL_Y',
          total = scrollType ? 2400 : leg * 2 + hold + P(env, a, 'delay', 0) * 100;
        if (now < total) {
          env.rt.animating = true;
          if (scrollType) {
            const k = now / total;
            preview = { phase: k < 0.5 ? k * 2 : 2 - k * 2 };
          } else {
            const t = now - P(env, a, 'delay', 0) * 100;
            if (t < 0) preview = { f: 0, dir: 1 };
            else if (t < leg) preview = { f: (t / leg) * 100, dir: 1 };
            else if (t < leg + hold) preview = { f: 100, dir: 1 };
            else preview = { f: Math.max(0, 100 - ((t - leg - hold) / leg) * 100), dir: -1 };
          }
        } else env.rt.preview = null;
      }
      const action = P(env, a, 'action', 'SCROLL'),
        speed = P(env, a, 'speed', 100),
        amount = P(env, a, 'amount', 100),
        angle = P(env, a, 'angle', 0) * D2R,
        limit = P(env, a, 'limit', 0),
        easeN = P(env, a, 'ease', 'NORMAL'),
        durMs = P(env, a, 'duration', 10) * 100,
        delayMs = P(env, a, 'delay', 0) * 100;
      const anchor = P(env, a, 'anchor', 'MODULE_CENTER');
      // where rotate / scale / skew pivot: a point of the item, or a point of the screen
      const pivot = () => {
        const scr = /^SCREEN_/.test(anchor),
          fx = /LEFT/.test(anchor) ? 0 : /RIGHT/.test(anchor) ? 1 : 0.5,
          fy = /TOP/.test(anchor) ? 0 : /BOTTOM/.test(anchor) ? 1 : 0.5;
        return scr ? { sx: v.kw * fx, sy: v.kh * fy } : { fx, fy };
      };
      const push = o => tr.ops.push(Object.assign(o, pivot()));
      const scale = val => {
        // val runs from 100 (untouched) down to 100 - amount
        if (action === 'SCALE') push({ t: 'scale', x: val / 100, y: val / 100 });
        else if (action === 'SCALE_X') push({ t: 'scale', x: val / 100, y: 1 });
        else if (action === 'SCALE_Y') push({ t: 'scale', x: 1, y: val / 100 });
        else if (action === 'SCALE_INVERTED') push({ t: 'scale', x: 15 - (val * 14) / 100, y: 15 - (val * 14) / 100 });
      };
      const clampLimit = d => (limit > 0 ? Math.max(-limit, Math.min(limit, d)) : d);
      const isScale = /^SCALE/.test(action),
        isSkew = /^SKEW_/.test(action),
        isRot = action === 'ROTATE' || action === 'ROTATE_INVERTED',
        isFade = action === 'FADE' || action === 'FADE_INVERTED',
        isScroll = action === 'SCROLL' || action === 'SCROLL_INVERTED';

      if (type === 'SCROLL' || type === 'SCROLL_Y') {
        // horizontal pages (screens / scroll) or vertical ones (yscreens / yscroll)
        const vertical = type === 'SCROLL_Y',
          n = vertical ? v.yscreens || 1 : v.screens,
          pos = vertical ? v.yscroll || 0 : v.scroll,
          last = Math.max(0, n - 1) || (preview ? 2 : 0),
          step = last > 0 ? 1 / last : 0,
          off = preview ? preview.phase : last > 0 ? Math.max(0, Math.min(1, pos / last)) : 0.5,
          rule = P(env, a, 'rule', 'CENTER'),
          c = centerScreen(P(env, a, 'center', 'CENTER'), n);
        const upTo = rule === 'UP_TO_CENTER' || rule === 'BEFORE_CENTER',
          from = rule === 'FROM_CENTER' || rule === 'AFTER_CENTER';
        const raw = screen => off - screen * step;
        const shifted = c + (rule === 'BEFORE_CENTER' ? -1 : rule === 'AFTER_CENTER' ? 1 : 0);
        // 100 on the animation's own screen, falling to 0 one screen away at 100% speed; one-sided rules stay at 100
        // on their quiet side
        const amountAt = unsigned => {
          const d = raw(shifted);
          if (upTo && d <= 0) return 100;
          if (from && d >= 0) return 100;
          const w = step * (100 / speed);
          if (!(w > 0)) return 0;
          const res = 100 - Math.min(100, (100 / w) * Math.min(w, Math.abs(d)));
          return !unsigned && d < 0 ? -res : res;
        };
        if (isScroll) {
          const d0 = raw(c),
            active = rule === 'CENTER' || (upTo && d0 <= 0) || (from && d0 >= 0);
          if (!active || last === 0) return;
          const W = vertical ? v.kh : v.kw;
          let t = action === 'SCROLL' ? -off * W : (off - 1) * W;
          if (action === 'SCROLL') t += (W / last) * c;
          else if (c <= last) t += (W / last) * (last - c);
          t = clampLimit((t * speed) / 100);
          if (vertical) {
            tr.dx += angle ? Math.sin(angle) * t : 0;
            tr.dy += angle ? Math.cos(angle) * t : t;
          } else {
            tr.dx += angle ? Math.cos(angle) * t : t;
            tr.dy += angle ? Math.sin(angle) * t : 0;
          }
        } else if (isScale) scale(Math.max(100 - amount, amountAt(true)));
        else if (isSkew) {
          let k = (100 - Math.max(100 - amount, Math.abs(amountAt(false)))) * 0.02;
          if (raw(shifted) < 0) k = -k;
          push({ t: 'skew', x: action === 'SKEW_X' ? k : 0, y: action === 'SKEW_Y' ? k : 0 });
        } else if (isRot) {
          let r = amountAt(false);
          r = r >= 0 ? Math.max(100 - amount, r) : Math.min(amount - 100, r);
          push({ t: 'rot', deg: (action === 'ROTATE_INVERTED' ? -1 : 1) * r * 3.6 });
        } else if (isFade) {
          let val = Math.max(100 - amount, amountAt(true));
          if (action === 'FADE_INVERTED') val = 100 - val;
          tr.alpha *= val / 100;
        } else if (action === 'ADVANCED') advanced(a, 100 - Math.abs(amountAt(false)));
        return;
      }

      // everything else is driven by an eased 0..100 value
      let p;
      if (preview) p = easeApply(easeN, preview.f, preview.dir);
      else if (type === 'LOOP_FW' || type === 'LOOP_2W') {
        const total = Math.max(1, delayMs + durMs),
          now = (env.rt.time || 0) * 1000,
          leg = Math.floor(now / total);
        let f = Math.max(0, Math.min(100, ((now - leg * total - delayMs) * 100) / Math.max(1, durMs)));
        const dir = type === 'LOOP_2W' && leg % 2 === 1 ? -1 : 1;
        if (dir === -1) f = 100 - f;
        p = easeApply(easeN, f, dir);
        if (v.play) env.rt.animating = true;
      } else if (type === 'SWITCH' || type === 'FORMULA' || type === 'UNLOCK' || type === 'VISIBILITY') {
        let on;
        if (type === 'SWITCH') {
          const g = gv(env, P(env, a, 'trigger', ''));
          on = F.num(g || 0) !== 0 || String(g) === 'true';
        } else if (type === 'FORMULA') on = F.num(evalF(env, a.formula || '')) !== 0;
        else if (type === 'UNLOCK') on = !!v.locked;
        else on = false;
        const st = timedProgress(env, node.id + ':' + idx, on ? 100 : 0, durMs, delayMs);
        p = easeApply(easeN, st.f, st.dir);
      } else if (type === 'VISUALIZER') {
        p = v.play ? 50 + 50 * Math.sin((env.rt.time || 0) * 9 + idx * 1.7 + (node.id % 7)) : 50;
        if (v.play) env.rt.animating = true;
      } else return; // gyro is not simulated

      const part = (p / 100) * amount;
      if (isScroll) {
        let d = clampLimit((((Math.min(v.kw, v.kh) / 100) * speed) / 100) * p);
        if (action === 'SCROLL_INVERTED') d = -d;
        tr.dx += angle ? Math.cos(angle) * d : d;
        tr.dy += angle ? Math.sin(angle) * d : 0;
      } else if (isScale) scale(100 - part);
      else if (isSkew) {
        const k = (100 - part) * 0.02;
        push({ t: 'skew', x: action === 'SKEW_X' ? k : 0, y: action === 'SKEW_Y' ? k : 0 });
      } else if (isRot) push({ t: 'rot', deg: (action === 'ROTATE_INVERTED' ? -1 : 1) * part * 3.6 });
      else if (isFade) tr.alpha *= (action === 'FADE' ? 100 - part : part) / 100;
      else if (action === 'ADVANCED') advanced(a, part);

      function advanced(anim, pos) {
        const by = {};
        (anim.animator || []).forEach(kf => {
          (by[kf.property] = by[kf.property] || []).push(kf);
        });
        Object.keys(by).forEach(prop => {
          const ks = by[prop].slice().sort((x, y) => x.position - y.position);
          // like KLWP: a property whose first key is after 0 starts from its untouched value at 0
          if (ks[0].position > 0)
            ks.unshift({ position: 0, value: /^SCALE_(X|Y|XY)$/.test(prop) ? 1 : 0, ease: 'STRAIGHT' });
          pos = Math.floor(pos);
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
          else if (prop === 'SCALE_XY') tr.ops.push({ t: 'scale', x: val, y: val, fx: 0.5, fy: 0.5 });
          else if (prop === 'SCALE_X') tr.ops.push({ t: 'scale', x: val, y: 1, fx: 0.5, fy: 0.5 });
          else if (prop === 'SCALE_Y') tr.ops.push({ t: 'scale', x: 1, y: val, fx: 0.5, fy: 0.5 });
          else if (prop === 'ROTATE') tr.ops.push({ t: 'rot', deg: val, fx: 0.5, fy: 0.5 });
        });
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
  // Android blends gradient colours with premultiplied alpha (measured: a fade to a transparent colour is linear),
  // while a canvas gradient blends them straight; so the colour change is laid down as many small premultiplied steps
  function premulStops(gr, a, b, col1, col2) {
    const p = F.parseColor(col1) || { r: 255, g: 255, b: 255, a: 255 },
      q = F.parseColor(col2) || { r: 0, g: 0, b: 0, a: 255 };
    gr.addColorStop(0, css(col1));
    if (b <= a) {
      gr.addColorStop(a, css(col1));
      gr.addColorStop(a, css(col2));
    } else
      for (let i = 0; i <= 24; i++) {
        const t = i / 24,
          al = (p.a + (q.a - p.a) * t) / 255,
          mix = c => (p[c] * p.a + (q[c] * q.a - p[c] * p.a) * t) / 255 / (al || 1);
        gr.addColorStop(
          a + (b - a) * t,
          'rgba(' +
            Math.round(mix('r')) +
            ',' +
            Math.round(mix('g')) +
            ',' +
            Math.round(mix('b')) +
            ',' +
            al.toFixed(4) +
            ')'
        );
      }
    gr.addColorStop(1, css(col2));
    return gr;
  }
  function fillStyle(env, ctx, m, w, h, colorKey) {
    const col = P(env, m, colorKey || 'paint_color', '#FFFFFFFF');
    const g = P(env, m, 'fx_gradient', 'NONE');
    if (g === 'NONE') return css(col);
    const col2 = P(env, m, 'fx_gradient_color', '#FF000000'),
      c1 = css(col);
    const gw = Math.max(0.001, P(env, m, 'fx_gradient_width', 100) / 100),
      go = P(env, m, 'fx_gradient_offset', 50) / 100;
    const a = Math.max(0, Math.min(1, go - gw / 2)),
      b = Math.max(0, Math.min(1, go + gw / 2));
    let gr;
    if (g === 'HORIZONTAL') gr = ctx.createLinearGradient(0, 0, w, 0);
    else if (g === 'VERTICAL') gr = ctx.createLinearGradient(0, 0, 0, h);
    else if (g === 'RADIAL' || g === 'SWEEP') {
      // KLWP (view/q.p): centre = item centre + (centre X / Y - 50)% of the item's size. A sweep starts at the
      // bottom (Android's SweepGradient turned 90 degrees). A radial reaches the farthest corner, or for a circle
      // shape the circle's edge (distance to its centre + width / 1.98).
      const cx = (w * P(env, m, 'fx_gradient_offset_x', 50)) / 100,
        cy = (h * P(env, m, 'fx_gradient_offset_y', 50)) / 100;
      if (g === 'SWEEP' && ctx.createConicGradient) {
        return premulStops(ctx.createConicGradient(Math.PI / 2, cx, cy), a, b, col, col2);
      }
      const circle = m.internal_type === 'ShapeModule' && P(env, m, 'shape_type', 'SQUARE') === 'CIRCLE',
        R = circle
          ? Math.hypot(cx - w / 2, cy - w / 2) + w / 1.98
          : Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
      return premulStops(ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R)), a, b, col, col2);
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
    return premulStops(gr, a, b, col, col2);
  }
  const TUNE = { textPad: 1, shadowRoom: 1, bgBlur: 0.34 };
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
  function shadowPass(env, ctx, m, paintColor, draw, w, h, full, sig) {
    if (env.rt.maskMode || P(env, m, 'fx_shadow', 'NONE') !== 'OUTER') return;
    // KLWP (PaintModule): the shadow colour is fx_shadow_color, black when unset
    const sc = Object.assign(
      {},
      F.parseColor(P(env, m, 'fx_shadow_color', '#FF000000')) || { a: 255, r: 0, g: 0, b: 0 }
    );
    // Android's shadow pass repaints the item with its paint's colour swapped for the shadow colour; a fully opaque
    // shadow colour keeps the paint's own alpha. With a gradient or bitmap texture the paint has a shader, so only
    // the shadow colour's alpha counts and the shadow is the texture itself (KLWP leaves that paint's colour opaque).
    const textured = P(env, m, 'fx_gradient', 'NONE') !== 'NONE';
    if (sc.a >= 255) {
      const pc = F.parseColor(paintColor);
      sc.a = textured ? 255 : pc ? pc.a : 255;
    }
    if (sc.a <= 0) return;
    const t = ctx.getTransform(),
      k = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
    const dir = P(env, m, 'fx_shadow_direction', 0),
      dist = P(env, m, 'fx_shadow_distance', 0),
      blur = P(env, m, 'fx_shadow_blur', 5);
    // KLWP (view/q.t): Paint.setShadowLayer(max(1, blur / 4), dist * cos(360 - dir), dist * sin(360 - dir), colour).
    // The blur radius is in device pixels (not Kustom points) and Android turns a radius into a Gaussian
    // sigma of 0.57735 * radius + 0.5. One Kustom point is min(screen width, height) / 720 device pixels.
    const devPerKp = (Math.min(env.view.pxW || 1080, env.view.pxH || 1920) / 720) * (env.view.uiScale || 1),
      sigmaDev = 0.57735 * Math.max(1, blur * 0.25) + 0.5;
    const dx = Math.cos(dir * D2R) * dist * k,
      dy = -Math.sin(dir * D2R) * dist * k,
      sigma = (sigmaDev / devPerKp) * k;
    const reach = Math.ceil(3 * sigma + Math.abs(dx) + Math.abs(dy) + 12 * k);
    let box = devBox(ctx, 0, 0, w, h, reach, reach);
    if (!box) return;
    // a shadow whose shape, size, turn and colours have not changed is the same picture, only moved: keep it
    let keep = null;
    if (sig && textured) {
      // a gradient or texture shows in the shadow: it is drawn in the item's own coordinates, so it moves with the
      // item, and its settings join the key
      const bmp = P(env, m, 'fx_gradient_bitmap', '');
      sig +=
        '|' +
        [
          'fx_gradient',
          'fx_gradient_color',
          'fx_gradient_width',
          'fx_gradient_offset',
          'fx_gradient_offset_x',
          'fx_gradient_offset_y',
          'fx_gradient_bitmap_width',
          'fx_gradient_bitmap_mode',
          'paint_color'
        ]
          .map(k2 => P(env, m, k2, ''))
          .join('|') +
        '|' +
        (bmp.length > 200 ? bmp.length + bmp.slice(-80) : bmp) + // a cover picture can be a long data address
        (bmp ? (env.state.assets.image(bmp) ? '+' : '-') : '');
    }
    if (sig) {
      const ub = devBox(ctx, 0, 0, w, h, reach, 1e9);
      if (ub && ub.w * ub.h <= 8e6) {
        const key =
          sig +
          '|' +
          [t.a, t.b, t.c, t.d].map(v => v.toFixed(4)).join(',') +
          '|' +
          [sigma.toFixed(2), dx.toFixed(1), dy.toFixed(1), sc.r, sc.g, sc.b, sc.a, full ? 1 : 0].join(',');
        const rt = env.rt;
        if (!rt.shadowCache) rt.shadowCache = new Map();
        const hit = rt.shadowCache.get(m);
        if (hit && hit.key === key) {
          hit.used = rt.frame || 0;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(hit.c, Math.round(t.e + hit.rx), Math.round(t.f + hit.ry));
          ctx.restore();
          return;
        }
        if (hit) {
          rt.fxArea -= hit.area;
          hit.c.width = hit.c.height = 0;
        }
        keep = { key, rx: ub.x - t.e, ry: ub.y - t.f, used: rt.frame || 0, area: ub.w * ub.h };
        box = ub;
      }
    }
    const sil = subLayer(env, ctx, box),
      a = sil.getContext('2d'); // the item's silhouette
    a.fillStyle = '#000';
    a.strokeStyle = '#000';
    draw(a);
    let off;
    if (keep) {
      off = document.createElement('canvas');
      off.width = box.w;
      off.height = box.h;
    } else off = env.rt.layer(box.w, box.h);
    const o = off.getContext('2d'); // blurred, tinted, with the inside removed
    // a wide blur is done on a smaller copy and scaled back up: it looks the same and needs a fraction of the
    // memory and time (the browser's blur works on big temporary images)
    const f = sigma > 3 ? Math.min(8, sigma / 2.5) : 1;
    if (f > 1) {
      const sw = Math.max(1, Math.ceil(box.w / f)),
        sh = Math.max(1, Math.ceil(box.h / f)),
        sm = env.rt.layer(sw, sh),
        so = sm.getContext('2d');
      so.imageSmoothingQuality = 'high';
      so.filter = 'blur(' + (sigma / f).toFixed(2) + 'px)';
      so.drawImage(sil, 0, 0, box.w, box.h, 0, 0, box.w / f, box.h / f);
      so.filter = 'none';
      o.imageSmoothingQuality = 'high';
      o.drawImage(sm, 0, 0, box.w / f, box.h / f, dx, dy, box.w, box.h);
      env.rt.release(sm);
    } else {
      o.filter = 'blur(' + sigma.toFixed(2) + 'px)';
      o.drawImage(sil, 0, 0, box.w, box.h, dx, dy, box.w, box.h);
      o.filter = 'none';
    }
    o.globalCompositeOperation = 'source-in';
    if (textured) {
      // the texture, moved with the shadow, seen through the blurred outline
      o.setTransform(new DOMMatrix([1, 0, 0, 1, dx, dy]).multiply(a.getTransform()));
      o.globalAlpha = sc.a / 255;
      o.fillStyle = fillStyle(env, o, m, w, h);
      const r = reach / k;
      o.fillRect(-r, -r, w + 2 * r, h + 2 * r);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalAlpha = 1;
    } else {
      o.fillStyle = 'rgba(' + sc.r + ',' + sc.g + ',' + sc.b + ',' + (sc.a / 255).toFixed(4) + ')';
      o.fillRect(0, 0, box.w, box.h);
    }
    // Android draws the whole blurred copy underneath the item (KLWP's shape view is a plain drawPath with that paint)
    env.rt.release(sil);
    if (keep) {
      keep.c = off;
      env.rt.shadowCache.set(m, keep);
      env.rt.fxArea = (env.rt.fxArea || 0) + keep.area;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(off, Math.round(t.e + keep.rx), Math.round(t.f + keep.ry));
      ctx.restore();
      return;
    }
    blit(env, ctx, off, box, true);
  }
  function paintPath(env, ctx, m, w, h, path, sig) {
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
        stroke || (pc && pc.a === 0 && P(env, m, 'fx_gradient', 'NONE') === 'NONE'),
        sig ? sig + '|' + (stroke ? lw : 'f') : null
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
    // letters the font does not have come from KLWP's default font (Android falls back to Roboto the same way), so
    // an icon font used for text still shows its digits
    const own = env.state.assets.font(P(env, m, 'text_family', '')),
      rob = env.state.assets.font('');
    const fam = (own ? own + ', ' : '') + (rob && rob !== own ? rob + ', ' : '') + 'Roboto, "Segoe UI", sans-serif';
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
  // "Morphing Text", as KLWP draws it (render.view.f): every letter is its own glyph outline at the origin, squashed by
  // the ratio (> 0 flattens, < 0 narrows) and slanted by the skew about its baseline, then either laid along a line
  // by its own advance plus the spacing, or bent onto an arc by the angle. The item's box is the exact ink outline
  // of all letters together (and the starting point 0,0); the letters are drawn shifted so the ink starts at the box.
  const skewInk = new Map();
  function measureCurved(env, ctx, m) {
    const size = P(env, m, 'text_size', 20),
      ratio = P(env, m, 'text_ratio', 0),
      skew = P(env, m, 'text_skew', 0),
      angle = Math.trunc(P(env, m, 'text_angle', 0)),
      justify = P(env, m, 'text_mode', 'AUTO') === 'JUSTIFY',
      textW = P(env, m, 'text_width', 200);
    const txt = textValue(env, m).replace(/\[[^\]]*\]/g, ''),
      chars = [...txt],
      n = chars.length;
    const font = fontOf(env, m, size);
    ctx.font = font;
    // the letter transform H: scale about the origin, then skew x by -skew / 100 per unit of y
    const sx = ratio < 0 ? (ratio + 100) / 100 : 1,
      sy = ratio > 0 ? (100 - ratio) / 100 : 1,
      kx = -skew / 100;
    const H = [sx, 0, kx * sy, sy, 0, 0];
    // advances as Paint.getTextWidths gives them: measured in the context of the whole line (kerning included), with a
    // ligature's whole width given to its first letter and none to the rest (each letter is still drawn on its own)
    const pre = [0];
    for (let i = 0; i < n; i++) pre.push(ctx.measureText(chars.slice(0, i + 1).join('')).width);
    const adv = chars.map((ch, i) => pre[i + 1] - pre[i]);
    for (let i = 0; i < n; i++)
      for (const lig of ['ffi', 'ffl', 'ff', 'fi', 'fl']) {
        if (chars.slice(i, i + lig.length).join('') !== lig) continue;
        const iso = [...lig].reduce((a, c) => a + ctx.measureText(c).width, 0),
          joined = ctx.measureText(lig).width;
        if (iso - joined > size * 0.005) {
          let tot = 0;
          for (let j = i; j < i + lig.length; j++) tot += adv[j];
          adv[i] = tot;
          for (let j = i + 1; j < i + lig.length; j++) adv[j] = 0;
          i += lig.length - 1;
        }
        break;
      }
    // per letter: its ink box after H
    const gl = chars.map((ch, i) => {
      const mt = ctx.measureText(ch);
      const g = { ch, adv: adv[i], ink: null };
      const l = -mt.actualBoundingBoxLeft,
        r = mt.actualBoundingBoxRight,
        t = -mt.actualBoundingBoxAscent,
        b = mt.actualBoundingBoxDescent;
      if (r - l <= 0 || b - t <= 0) return g; // a space has no outline
      if (!kx) g.ink = [l * sx, t * sy, r * sx, b * sy];
      else {
        // a slanted outline is narrower than its slanted box: find its ink by drawing it once (cached)
        const key = font + '|' + ch + '|' + sx + '|' + sy + '|' + kx;
        let ink = skewInk.get(key);
        if (!ink) {
          const q = 4,
            pad = Math.ceil((b - t) * Math.abs(kx) + 4),
            W = Math.ceil((r - l) * sx * q + 2 * pad * q),
            Ht = Math.ceil((b - t) * sy * q + 8);
          const cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.min(4096, W));
          cv.height = Math.max(1, Math.min(4096, Ht));
          const c = cv.getContext('2d');
          const ox = (pad - l * sx) * q,
            oy = (-t * sy + 1) * q;
          c.setTransform(q * sx, 0, q * kx * sy, q * sy, ox, oy);
          c.font = font;
          c.fillText(ch, 0, 0);
          const d = c.getImageData(0, 0, cv.width, cv.height).data;
          let x0 = cv.width,
            x1 = -1;
          for (let y = 0; y < cv.height; y++)
            for (let x = 0; x < cv.width; x++)
              if (d[(y * cv.width + x) * 4 + 3] > 8) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
              }
          ink = x1 < 0 ? null : [(x0 - ox) / q, t * sy, (x1 + 1 - ox) / q, b * sy];
          if (skewInk.size > 4000) skewInk.clear();
          skewInk.set(key, ink);
        }
        g.ink = ink;
      }
      return g;
    });
    // ink box of the whole string as one line (Paint.getTextBounds), used by justify and by the arc
    const all = ctx.measureText(txt),
      hbW = all.actualBoundingBoxLeft + all.actualBoundingBoxRight,
      hbH = all.actualBoundingBoxAscent + all.actualBoundingBoxDescent;
    const s = justify ? (textW - hbW) / Math.max(1, n) : P(env, m, 'text_spacing', 0);
    // placement of each letter (render.view.f.G)
    let before = 0;
    gl.forEach((g, i) => {
      const x = before + i * s;
      before += g.adv;
      if (!angle) {
        g.M = [H[0], H[1], H[2], H[3], x, 0];
        return;
      }
      const a = Math.abs(angle),
        L = justify ? textW : hbW + s * n,
        ang = (a / L) * x - Math.floor(a / 2);
      let r = ((360 / a) * L) / 6.28319;
      if (angle < 0) r = -r - hbH / 2;
      const th = (angle > 0 ? ang - 90 : -ang + 90) * D2R,
        px = Math.abs(r) * Math.cos(th),
        py = r + Math.abs(r) * Math.sin(th),
        rot = (angle > 0 ? ang : -ang) * D2R,
        c = Math.cos(rot),
        sn = Math.sin(rot);
      // translate(px, py) * rotate(rot) * H
      g.M = [c * H[0] - sn * H[1], sn * H[0] + c * H[1], c * H[2] - sn * H[3], sn * H[2] + c * H[3], px, py];
    });
    // bounds of everything drawn (the path's starting move is merged into the first letter's, so it does not count)
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    gl.forEach(g => {
      if (!g.ink) return;
      const M = g.M,
        [l, t, r, b] = g.ink;
      // ink is already in H space; map it with the placement only (M without H)
      const det = H[0] * H[3] - H[1] * H[2] || 1,
        inv = [H[3] / det, -H[1] / det, -H[2] / det, H[0] / det];
      const P2 = [
        M[0] * inv[0] + M[2] * inv[1],
        M[1] * inv[0] + M[3] * inv[1],
        M[0] * inv[2] + M[2] * inv[3],
        M[1] * inv[2] + M[3] * inv[3]
      ];
      [
        [l, t],
        [r, t],
        [l, b],
        [r, b]
      ].forEach(([x, y]) => {
        const X = P2[0] * x + P2[2] * y + M[4],
          Y = P2[1] * x + P2[3] * y + M[5];
        if (X < x0) x0 = X;
        if (X > x1) x1 = X;
        if (Y < y0) y0 = Y;
        if (Y > y1) y1 = Y;
      });
    });
    if (x0 === Infinity) x0 = y0 = x1 = y1 = 0;
    const stroke = P(env, m, 'paint_style', 'FILL') === 'STROKE',
      sw = stroke ? strokeW(env, m) : 0;
    const w = x1 - x0 + sw,
      h = y1 - y0 + sw;
    const glyphs = c => {
      c.font = font;
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      c.lineJoin = 'round';
      if (stroke) c.lineWidth = sw;
      gl.forEach(g => {
        if (!g.ink) return;
        c.save();
        c.translate(sw / 2 - x0, sw / 2 - y0);
        c.transform(g.M[0], g.M[1], g.M[2], g.M[3], g.M[4], g.M[5]);
        stroke ? c.strokeText(g.ch, 0, 0) : c.fillText(g.ch, 0, 0);
        c.restore();
      });
    };
    // a gradient or texture belongs to the item's box, not to each letter's own transform
    const paint = c => {
      const style = stroke ? c.strokeStyle : c.fillStyle;
      if (typeof style === 'string') return glyphs(c);
      const box = devBox(c, 0, 0, w, h, 2, 0);
      if (!box) return;
      const L = subLayer(env, c, box),
        o = L.getContext('2d');
      o.fillStyle = o.strokeStyle = '#000';
      glyphs(o);
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = style;
      o.fillRect(-2, -2, w + 4, h + 4);
      blit(env, c, L, box, true);
    };
    return {
      w: Math.max(0, w),
      h: Math.max(0, h),
      draw(ctx) {
        if (env.rt.maskMode) {
          ctx.fillStyle = '#000';
          ctx.strokeStyle = '#000';
          return glyphs(ctx);
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

  // a PATH shape: SVG path data, stretched to width x height (Auto) or fitted inside it keeping its shape (Center fit)
  function svgShape(d, w, h, mode) {
    d = String(d || '').trim();
    if (!d) return new Path2D();
    if (!/^[Mm]/.test(d)) d = 'M0,0 ' + d;
    const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]);
      x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]);
      y1 = Math.max(y1, nums[i + 1]);
    }
    const bw = x1 - x0 || 1,
      bh = y1 - y0 || 1;
    let kx = w / bw,
      ky = h / bh,
      ox = 0,
      oy = 0;
    if (mode === 'CENTER_FIT') {
      kx = ky = Math.min(kx, ky);
      ox = (w - bw * kx) / 2;
      oy = (h - bh * ky) / 2;
    }
    const out = new Path2D();
    try {
      out.addPath(new Path2D(d), new DOMMatrix([kx, 0, 0, ky, ox - x0 * kx, oy - y0 * ky]));
    } catch (e) {
      /* bad path data draws nothing */
    }
    return out;
  }
  function measureShape(env, ctx, m) {
    const type = P(env, m, 'shape_type', 'SQUARE'),
      w = P(env, m, 'shape_width', 100);
    let h = P(env, m, 'shape_height', 100);
    if (SQUARE[type]) h = w;
    const path =
      type === 'PATH'
        ? svgShape(P(env, m, 'shape_path', ''), w, h, P(env, m, 'shape_path_scale', 'AUTO'))
        : shapePath(
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
        // KLWP's view is the shape plus its stroke and Android clips it to that size: a shape with no width or
        // height (and no stroke to give it some) draws nothing at all, not even the 1 px hairline of a 0 stroke
        const sw = P(env, m, 'paint_style', 'FILL') === 'STROKE' ? Math.max(0, P(env, m, 'paint_stroke', 5)) : 0;
        if (w + sw <= 0 || h + sw <= 0) return;
        paintPath(
          env,
          ctx,
          m,
          w,
          h,
          path,
          [
            type,
            w,
            h,
            P(env, m, 'shape_height', 100),
            P(env, m, 'shape_corners', 0),
            P(env, m, 'shape_angle', 0),
            type === 'PATH' ? P(env, m, 'shape_path', '') + P(env, m, 'shape_path_scale', 'AUTO') : ''
          ].join('|')
        );
      }
    };
  }
  // Image colour filters as KLWP builds them (options/BitmapColorFilter.apply + utils/p, then "dim" as a darken on top).
  // The amount is a 0..100 slider; COLORIZE, SEPIA, BW and INVERT ignore it.
  function bitmapFilter(env, m, pre) {
    const blur = P(env, m, pre + 'blur', 0),
      dim = P(env, m, pre + 'dim', 0),
      flt = P(env, m, pre + 'filter', 'NONE'),
      amt = P(env, m, pre + 'filter_amount', 0) / 100;
    const f = [];
    let tint = null,
      add = 0;
    switch (flt) {
      case 'BW':
        f.push('grayscale(1)');
        break;
      case 'SEPIA': // saturation 0.95, then red/green/blue scaled by 1 / 0.95 / 0.82
        f.push('saturate(0.95)');
        tint = { r: 255, g: 242, b: 209, a: 255 };
        break;
      case 'DESATURATE':
        f.push('saturate(' + Math.max(0, 1 - amt).toFixed(3) + ')');
        break;
      case 'INVERT':
        f.push('invert(1)');
        break;
      case 'COLORIZE': // grey, then multiplied by the colour (its alpha included)
        f.push('grayscale(1)');
        tint = F.parseColor(P(env, m, pre + 'filter_color', '#FFFF0000')) || { r: 255, g: 0, b: 0, a: 255 };
        break;
      case 'HUE': // a rotation of pi * amount radians
        f.push('hue-rotate(' + (amt * 180).toFixed(2) + 'deg)');
        break;
      case 'CONTRAST':
        f.push('contrast(' + (1 + amt).toFixed(3) + ')');
        break;
      case 'BRIGHTEN': // adds amount * 255 to every channel
        add = amt;
        break;
      case 'DARKEN':
        f.push('brightness(' + Math.max(0, 1 - amt).toFixed(3) + ')');
        break;
    }
    const blurCss = blur > 0 ? 'blur(' + (blur / 6).toFixed(2) + 'px)' : '';
    return {
      blurCss,
      colorCss: f.join(' '),
      css: [blurCss].concat(f).join(' ').trim() || 'none',
      tint,
      add,
      dim: Math.max(0, Math.min(1, dim / 100))
    };
  }
  // the parts of a filter a CSS filter cannot do (a colour multiply, an addition, the darken that follows), applied to
  // what is already drawn on c; "cut" redraws the outline that the result must keep
  function filterExtras(c, fx, wd, ht, cut) {
    if (!fx.tint && !fx.add && !fx.dim) return;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.filter = 'none';
    if (fx.tint) {
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgb(' + fx.tint.r + ',' + fx.tint.g + ',' + fx.tint.b + ')';
      c.fillRect(0, 0, wd, ht);
    }
    if (fx.add) {
      const v = Math.round(fx.add * 255);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      c.fillRect(0, 0, wd, ht);
    }
    if (fx.dim) {
      const v = Math.round((1 - fx.dim) * 255);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      c.fillRect(0, 0, wd, ht);
    }
    c.restore();
    c.save();
    c.globalCompositeOperation = 'destination-in';
    cut(c);
    c.restore();
  }
  // A filtered picture (blur, colour filters, tint) only changes when the picture or its filter does, so it is made
  // once into a canvas of its own and that canvas is moved, turned and scaled every frame. Remaking it every frame
  // kept the processor busy and made the graphics process allocate and free large images many times a second.
  function fxCopy(env, img, key, cw, ch, paint) {
    const rt = env.rt;
    if (!rt.fxCache) rt.fxCache = new Map();
    let per = rt.fxCache.get(img);
    if (!per) rt.fxCache.set(img, (per = new Map()));
    const id = key + '|' + cw + 'x' + ch;
    let e = per.get(id);
    const ver = img._ver || 0;
    if (!e) {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      e = { c, ver: -1, used: 0, area: cw * ch };
      per.set(id, e);
      rt.fxArea = (rt.fxArea || 0) + e.area;
    }
    e.used = rt.frame || 0;
    if (e.ver !== ver) {
      // first use, or an animated picture moved to its next frame: paint into the same canvas again
      const o = e.c.getContext('2d');
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = 'source-over';
      o.globalAlpha = 1;
      o.filter = 'none';
      o.clearRect(0, 0, cw, ch);
      paint(o);
      o.filter = 'none';
      e.ver = ver;
    }
    return e.c;
  }
  // sizes are rounded up in steps of about 1/8, so a picture that is slowly scaled reuses its copy
  const fxStep = v => {
    v = Math.max(1, Math.ceil(v));
    const st = Math.max(8, Math.pow(2, Math.floor(Math.log2(v)) - 3));
    return Math.ceil(v / st) * st;
  };
  function drawImageFx(env, ctx, img, x, y, w, h, fx, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha * (fx.tint ? fx.tint.a / 255 : 1);
    const t = ctx.getTransform(),
      k = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1,
      natW = img.naturalWidth || img.width || 1,
      natH = img.naturalHeight || img.height || 1;
    // never finer than the picture's own pixels or 4096
    const dw = Math.max(1, w * k),
      dh = Math.max(1, h * k),
      res = Math.min(1, natW / dw, natH / dh, 4096 / dw, 4096 / dh);
    if (fx.tint || fx.add) {
      const cw = Math.min(4096, fxStep(dw * res)),
        ch = Math.min(4096, fxStep(dh * res)),
        blurOf = c =>
          fx.blurCss ? c.replace(/blur\(([\d.]+)px\)/, (m0, n) => 'blur(' + ((+n * cw) / dw).toFixed(2) + 'px)') : c;
      const off = fxCopy(
        env,
        img,
        'T' + fx.css + '|' + JSON.stringify(fx.tint || 0) + '|' + fx.add + '|' + fx.dim,
        cw,
        ch,
        o => {
          o.filter = blurOf(fx.css || 'none');
          o.drawImage(img, 0, 0, cw, ch);
          o.filter = 'none';
          filterExtras(o, fx, cw, ch, c => {
            c.filter = blurOf(fx.blurCss || 'none');
            c.drawImage(img, 0, 0, cw, ch);
            c.filter = 'none';
          });
        }
      );
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, x, y, w, h);
    } else {
      const css = [fx.css === 'none' ? '' : fx.css, fx.dim ? 'brightness(' + (1 - fx.dim).toFixed(3) + ')' : '']
        .join(' ')
        .trim();
      if (!css) ctx.drawImage(img, x, y, w, h);
      else {
        // the blur is in screen pixels; a wide blur is made on a smaller copy, which looks the same
        const bm = /blur\(([\d.]+)px\)/.exec(css),
          blurPx = bm ? +bm[1] : 0,
          rest = css.replace(/blur\([^)]*\)/, '').trim(),
          f = blurPx * res > 3 ? Math.min(8, (blurPx * res) / 2.5) : 1,
          cw = Math.min(4096, fxStep((dw * res) / f)),
          ch = Math.min(4096, fxStep((dh * res) / f)),
          sc = cw / dw, // copy pixels per screen pixel
          bl = blurPx * sc,
          pp = Math.ceil(3 * bl);
        const off = fxCopy(env, img, 'F' + css, cw + 2 * pp, ch + 2 * pp, o => {
          o.imageSmoothingQuality = 'high';
          o.filter = ((bl ? 'blur(' + bl.toFixed(2) + 'px) ' : '') + rest).trim() || 'none';
          o.drawImage(img, pp, pp, cw, ch);
        });
        const sx = w / cw,
          sy = h / ch;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(off, x - pp * sx, y - pp * sy, w + 2 * pp * sx, h + 2 * pp * sy);
      }
    }
    ctx.restore();
  }
  // KLWP draws nothing for an image or icon it cannot find, so neither does the preview
  function placeholder() {}
  function placeholderBox(ctx, w, h, label) {
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
  // the middle part of a picture, as its own canvas (Center crop)
  function cropped(img, sx, sy, sw, sh) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw));
    c.height = Math.max(1, Math.round(sh));
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  function measureBitmap(env, ctx, m) {
    const movie = m.internal_type === 'MovieModule';
    const uri = P(env, m, movie ? 'bitmap_movie_uri' : 'bitmap_bitmap', '');
    // an Animated Image (MovieModule) plays its GIF in a loop unless its mode is "Paused"
    const playing = movie && P(env, m, 'bitmap_movie_mode', 'LOOP') !== 'STOP';
    let img = env.state.assets.image(uri, playing ? (env.rt.time || 0) * 1000 : undefined);
    // a playing GIF only needs a redraw when its frame changes
    if (playing && env.state.assets.animated && env.state.assets.animated(uri))
      env.rt.wakeIn = Math.min(env.rt.wakeIn || Infinity, env.state.assets.nextFrameIn(uri, (env.rt.time || 0) * 1000));
    // Size (bitmap_scale_mode): Fit width keeps the width and follows the picture's shape, Fit height the other way
    // round, Fit center fits it inside a width x height box, Center crop fills that box and cuts off the rest
    const mode = movie ? 'FIT_WIDTH' : P(env, m, 'bitmap_scale_mode', 'FIT_WIDTH'),
      ar = img ? img.height / img.width : 1;
    let w = P(env, m, 'bitmap_width', 100),
      h = w * ar,
      sx = 0,
      sy = 0,
      sw = img ? img.width : 1,
      sh = img ? img.height : 1,
      dx = 0,
      dy = 0,
      dw = w,
      dh = h;
    if (mode === 'FIT_HEIGHT') {
      h = P(env, m, 'bitmap_height', 100);
      w = h / ar;
      dw = w;
      dh = h;
    } else if (mode === 'CENTER_FIT' || mode === 'CENTER_CROP') {
      h = P(env, m, 'bitmap_height', 100);
      const k = mode === 'CENTER_FIT' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
      if (mode === 'CENTER_FIT') {
        dw = sw * k;
        dh = sh * k;
        dx = (w - dw) / 2;
        dy = (h - dh) / 2;
      } else {
        dw = w;
        dh = h;
        sw = w / k;
        sh = h / k;
        sx = ((img ? img.width : 1) - sw) / 2;
        sy = ((img ? img.height : 1) - sh) / 2;
      }
    }
    const crop = mode === 'CENTER_CROP' && img;
    return {
      w,
      h,
      draw(ctx) {
        if (!img || w <= 0 || h <= 0) return;
        const pic = crop ? cropped(img, sx, sy, sw, sh) : img;
        shadowPass(env, ctx, m, '#FF000000', c => c.drawImage(pic, dx, dy, dw, dh), w, h);
        drawImageFx(
          env,
          ctx,
          pic,
          dx,
          dy,
          dw,
          dh,
          bitmapFilter(env, m, 'bitmap_'),
          P(env, m, 'bitmap_alpha', 100) / 100
        );
      }
    };
  }
  function measureIcon(env, ctx, m) {
    const size = P(env, m, 'icon_size', 80),
      setUri = String(P(env, m, 'icon_set', '') || '').trim(),
      name = String(P(env, m, 'icon_icon', '')).trim(); // KLWP trims the name
    if (/^iconify:\/\//.test(setUri) || name.indexOf('#') > 0) return measureSvgIcon(env, m, size, setUri, name);
    const set = env.state.assets.iconSet(setUri);
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
  // an SVG icon (Iconify): the picture is used as a mask and painted with the item's colour, texture and shadow
  function measureSvgIcon(env, m, size, setUri, name) {
    const img = env.state.assets.svgIcon ? env.state.assets.svgIcon(setUri, name) : null;
    return {
      w: size,
      h: size,
      draw(ctx) {
        if (!img) return;
        const k = Math.sqrt(Math.abs(ctx.getTransform().a * ctx.getTransform().d)) || 1,
          px = Math.max(1, Math.ceil(size * k));
        const mask = document.createElement('canvas');
        mask.width = mask.height = px;
        mask.getContext('2d').drawImage(img, 0, 0, px, px);
        if (env.rt.maskMode) {
          ctx.drawImage(mask, 0, 0, size, size);
          return;
        }
        const paint = (c, style) => {
          const t = document.createElement('canvas');
          t.width = t.height = px;
          const o = t.getContext('2d');
          o.drawImage(mask, 0, 0);
          o.globalCompositeOperation = 'source-in';
          o.setTransform(px / size, 0, 0, px / size, 0, 0);
          o.fillStyle = style;
          o.fillRect(0, 0, size, size);
          c.drawImage(t, 0, 0, size, size);
        };
        const col = P(env, m, 'paint_color', '#FFFFFFFF');
        shadowPass(env, ctx, m, col, c => paint(c, c.fillStyle), size, size, true);
        const fs = fillStyle(env, ctx, m, size, size);
        blend(env, ctx, m, size, size, (c, solid) => paint(c, solid ? '#000' : fs));
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
    // KLWP only applies X/Y offsets to items directly on the root; inside groups items are placed by anchor and padding
    node.ox = parentIsRoot ? P(env, m, 'position_offset_x', 0) : 0;
    node.oy = parentIsRoot ? P(env, m, 'position_offset_y', 0) : 0;
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
      // a group's Opacity (config_alpha) fades the group as one picture, so overlapping children do not show through each other
      node.layerAlpha = t === 'RootLayerModule' ? 1 : Math.max(0, Math.min(1, P(env, m, 'config_alpha', 100) / 100));
      if (node.layerAlpha < 1) node.ownLayer = true;
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
      // KLWP (view/q.t + getPadding*): an item with a shadow is padded on the side the shadow falls by
      // distance * (1 + 0.015 * blur); stroked shapes also reserve their line width
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
          const g = 1 + 0.015 * P(env, m, 'fx_shadow_blur', 5),
            padL = Math.max(0, -dx) * g,
            padR = Math.max(0, dx) * g,
            padT = Math.max(0, -dy) * g,
            padB = Math.max(0, dy) * g;
          node.w += padL + padR;
          node.h += padT + padB;
          node.ex += padL;
          node.ey += padT;
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
    // KLWP builds one matrix per item: every rotate / scale / skew is applied about its own pivot, in order
    for (let i = 0; i < tr.ops.length; i++) {
      const o = tr.ops[i],
        px = o.sx !== undefined ? o.sx - node.x : node.w * o.fx,
        py = o.sy !== undefined ? o.sy - node.y : node.h * o.fy;
      ctx.translate(px, py);
      if (o.t === 'rot') ctx.rotate(o.deg * D2R);
      else if (o.t === 'scale') ctx.scale(o.x, o.y);
      else ctx.transform(1, o.y, o.x, 1, 0, 0);
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
        ctx.globalAlpha *= node.layerAlpha === undefined ? 1 : node.layerAlpha;
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
            const fx = bitmapFilter(env, node.m, 'fx_bitmap_');
            const sig = mk === 'BLURRED' ? P(env, node.m, 'fx_bitmap_blur', 0) * TUNE.bgBlur * k : 0,
              bg = bgLayer(env);
            o.filter = fx.colorCss || 'none';
            if (fx.tint) o.globalAlpha = fx.tint.a / 255;
            if (sig > 0.3) {
              const bl = blurBg(env, sig);
              o.drawImage(bl.c, bl.pad, bl.pad, bl.w, bl.h, -off._ox, -off._oy, bg.width, bg.height);
            } else o.drawImage(bg, -off._ox, -off._oy);
            o.filter = 'none';
            o.globalAlpha = 1;
            // colour multiply / brighten / dim, then cut back to the item's outline
            filterExtras(o, fx, off.width, off.height, c => {
              c.setTransform(mt);
              node.body.draw(c);
            });
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
          c = pool.length > 6 ? pool.shift() : document.createElement('canvas');
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
      // after a frame: keep a few scratch canvases for the next one and give the rest of the memory back
      // only frees memory when the kept canvases add up to more than `budget` pixels, so the same few canvases are
      // reused frame after frame instead of being made and thrown away every time
      trim(budget) {
        // filtered picture copies not drawn for a while (or too many of them) are let go
        if (this.fxCache) {
          const now = this.frame || 0,
            all = [];
          this.fxCache.forEach((per, img) => {
            per.forEach((e, id) => {
              if (now - e.used > 90) {
                per.delete(id);
                this.fxArea -= e.area;
                e.c.width = e.c.height = 0;
              } else all.push([per, id, e]);
            });
            if (!per.size) this.fxCache.delete(img);
          });
          if (this.fxArea > budget * 4) {
            all.sort((a, b) => a[2].used - b[2].used);
            for (const [per, id, e] of all) {
              if (this.fxArea <= budget * 4 || e.used === now) break;
              per.delete(id);
              this.fxArea -= e.area;
              e.c.width = e.c.height = 0;
            }
          }
        }
        if (this.shadowCache) {
          const now = this.frame || 0;
          this.shadowCache.forEach((e, m) => {
            if (now - e.used > 90) {
              this.shadowCache.delete(m);
              this.fxArea -= e.area;
              e.c.width = e.c.height = 0;
            }
          });
        }
        let area = pool.reduce((t, c) => t + c.width * c.height, 0);
        if (area <= budget) return;
        pool.sort((a, b) => a.width * a.height - b.width * b.height);
        while (pool.length && area > budget) {
          const c = pool.pop();
          area -= c.width * c.height;
          c.width = c.height = 0;
        }
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
    rt.frame = (rt.frame || 0) + 1;
    const ctx = canvas.getContext('2d');
    const root = state.preset.preset_root;
    const short = Math.min(canvas.width, canvas.height);
    // uiScale: the editor's per-theme desktop scale (1 everywhere else, which is exactly KLWP)
    const f = (short / 720) * (view.uiScale || 1);
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
    rt.wakeIn = Infinity;
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
