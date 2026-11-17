// Kustom formula engine: parser + evaluator + function library with simulated device data.
(function (G) {
  'use strict';
  const OPS = '(),+-*/^%=!<>&|~';
  const astCache = new Map();

  // ---------- template: "text $expr$ text" ----------
  function splitTemplate(s) {
    const parts = [];
    let i = 0,
      buf = '',
      inExpr = false,
      q = false;
    for (; i < s.length; i++) {
      const c = s[i];
      if (inExpr && c === '"') {
        q = !q;
        buf += c;
        continue;
      }
      if (c === '$' && !q) {
        parts.push({ expr: inExpr, src: buf });
        buf = '';
        inExpr = !inExpr;
        continue;
      }
      buf += c;
    }
    parts.push({ expr: false, src: inExpr ? '$' + buf : buf });
    return parts.filter(p => p.src !== '' || p.expr);
  }

  // ---------- tokenizer ----------
  function tokenize(src) {
    const t = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        i++;
        continue;
      }
      if (c === '"') {
        let j = i + 1,
          s = '';
        while (j < n && src[j] !== '"') {
          s += src[j++];
        }
        t.push({ k: 'str', v: s });
        i = j + 1;
        continue;
      }
      const two = src.substr(i, 2);
      if (two === '!=' || two === '>=' || two === '<=' || two === '~=') {
        t.push({ k: 'op', v: two });
        i += 2;
        continue;
      }
      if (OPS.indexOf(c) >= 0) {
        t.push({ k: 'op', v: c });
        i++;
        continue;
      }
      let j = i,
        s = '';
      while (j < n && OPS.indexOf(src[j]) < 0 && src[j] !== '"') s += src[j++];
      const raw = s;
      s = s.trim();
      // numbers like 1e-3 are not supported by Kustom; keep plain numerics
      if (/^\d+(\.\d+)?$/.test(s) || /^\.\d+$/.test(s)) t.push({ k: 'num', v: parseFloat(s) });
      else t.push({ k: 'word', v: s, raw, call: src[j] === '(' && /^[a-zA-Z]{2,5}$/.test(s) });
      i = j;
    }
    return t;
  }

  // ---------- parser (precedence climbing) ----------
  const PREC = {
    '|': 1,
    '&': 2,
    '=': 3,
    '!=': 3,
    '<': 3,
    '>': 3,
    '<=': 3,
    '>=': 3,
    '~=': 3,
    '+': 4,
    '-': 4,
    '*': 5,
    '/': 5,
    '%': 5,
    '^': 6
  };
  function parse(src) {
    if (astCache.has(src)) return astCache.get(src);
    const tk = tokenize(src);
    let p = 0;
    const peek = () => tk[p],
      next = () => tk[p++];
    function primary() {
      const t = next();
      if (!t) return { t: 'lit', v: '' };
      if (t.k === 'num' || t.k === 'str') return { t: 'lit', v: t.v, q: t.k === 'str' };
      if (t.k === 'word') {
        if (t.call && peek() && peek().v === '(' && peek().k === 'op') {
          next();
          const args = [];
          if (peek() && !(peek().k === 'op' && peek().v === ')')) {
            for (;;) {
              args.push(expr(0));
              const s = peek();
              if (s && s.k === 'op' && s.v === ',') {
                next();
                continue;
              }
              break;
            }
          }
          if (peek() && peek().k === 'op' && peek().v === ')') next();
          return { t: 'call', f: t.v.toLowerCase(), a: args };
        }
        return { t: 'lit', v: t.v, bare: true };
      }
      if (t.v === '(') {
        const e = expr(0);
        if (peek() && peek().v === ')') next();
        return { t: 'grp', e };
      }
      if (t.v === '-') {
        return { t: 'neg', e: unaryOperand() };
      }
      if (t.v === '!') {
        return { t: 'not', e: unaryOperand() };
      }
      if (t.v === ',' || t.v === ')') {
        p--;
        return { t: 'lit', v: '' };
      }
      return { t: 'lit', v: t.v, bare: true };
    }
    function unaryOperand() {
      return expr(6);
    }
    function expr(min) {
      let left = primary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.k !== 'op') {
          // adjacent tokens: implicit concatenation (e.g. "a" b)
          if (min > 4) break;
          const r = expr(5);
          left = { t: 'bin', op: 'cat', l: left, r };
          continue;
        }
        const pr = PREC[t.v];
        if (pr === undefined || pr < min) break;
        next();
        const right = expr(pr + 1);
        left = { t: 'bin', op: t.v, l: left, r: right };
      }
      return left;
    }
    let ast;
    try {
      ast = expr(0);
      if (p < tk.length) ast = { t: 'err', m: 'Unexpected "' + tk[p].v + '"' };
    } catch (e) {
      ast = { t: 'err', m: String(e.message || e) };
    }
    astCache.set(src, ast);
    return ast;
  }

  // ---------- helpers ----------
  const isNum = v =>
    typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim()));
  const num = v => (typeof v === 'number' ? v : isNum(v) ? parseFloat(v) : 0);
  function fmt(v) {
    if (typeof v === 'number') {
      if (!isFinite(v)) return '0';
      if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
      return String(parseFloat(v.toFixed(8)));
    }
    return v == null ? '' : String(v);
  }
  const truthy = v => (typeof v === 'number' ? v !== 0 : !(v === '' || v === '0' || v === 'false' || v == null));
  function eqv(a, b) {
    if (isNum(a) && isNum(b)) return Math.abs(num(a) - num(b)) < 1e-9;
    return fmt(a).toLowerCase() === fmt(b).toLowerCase();
  }
  const pad = (n, l) => String(Math.abs(Math.trunc(n))).padStart(l, '0');

  // ---------- colors ----------
  function parseColor(c) {
    c = fmt(c).trim().replace(/^#/, '');
    if (c.length === 3)
      c = c
        .split('')
        .map(x => x + x)
        .join('');
    if (c.length === 6) c = 'FF' + c;
    if (!/^[0-9a-fA-F]{8}$/.test(c)) return null;
    return {
      a: parseInt(c.substr(0, 2), 16),
      r: parseInt(c.substr(2, 2), 16),
      g: parseInt(c.substr(4, 2), 16),
      b: parseInt(c.substr(6, 2), 16)
    };
  }
  const h2 = n =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  const colorStr = c => '#' + h2(c.a) + h2(c.r) + h2(c.g) + h2(c.b);
  function rgb2hsl(c) {
    const r = c.r / 255,
      g = c.g / 255,
      b = c.b / 255,
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return { h, s, l };
  }
  function hsl2rgb(h, s, l, a) {
    const f = (p, q, t) => {
      t = ((t % 1) + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    if (s === 0) return { a, r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
      p = 2 * l - q;
    return { a, r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255 };
  }
  function ceFn(a) {
    const c = parseColor(a[0]);
    if (!c) return fmt(a[0]);
    const f = fmt(a[1]).toLowerCase(),
      amt = a[2];
    const hsl = rgb2hsl(c);
    const adj = (cur, max) => {
      const s = fmt(amt).trim();
      if (/^a/i.test(s)) return Math.min(max, cur + num(s.slice(1)));
      if (/^r/i.test(s)) return Math.max(0, cur - num(s.slice(1)));
      return Math.max(0, Math.min(max, num(s)));
    };
    switch (f) {
      case 'alpha':
        return colorStr({ ...c, a: adj(c.a / 2.55, 100) * 2.55 });
      case 'sat':
        return colorStr(hsl2rgb(hsl.h, adj(hsl.s * 100, 100) / 100, hsl.l, c.a));
      case 'lum':
        return colorStr(hsl2rgb(hsl.h, hsl.s, adj(hsl.l * 100, 100) / 100, c.a));
      case 'comp':
        return colorStr(hsl2rgb(hsl.h + 0.5, hsl.s, hsl.l, c.a));
      case 'invert':
        return colorStr({ a: c.a, r: 255 - c.r, g: 255 - c.g, b: 255 - c.b });
      case 'contrast':
        return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 149 ? '#FF000000' : '#FFFFFFFF';
      default: {
        const c2 = parseColor(a[1]);
        if (!c2) return colorStr(c);
        const m = amt === undefined ? 0.5 : num(amt) / 100;
        return colorStr({
          a: c.a + (c2.a - c.a) * m,
          r: c.r + (c2.r - c.r) * m,
          g: c.g + (c2.g - c.g) * m,
          b: c.b + (c2.b - c.b) * m
        });
      }
    }
  }

  // ---------- dates ----------
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ];
  function parseDate(spec, now) {
    if (spec === undefined || spec === '') return new Date(now);
    if (typeof spec === 'number' || /^\d{6,}$/.test(fmt(spec))) return new Date(num(spec) * 1000);
    const d = new Date(now);
    const s = fmt(spec);
    const re = /([ar])?(\d+)([yMdhmsw])/g;
    let m,
      any = false;
    while ((m = re.exec(s))) {
      any = true;
      const v = parseInt(m[2], 10),
        sg = m[1] === 'r' ? -1 : 1,
        u = m[3];
      if (m[1]) {
        if (u === 'y') d.setFullYear(d.getFullYear() + sg * v);
        else if (u === 'M') d.setMonth(d.getMonth() + sg * v);
        else if (u === 'd') d.setDate(d.getDate() + sg * v);
        else if (u === 'w') d.setDate(d.getDate() + sg * 7 * v);
        else if (u === 'h') d.setHours(d.getHours() + sg * v);
        else if (u === 'm') d.setMinutes(d.getMinutes() + sg * v);
        else d.setSeconds(d.getSeconds() + sg * v);
      } else {
        if (u === 'y') d.setFullYear(v);
        else if (u === 'M') d.setMonth(v - 1);
        else if (u === 'd') d.setDate(v);
        else if (u === 'h') d.setHours(v);
        else if (u === 'm') d.setMinutes(v);
        else if (u === 's') d.setSeconds(v);
      }
    }
    if (!any) {
      const t = Date.parse(s);
      if (!isNaN(t)) return new Date(t);
    }
    return d;
  }
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'],
      v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
  function dateFormat(f, d, h24) {
    f = fmt(f);
    let out = '',
      i = 0;
    while (i < f.length) {
      const c = f[i];
      if (c === "'") {
        let j = f.indexOf("'", i + 1);
        if (j < 0) j = f.length;
        out += f.slice(i + 1, j);
        i = j + 1;
        continue;
      }
      if (!/[a-zA-Z]/.test(c)) {
        out += c;
        i++;
        continue;
      }
      let j = i;
      while (f[j] === c) j++;
      const n = j - i;
      i = j;
      const H = d.getHours();
      switch (c) {
        case 'y':
          out += n === 2 ? pad(d.getFullYear() % 100, 2) : d.getFullYear();
          break;
        case 'M':
          out += n >= 4 ? MONTHS[d.getMonth()] : n === 3 ? MONTHS[d.getMonth()].slice(0, 3) : pad(d.getMonth() + 1, n);
          break;
        case 'd':
          out += pad(d.getDate(), n);
          break;
        case 'D':
          out += pad(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5), n);
          break;
        case 'E':
          out += n >= 4 ? DAYS[d.getDay()] : DAYS[d.getDay()].slice(0, 3);
          break;
        case 'e':
          out += d.getDay() + 1;
          break;
        case 'f':
          out += d.getDay() === 0 ? 7 : d.getDay();
          break;
        case 'F':
          out += Math.ceil(d.getDate() / 7);
          break;
        case 'h':
          out += h24 ? pad(H, n) : pad(H % 12 === 0 ? 12 : H % 12, n);
          break; // h follows the device 12/24h setting
        case 'H':
          out += pad(H, n);
          break;
        case 'k':
          out += pad(H === 0 ? 24 : H, n);
          break;
        case 'm':
          out += pad(d.getMinutes(), n);
          break;
        case 's':
          out += pad(d.getSeconds(), n);
          break;
        case 'a':
          out += H < 12 ? 'AM' : 'PM';
          break;
        case 'A':
          out += H < 12 ? 'AM' : 'PM';
          break;
        case 'S':
          out += Math.floor(d.getTime() / 1000);
          break;
        case 'o':
          out += ordinal(d.getDate());
          break;
        case 'w': {
          const t = new Date(d.getFullYear(), 0, 1);
          out += pad(Math.ceil(((d - t) / 864e5 + t.getDay() + 1) / 7), n);
          break;
        }
        case 'Z': {
          const o = -d.getTimezoneOffset();
          out += (o < 0 ? '-' : '+') + pad(o / 60, 2) + pad(Math.abs(o) % 60, 2);
          break;
        }
        case 'z':
          out += Intl.DateTimeFormat().resolvedOptions().timeZone || '';
          break;
        default:
          out += c.repeat(n);
      }
    }
    return out;
  }
  function timeSpan(a, now) {
    const d = parseDate(a[0], now);
    let secs = Math.round((d - now) / 1000);
    if (typeof a[0] === 'number' && a[0] < 1e8 && a.length === 1) secs = a[0];
    if (a.length > 1) {
      const s = Math.abs(typeof a[0] === 'number' && a[0] < 1e8 ? a[0] : secs),
        f = fmt(a[1]);
      const map = {
        D: Math.floor(s / 86400),
        H: Math.floor(s / 3600),
        M: Math.floor(s / 60),
        S: s,
        h: Math.floor(s / 3600) % 24,
        m: Math.floor(s / 60) % 60,
        s: s % 60,
        d: Math.floor(s / 86400)
      };
      return f.replace(/([DHMShmsd])\1*/g, (m, c) => pad(map[c], m.length));
    }
    const s = Math.abs(secs);
    let v, u;
    if (s < 60) {
      v = s;
      u = 'second';
    } else if (s < 3600) {
      v = Math.round(s / 60);
      u = 'minute';
    } else if (s < 86400) {
      v = Math.round(s / 3600);
      u = 'hour';
    } else {
      v = Math.round(s / 86400);
      u = 'day';
    }
    const txt = v + ' ' + u + (v === 1 ? '' : 's');
    return secs >= 0 ? 'in ' + txt : txt + ' ago';
  }

  // ---------- text functions ----------
  const SMALL = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen'
  ];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function n2w(n) {
    n = Math.trunc(n);
    if (n < 0) return 'minus ' + n2w(-n);
    if (n < 20) return SMALL[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + SMALL[n % 10] : '');
    if (n < 1000) return SMALL[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + n2w(n % 100) : '');
    if (n < 1e6) return n2w(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + n2w(n % 1000) : '');
    return n2w(Math.floor(n / 1e6)) + ' million' + (n % 1e6 ? ' ' + n2w(n % 1e6) : '');
  }
  function roman(n) {
    const r = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I']
    ];
    let o = '';
    n = Math.trunc(n);
    for (const [v, s] of r)
      while (n >= v) {
        o += s;
        n -= v;
      }
    return o;
  }
  function jsonPath(txt, path) {
    try {
      let o = JSON.parse(txt);
      for (const k of fmt(path)
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .filter(Boolean))
        o = o == null ? undefined : o[k];
      return o == null ? '' : typeof o === 'object' ? JSON.stringify(o) : o;
    } catch (e) {
      return '';
    }
  }
  function tcFn(a) {
    const f = fmt(a[0]).toLowerCase(),
      s = fmt(a[1]);
    switch (f) {
      case 'low':
        return s.toLowerCase();
      case 'up':
        return s.toUpperCase();
      case 'cap':
        return s.replace(/(^|\s)(\S)/g, (m, p, c) => p + c.toUpperCase());
      case 'cut': {
        if (a.length >= 4) {
          const st = num(a[2]),
            ln = num(a[3]);
          return s.substr(Math.max(0, st), ln);
        }
        const n = num(a[2]);
        return n >= 0 ? s.slice(0, n) : s.slice(n);
      }
      case 'ell': {
        const n = num(a[2]);
        return s.length > n ? s.slice(0, n) + '...' : s;
      }
      case 'count':
        return a[2] === undefined || fmt(a[2]) === '' ? 0 : s.split(fmt(a[2])).length - 1;
      case 'utf':
        return String.fromCodePoint(parseInt(s, 16) || 0);
      case 'len':
        return s.length;
      case 'n2w':
        return s.replace(/\d+/g, m => n2w(parseInt(m, 10)));
      case 'ord':
        return ordinal(num(s));
      case 'roman':
        return s.replace(/\d+/g, m => roman(parseInt(m, 10)));
      case 'split': {
        const p = s.split(fmt(a[2]));
        const i = num(a[3]);
        return p[i] === undefined ? '' : p[i];
      }
      case 'reg':
        try {
          return s.replace(new RegExp(fmt(a[2]), 'g'), fmt(a[3] === undefined ? '' : a[3]).replace(/\\(\d)/g, '$$$1'));
        } catch (e) {
          return s;
        }
      case 'html':
        return s
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d));
      case 'url':
        return encodeURIComponent(s);
      case 'nfmt':
        return isNum(s) ? num(s).toLocaleString() : s;
      case 'lines':
        return s === '' ? 0 : s.split('\n').length;
      case 'type':
        return isNum(s) ? 'NUMBER' : parseColor(s) && s[0] === '#' ? 'COLOR' : 'TEXT';
      case 'json':
        return jsonPath(s, a[2]);
      case 'lpad':
        return s.padStart(num(a[2]), a[3] === undefined ? '0' : fmt(a[3]));
      case 'rpad':
        return s.padEnd(num(a[2]), a[3] === undefined ? '0' : fmt(a[3]));
      case 'fmt': {
        let i = 2;
        return s.replace(/%[sd]/g, () => fmt(a[i++]));
      }
      default:
        return s;
    }
  }
  function muFn(a) {
    const f = fmt(a[0]).toLowerCase(),
      x = num(a[1]),
      y = num(a[2]);
    switch (f) {
      case 'ceil':
        return Math.ceil(x);
      case 'floor':
        return Math.floor(x);
      case 'sqrt':
        return Math.sqrt(x);
      case 'round': {
        if (a.length > 2) {
          const p = Math.pow(10, y);
          return Math.round(x * p) / p;
        }
        return Math.round(x);
      }
      case 'min':
        return Math.min(...a.slice(1).map(num));
      case 'max':
        return Math.max(...a.slice(1).map(num));
      case 'abs':
        return Math.abs(x);
      case 'sin':
        return Math.sin((x * Math.PI) / 180);
      case 'cos':
        return Math.cos((x * Math.PI) / 180);
      case 'tan':
        return Math.tan((x * Math.PI) / 180);
      case 'asin':
        return (Math.asin(x) * 180) / Math.PI;
      case 'acos':
        return (Math.acos(x) * 180) / Math.PI;
      case 'atan':
        return (Math.atan(x) * 180) / Math.PI;
      case 'log':
        return Math.log10(x);
      case 'ln':
        return Math.log(x);
      case 'pow':
        return Math.pow(x, y);
      case 'rnd':
        return Math.floor(x + Math.random() * (y - x + 1));
      case 'h2d':
        return parseInt(fmt(a[1]), 16) || 0;
      case 'd2h':
        return Math.trunc(x).toString(16);
      default:
        return x;
    }
  }

  // ---------- simulated device data (editable in the app) ----------
  const DEFAULT_SIM = {
    settings: { clock24h: false, fixedTime: '' },
    bi: {
      level: 78,
      temp: 29,
      tempc: 29,
      charging: 0,
      plugged: 0,
      volt: 4012,
      source: 'Battery',
      current: -310,
      fullempty: 0,
      connected: 0
    },
    wi: {
      temp: 21,
      flik: 20,
      cond: 'Partly Cloudy',
      icon: 'PARTLY_CLOUDY',
      code: 'PARTLY_CLOUDY',
      tempu: 'C',
      hum: 54,
      press: 1014,
      wspeed: 12,
      wspeedm: 3.3,
      wdir: 220,
      wchill: 20,
      clouds: 40,
      uvindex: 4,
      dpoint: 11,
      updated: 0,
      provider: 'Simulated',
      prain: 10,
      speedu: 'kmh'
    },
    wf: [
      {
        min: 14,
        max: 23,
        temp: 21,
        cond: 'Partly Cloudy',
        icon: 'PARTLY_CLOUDY',
        code: 'PARTLY_CLOUDY',
        wspeed: 12,
        wdir: 220,
        hum: 54,
        rain: 0,
        rainc: 10,
        press: 1014,
        clouds: 40
      },
      {
        min: 13,
        max: 20,
        temp: 18,
        cond: 'Rain',
        icon: 'RAIN',
        code: 'RAIN',
        wspeed: 18,
        wdir: 250,
        hum: 71,
        rain: 4,
        rainc: 80,
        press: 1009,
        clouds: 90
      },
      {
        min: 11,
        max: 19,
        temp: 16,
        cond: 'Showers',
        icon: 'SHOWER',
        code: 'SHOWER',
        wspeed: 20,
        wdir: 270,
        hum: 68,
        rain: 2,
        rainc: 60,
        press: 1010,
        clouds: 75
      },
      {
        min: 12,
        max: 22,
        temp: 19,
        cond: 'Clear',
        icon: 'CLEAR',
        code: 'CLEAR',
        wspeed: 8,
        wdir: 180,
        hum: 45,
        rain: 0,
        rainc: 0,
        press: 1018,
        clouds: 5
      },
      {
        min: 14,
        max: 25,
        temp: 22,
        cond: 'Clear',
        icon: 'CLEAR',
        code: 'CLEAR',
        wspeed: 6,
        wdir: 160,
        hum: 40,
        rain: 0,
        rainc: 0,
        press: 1020,
        clouds: 0
      },
      {
        min: 15,
        max: 24,
        temp: 21,
        cond: 'Cloudy',
        icon: 'CLOUDY',
        code: 'CLOUDY',
        wspeed: 10,
        wdir: 200,
        hum: 55,
        rain: 0,
        rainc: 20,
        press: 1015,
        clouds: 70
      },
      {
        min: 13,
        max: 21,
        temp: 18,
        cond: 'Thunderstorm',
        icon: 'TSTORM',
        code: 'TSTORM',
        wspeed: 25,
        wdir: 240,
        hum: 80,
        rain: 9,
        rainc: 90,
        press: 1004,
        clouds: 100
      }
    ],
    mi: {
      title: 'Song Title',
      artist: 'Artist Name',
      album: 'Album Name',
      state: 'PLAYING',
      len: 215,
      pos: 73,
      vol: 60,
      package: 'com.spotify.music',
      app: 'Spotify',
      coverImg: '',
      track: 3
    },
    li: {
      loc: 'Chicago',
      country: 'United States',
      ccode: 'US',
      addr: '123 Main St',
      admin: 'Illinois',
      neigh: 'Loop',
      postal: '60601',
      lat: 41.88,
      lon: -87.63,
      alt: 181,
      spd: 0,
      spdm: 0,
      spdu: 'kmh',
      lplat: 41.88,
      lplon: -87.63
    },
    ai: {
      sunrise: null,
      sunset: null,
      isday: 1,
      mphase: 'Waxing Gibbous',
      mphasec: 'WAXING_GIBBOUS',
      zodiac: 'Scorpio',
      season: 'Autumn',
      mage: 10,
      mill: 78,
      moonrise: null,
      moonset: null
    },
    nc: {
      wifi: 'CONNECTED',
      cell: 'ON',
      ssid: 'Home WiFi',
      wsig: 3,
      wrssi: -55,
      wspeed: 433,
      csig: 3,
      operator: 'Carrier',
      dtype: 'LTE',
      dtypes: '4G',
      bt: 1,
      acount: 0,
      aname: '',
      airplane: 0,
      ifip: '192.168.1.20',
      simcount: 1,
      svcstate: 'INSERVICE'
    },
    si: {
      locked: 0,
      darkmode: 1,
      volr: 60,
      vola: 60,
      mindex: 0,
      mcount: 1,
      ringer: 'NORMAL',
      alarmon: 0,
      alarmt: '',
      lmode: 'NORMAL',
      boot: 3600,
      model: 'Preview',
      man: 'Preview',
      build: '14',
      skpi: 2.9,
      system: 14,
      wpcolor1: '#FF336699',
      wpcolor2: '#FF99CCFF',
      sysca1: '#FF6750A4',
      sysca2: '#FF625B71',
      sysca3: '#FF7D5260',
      syscn1: '#FF1C1B1F',
      syscn2: '#FF49454F',
      lnchname: 'Launcher',
      lnchpkg: ''
    },
    rm: {
      used: 3120,
      free: 4880,
      total: 8000,
      fsfree: 52000,
      fsused: 76000,
      fstotal: 128000,
      cpu: 12,
      cpuu: 12,
      up: 86400
    },
    ni: {
      list: [
        {
          title: 'Alex',
          text: 'See you at 7?',
          app: 'Messages',
          pkg: 'com.google.android.apps.messaging',
          count: 1,
          time: 4,
          icon: 'chat',
          img: ''
        },
        {
          title: 'Reminder',
          text: 'Team sync in 15 minutes',
          app: 'Calendar',
          pkg: 'com.google.android.calendar',
          count: 1,
          time: 12,
          icon: 'bell',
          img: ''
        },
        {
          title: '2 new messages',
          text: 'Your order has shipped',
          app: 'Gmail',
          pkg: 'com.google.android.gm',
          count: 2,
          time: 38,
          icon: 'mail',
          img: ''
        },
        {
          title: 'Download complete',
          text: 'report.pdf',
          app: 'Files',
          pkg: 'com.google.android.documentsui',
          count: 1,
          time: 95,
          icon: 'check',
          img: ''
        }
      ]
    },
    ci: {
      list: [
        {
          title: 'Team sync',
          desc: '',
          loc: 'Room 4',
          start: 3600,
          end: 7200,
          allday: 0,
          color: '#FF4285F4',
          cname: 'Work'
        },
        {
          title: 'Dinner',
          desc: '',
          loc: 'Downtown',
          start: 28800,
          end: 36000,
          allday: 0,
          color: '#FF0F9D58',
          cname: 'Personal'
        }
      ]
    },
    uc: { sms: 1, calls: 0, gmail: 2, whatsapp: 0 },
    fd: { steps: 6240, cals: 310, dista: 4300, time: 3200 },
    aq: { index: 42, label: 'Good', level: 1, no2: 12, pm10: 18, pm25: 9, o3: 40, co: 0.3, so2: 2 },
    br: {},
    wg: {},
    sh: {},
    mq: { title: 'Queue item', sub: 'Artist' },
    ts: { trx: 0, ttx: 0, mrx: 0, mtx: 0 },
    bp: { default: '#FF607D8B' }
  };

  // ---------- evaluator ----------
  // ctx: { gv(name)->value|undefined, sim, now:Date, screen:{w,h,screen,screens,land,locked}, locals:Map, depth }
  function evalNode(n, c) {
    switch (n.t) {
      case 'lit':
        if (n.bare && typeof n.v === 'string') {
          if (n.v[0] === '#' && c.locals && c.locals.has(n.v.slice(1).toLowerCase()))
            return c.locals.get(n.v.slice(1).toLowerCase());
          if (c.locals && c.loopVar && n.v === c.loopVar) return c.locals.get(n.v);
        }
        return n.v;
      case 'grp':
        return evalNode(n.e, c);
      case 'neg': {
        const v = evalNode(n.e, c);
        return isNum(v) ? -num(v) : '-' + fmt(v);
      }
      case 'not':
        return truthy(evalNode(n.e, c)) ? 0 : 1;
      case 'err':
        throw new Error(n.m);
      case 'bin':
        return binop(n, c);
      case 'call':
        return callFn(n, c);
    }
    return '';
  }
  function binop(n, c) {
    const op = n.op;
    if (op === '&') return truthy(evalNode(n.l, c)) && truthy(evalNode(n.r, c)) ? 1 : 0;
    if (op === '|') return truthy(evalNode(n.l, c)) || truthy(evalNode(n.r, c)) ? 1 : 0;
    const a = evalNode(n.l, c),
      b = evalNode(n.r, c);
    const both = isNum(a) && isNum(b);
    switch (op) {
      case 'cat':
        return fmt(a) + ' ' + fmt(b);
      case '+':
        return both ? num(a) + num(b) : fmt(a) + fmt(b);
      case '-':
        return both ? num(a) - num(b) : fmt(a) + '-' + fmt(b);
      case '*':
        return both ? num(a) * num(b) : fmt(a) + '*' + fmt(b);
      case '/':
        return both ? (num(b) === 0 ? 0 : num(a) / num(b)) : fmt(a) + '/' + fmt(b);
      case '%':
        return both ? (num(b) === 0 ? 0 : num(a) % num(b)) : fmt(a) + '%' + fmt(b);
      case '^':
        return both ? Math.pow(num(a), num(b)) : fmt(a) + '^' + fmt(b);
      case '=':
        return eqv(a, b) ? 1 : 0;
      case '!=':
        return eqv(a, b) ? 0 : 1;
      case '>':
        return both ? (num(a) > num(b) ? 1 : 0) : fmt(a) > fmt(b) ? 1 : 0;
      case '<':
        return both ? (num(a) < num(b) ? 1 : 0) : fmt(a) < fmt(b) ? 1 : 0;
      case '>=':
        return both ? (num(a) >= num(b) ? 1 : 0) : fmt(a) >= fmt(b) ? 1 : 0;
      case '<=':
        return both ? (num(a) <= num(b) ? 1 : 0) : fmt(a) <= fmt(b) ? 1 : 0;
      case '~=':
        try {
          return new RegExp(fmt(b), 'i').test(fmt(a)) ? 1 : 0;
        } catch (e) {
          return 0;
        }
    }
    return '';
  }
  function simGet(c, f, field, dflt) {
    const o = (c.sim || DEFAULT_SIM)[f];
    if (!o) return dflt === undefined ? '' : dflt;
    const v = o[fmt(field).toLowerCase()];
    return v === undefined || v === null ? (dflt === undefined ? '' : dflt) : v;
  }
  function callFn(n, c) {
    const f = n.f,
      A = n.a;
    if (f === 'if') {
      let i = 0;
      for (; i + 1 < A.length; i += 2) if (truthy(evalNode(A[i], c))) return evalNode(A[i + 1], c);
      return i < A.length ? evalNode(A[i], c) : '';
    }
    if (f === 'fl') {
      const a = A.slice(0, 3).map(x => evalNode(x, c));
      let i = num(a[0]);
      const stop = num(a[1]);
      const body = fmt(evalNode(A[3], c));
      const sep = A[4] ? fmt(evalNode(A[4], c)) : '';
      const incr = fmt(a[2]);
      const out = [];
      let guard = 0;
      const sub = Object.assign({}, c, { locals: new Map(c.locals || []), loopVar: 'i' });
      while (guard++ < 1000 && (num(a[0]) <= stop ? i <= stop : i >= stop)) {
        sub.locals.set('i', i);
        out.push(fmt(evalExprSrc(body, sub)));
        const nx = evalExprSrc(incr, sub);
        const nn = num(nx);
        if (nn === i) break;
        i = nn;
      }
      return out.join(sep);
    }
    const a = A.map(x => evalNode(x, c));
    const now = c.now || new Date();
    switch (f) {
      case 'gv': {
        const v = c.gv ? c.gv(fmt(a[0])) : undefined;
        if (v === undefined) return a.length > 1 ? a[1] : '';
        if (a.length > 1 && typeof v === 'string' && isNum(a[1]) && v.indexOf(',') >= 0 && false) return v;
        return v;
      }
      case 'lv': {
        if (!c.locals) c.locals = new Map();
        const k = fmt(a[0]).toLowerCase();
        if (a.length > 1) {
          c.locals.set(k, a[1]);
          return '';
        }
        return c.locals.has(k) ? c.locals.get(k) : '';
      }
      case 'df':
        return dateFormat(a[0], parseDate(a[1], now), c.h24);
      case 'dp':
        return Math.floor(parseDate(a[0], now).getTime() / 1000);
      case 'tf':
        return timeSpan(a, now);
      case 'mu':
        return muFn(a);
      case 'tc':
        return tcFn(a);
      case 'ce':
        return ceFn(a);
      case 'cm': {
        let v = a.map(num),
          al = 255;
        if (fmt(a[a.length - 1]).toLowerCase() === 'h') {
          const k = a.length === 5 ? 1 : 0;
          if (k) al = v[0];
          return colorStr(hsl2rgb(v[k] / 360, v[k + 1] / 100, v[k + 2] / 100, al));
        }
        if (v.length >= 4) {
          al = v[0];
          v = v.slice(1);
        }
        return colorStr({ a: al, r: v[0], g: v[1], b: v[2] });
      }
      case 'si': {
        const k = fmt(a[0]).toLowerCase(),
          s = c.screen || {};
        if (k === 'rwidth') return s.w || 720;
        if (k === 'rheight') return s.h || 1280;
        if (k === 'rratio') return (s.w || 720) / (s.h || 1280);
        if (k === 'swidth') return s.pw || 1080;
        if (k === 'sheight') return s.ph || 1920;
        if (k === 'screen') return s.screen || 1;
        if (k === 'screens') return s.screens || 1;
        if (k === 'screenc') return s.screen || 1;
        if (k === 'screeny') return 1;
        if (k === 'screensy') return 1;
        if (k === 'land') return s.land ? 1 : 0;
        if (k === 'locked') return s.locked ? 1 : 0;
        if (k === 'rotation') return s.land ? 90 : 0;
        return simGet(c, 'si', k);
      }
      case 'wf': {
        const arr = (c.sim || DEFAULT_SIM).wf || [];
        const d = arr[Math.max(0, Math.min(arr.length - 1, num(a[1])))] || {};
        const k = fmt(a[0]).toLowerCase();
        if (k === 'day' || k === 'date') return Math.floor(now.getTime() / 1000) + 86400 * num(a[1]);
        return d[k] === undefined ? '' : d[k];
      }
      case 'ni':
      case 'ci': {
        const o = (c.sim || DEFAULT_SIM)[f] || {};
        const list = o.list || [];
        if (a.length === 1) {
          const k = fmt(a[0]).toLowerCase();
          return k.indexOf('count') >= 0 ? list.length : o[k] === undefined ? '' : o[k];
        }
        let idx, field;
        if (isNum(a[0])) {
          idx = num(a[0]);
          field = fmt(a[1]).toLowerCase();
        } else {
          field = fmt(a[0]).toLowerCase();
          idx = num(a[1]);
        }
        if (fmt(a[0]).toLowerCase() === 's' || fmt(a[0]).toLowerCase() === 'i') {
          idx = num(a[1]);
          field = fmt(a[2]).toLowerCase();
        }
        const it = list[idx];
        if (!it) return '';
        if (field === 'desc' && it.desc === undefined) return it.text || '';
        if (f === 'ci' && (field === 'start' || field === 'end'))
          return Math.floor(now.getTime() / 1000) + num(it[field]);
        if (f === 'ni' && (field === 'icon' || field === 'bicon')) return it.img || 'sim:icon/' + (it.icon || 'chat');
        if (f === 'ni' && field === 'time') return Math.floor(now.getTime() / 1000) - num(it.time || 0) * 60;
        return it[field] === undefined ? '' : it[field];
      }
      case 'ai': {
        const k = fmt(a[0]).toLowerCase();
        const d = new Date(now);
        const at = h => {
          const x = new Date(d);
          x.setHours(h, (h % 1) * 60, 0, 0);
          return Math.floor(x.getTime() / 1000);
        };
        const v = simGet(c, 'ai', k, null);
        if (v !== null) return v;
        if (k === 'sunrise' || k === 'nsunrise') return at(6.5);
        if (k === 'sunset' || k === 'nsunset') return at(19.25);
        if (k === 'moonrise') return at(21);
        if (k === 'moonset') return at(8);
        return '';
      }
      case 'bp':
        return simGet(c, 'bp', fmt(a[0]), simGet(c, 'bp', 'default', '#FF607D8B'));
      case 'tu': {
        const k = fmt(a[0]).toLowerCase();
        const bucket = Math.floor(now.getTime() / 1000 / Math.max(1, timeUnit(a[1])));
        const rnd = seed => {
          let x = (bucket * 9301 + seed * 49297 + 233280) % 233280;
          x = (x * 9301 + 49297) % 233280;
          return x / 233280;
        }; // steady within one period
        if (k === 'rnd') {
          const lo = num(a[2]),
            hi = num(a[3]);
          return Math.floor(lo + rnd(lo * 7 + hi) * (hi - lo + 1));
        }
        if (k === 'rndimg' || k === 'rndgif') {
          const list = c.listFiles ? c.listFiles(fmt(a[2])) : [];
          return list.length
            ? list[Math.floor(rnd(fmt(a[2]).length + num(a[1]) * 1000) * list.length) % list.length]
            : '';
        }
        if (k === 'seq') {
          const lo = num(a[2]),
            hi = num(a[3]);
          const span = Math.max(1, hi - lo + 1);
          return lo + (Math.floor(now.getTime() / 1000 / Math.max(1, timeUnit(a[1]))) % span);
        }
        return '';
      }
      case 'wi':
      case 'bi':
      case 'mi':
      case 'li':
      case 'nc':
      case 'rm':
      case 'uc':
      case 'fd':
      case 'aq':
      case 'mq':
      case 'ts':
      case 'br':
      case 'bt':
      case 'cf':
        if (f === 'wi' && fmt(a[0]).toLowerCase() === 'updated') return Math.floor(now.getTime() / 1000) - 900;
        if (f === 'br') return simGet(c, 'br', fmt(a[0]) + '/' + fmt(a[1]));
        if (f === 'mi' && fmt(a[0]).toLowerCase() === 'cover') {
          const m = (c.sim || DEFAULT_SIM).mi || {};
          return m.coverImg || 'sim:cover';
        }
        if (f === 'mi' && fmt(a[0]).toLowerCase() === 'percent') {
          const m = (c.sim || DEFAULT_SIM).mi || {};
          return m.len ? Math.round((100 * num(m.pos)) / num(m.len)) : 0;
        }
        return simGet(c, f, a[0]);
      case 'wg':
      case 'sh': {
        if (f === 'wg' && c.readText && /^(file:|\/)/.test(fmt(a[0]))) {
          const t = c.readText(fmt(a[0]));
          if (t !== null) return t;
        }
        const o = (c.sim || DEFAULT_SIM)[f] || {};
        const v = o[a.map(fmt).join(',')];
        return v === undefined ? (o['*'] === undefined ? '' : o['*']) : v;
      }
      default:
        throw new Error('Unknown function ' + f + '()');
    }
  }
  function timeUnit(s) {
    if (isNum(s)) return Math.max(1, num(s) * 60);
    const m = /(\d+)\s*([smhd])/.exec(fmt(s));
    if (!m) return 60;
    return parseInt(m[1], 10) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
  }
  function evalExprSrc(src, c) {
    return evalNode(parse(src), c);
  }

  // Evaluate a full template string. Returns { value:string, error:string|null }
  function evaluate(tpl, c) {
    if (typeof tpl !== 'string') return { value: fmt(tpl), error: null };
    if (tpl.indexOf('$') < 0) return { value: tpl, error: null };
    c = Object.assign({}, c, { locals: new Map() });
    let out = '',
      error = null;
    for (const p of splitTemplate(tpl)) {
      if (!p.expr) {
        out += p.src;
        continue;
      }
      if (p.src.trim() === '') continue;
      try {
        out += fmt(evalNode(parse(p.src), c));
      } catch (e) {
        error = error || String(e.message || e);
      }
    }
    return { value: out, error };
  }
  function usedFunctions(tpl) {
    const s = new Set();
    if (typeof tpl !== 'string' || tpl.indexOf('$') < 0) return s;
    (function w(n) {
      if (!n || typeof n !== 'object') return;
      if (n.t === 'call') {
        s.add(n.f);
        n.a.forEach(w);
      } else {
        w(n.l);
        w(n.r);
        w(n.e);
      }
    });
    for (const p of splitTemplate(tpl))
      if (p.expr) {
        const walk = n => {
          if (!n || typeof n !== 'object') return;
          if (n.t === 'call') {
            s.add(n.f);
            n.a.forEach(walk);
          } else {
            walk(n.l);
            walk(n.r);
            walk(n.e);
          }
        };
        walk(parse(p.src));
      }
    return s;
  }

  G.KFormula = { evaluate, parse, usedFunctions, parseColor, colorStr, isNum, num, fmt, DEFAULT_SIM, dateFormat };
})(typeof window !== 'undefined' ? window : globalThis);
