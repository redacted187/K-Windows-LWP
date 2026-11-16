#!/usr/bin/env python3
"""Extract KLWP module setting defaults from the spec DSL: key -> default value, per spec builder."""
import sys, re, json, struct
sys.path.insert(0, __import__('os').path.dirname(__file__))
from dexdis import Dex
d = Dex(sys.argv[1])
SETTING = 'Lorg/kustom/lib/render/spec/model/b$a$a;->a(Ljava/lang/String;Lkotlin/jvm/functions/Function1;)Lorg/kustom/lib/render/spec/model/b;'
DEFAULT = 'Lorg/kustom/lib/render/spec/model/b$a;->w(Ljava/lang/Object;)V'
code_of = {}
for cls in d.classes:
    try: ms, _ = d.class_methods(cls)
    except Exception: continue
    for m, a, c in ms:
        if c: code_of[m] = c
def lines(m): return d.disasm(code_of[m]) if m in code_of else []
rx_reg = re.compile(r'v(\d+)')
def default_in(method, depth=0):
    """value passed to b$a.w() inside method (following one level of static calls)"""
    regs = {}
    last = None
    for l in lines(method):
        mm = re.match(r'\s+\w+: (\S+) (.*)', l)
        if not mm: continue
        op, args = mm.groups()
        if op.startswith('const-string'):
            r, s = args.split(', ', 1); regs[r] = ('str', eval(s))
        elif op in ('const/4', 'const/16', 'const', 'const/high16', 'const-wide/16', 'const-wide/32', 'const-wide', 'const-wide/high16'):
            r, rest = args.split(', ', 1)
            fm = re.search(r'\((float|double) ([^)]+)\)', rest)
            iv = rest.split()[0]
            regs[r] = ('num', int(iv, 16) if iv.startswith('0x') else int(iv), fm.group(2) if fm else None, op)
        elif op == 'sget-object':
            r, f = args.split(', ', 1); regs[r] = ('enum', f.split('->')[1].split(':')[0], f)
        elif op.startswith('invoke-static') and ('valueOf' in args):
            rs = rx_reg.findall(args.split('}')[0]); src = regs.get('v' + rs[0]) if rs else None
            kind = 'Float' if 'Float;->valueOf' in args else 'Integer' if 'Integer;->valueOf' in args else 'Double' if 'Double;->valueOf' in args else 'Boolean' if 'Boolean;->valueOf' in args else 'Long' if 'Long;->valueOf' in args else '?'
            last = (kind, src)
        elif op.startswith('move-result'):
            r = args.strip()
            if last: regs[r] = ('boxed',) + last; last = None
        elif op.startswith('invoke') and DEFAULT in args:
            rs = rx_reg.findall(args.split('}')[0]); return regs.get('v' + rs[1]) if len(rs) > 1 else None
        elif op.startswith('invoke-static') and depth < 2 and '$this$' not in args:
            target = args.split('}, ', 1)[1] if '}, ' in args else None
            if target and target in code_of:
                v = default_in(target, depth + 1)
                if v is not None: return v
    return None
def pretty(v):
    if v is None: return None
    if v[0] == 'str': return v[1]
    if v[0] == 'enum': return v[1]
    if v[0] == 'boxed':
        kind, src = v[1], v[2]
        if not src: return '?'
        if src[0] == 'num':
            if kind == 'Float':
                if src[3] in ('const/high16', 'const'): return float(src[2]) if src[2] else src[1]
                return float(src[1])
            if kind == 'Boolean': return bool(src[1])
            return src[1]
        return src
    return v
out = {}
for m in code_of:
    L = lines(m) if 'spec' in m or m.startswith('Lye/') else []
    pending = None; key = None
    for l in L:
        if 'new-instance' in l: pending = l.split(', ')[-1]
        elif 'const-string' in l: key = eval(l.split(', ', 1)[1])
        elif SETTING in l and pending and key:
            inv = pending[:-1] + ';->invoke(Ljava/lang/Object;)Ljava/lang/Object;'
            out.setdefault(key, {})[m.split('->')[0]] = pretty(default_in(inv))
            pending = None
json.dump(out, open(sys.argv[2], 'w'), indent=1, sort_keys=True)
print(len(out), 'settings')
