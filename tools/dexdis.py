#!/usr/bin/env python3
"""Minimal dex reader + Dalvik disassembler (smali-like text). Usage as a library or CLI:
   dexdis.py <dex>... --class <descriptor-substring> | --grep-const <string> | --list"""
import struct, sys, re

def uleb(b, o):
    r = s = 0
    while True:
        x = b[o]; o += 1; r |= (x & 0x7f) << s; s += 7
        if x < 0x80: return r, o

def mutf8(b, o):
    _, o = uleb(b, o); e = b.index(0, o)
    try: return b[o:e].decode('utf-8', 'replace')
    except Exception: return repr(b[o:e])

FMT = {}
def op(code, name, fmt, kind=None): FMT[code] = (name, fmt, kind)
for c, n, f, k in [
    (0x00,'nop','10x',None),(0x01,'move','12x',None),(0x02,'move/from16','22x',None),(0x03,'move/16','32x',None),
    (0x04,'move-wide','12x',None),(0x05,'move-wide/from16','22x',None),(0x06,'move-wide/16','32x',None),
    (0x07,'move-object','12x',None),(0x08,'move-object/from16','22x',None),(0x09,'move-object/16','32x',None),
    (0x0a,'move-result','11x',None),(0x0b,'move-result-wide','11x',None),(0x0c,'move-result-object','11x',None),(0x0d,'move-exception','11x',None),
    (0x0e,'return-void','10x',None),(0x0f,'return','11x',None),(0x10,'return-wide','11x',None),(0x11,'return-object','11x',None),
    (0x12,'const/4','11n',None),(0x13,'const/16','21s',None),(0x14,'const','31i',None),(0x15,'const/high16','21h',None),
    (0x16,'const-wide/16','21s',None),(0x17,'const-wide/32','31i',None),(0x18,'const-wide','51l',None),(0x19,'const-wide/high16','21h',None),
    (0x1a,'const-string','21c','s'),(0x1b,'const-string/jumbo','31c','s'),(0x1c,'const-class','21c','t'),
    (0x1d,'monitor-enter','11x',None),(0x1e,'monitor-exit','11x',None),(0x1f,'check-cast','21c','t'),(0x20,'instance-of','22c','t'),
    (0x21,'array-length','12x',None),(0x22,'new-instance','21c','t'),(0x23,'new-array','22c','t'),
    (0x24,'filled-new-array','35c','t'),(0x25,'filled-new-array/range','3rc','t'),(0x26,'fill-array-data','31t',None),
    (0x27,'throw','11x',None),(0x28,'goto','10t',None),(0x29,'goto/16','20t',None),(0x2a,'goto/32','30t',None),
    (0x2b,'packed-switch','31t',None),(0x2c,'sparse-switch','31t',None)]:
    op(c,n,f,k)
for i,n in enumerate(['cmpl-float','cmpg-float','cmpl-double','cmpg-double','cmp-long']): op(0x2d+i,n,'23x')
for i,n in enumerate(['if-eq','if-ne','if-lt','if-ge','if-gt','if-le']): op(0x32+i,n,'22t')
for i,n in enumerate(['if-eqz','if-nez','if-ltz','if-gez','if-gtz','if-lez']): op(0x38+i,n,'21t')
sfx=['','-wide','-object','-boolean','-byte','-char','-short']
for i,n in enumerate(['aget'+x for x in sfx]+['aput'+x for x in sfx]): op(0x44+i,n,'23x')
for i,n in enumerate(['iget'+x for x in sfx]+['iput'+x for x in sfx]): op(0x52+i,n,'22c','f')
for i,n in enumerate(['sget'+x for x in sfx]+['sput'+x for x in sfx]): op(0x60+i,n,'21c','f')
for i,n in enumerate(['invoke-virtual','invoke-super','invoke-direct','invoke-static','invoke-interface']): op(0x6e+i,n,'35c','m')
for i,n in enumerate(['invoke-virtual/range','invoke-super/range','invoke-direct/range','invoke-static/range','invoke-interface/range']): op(0x74+i,n,'3rc','m')
un=['neg-int','not-int','neg-long','not-long','neg-float','neg-double','int-to-long','int-to-float','int-to-double','long-to-int','long-to-float','long-to-double','float-to-int','float-to-long','float-to-double','double-to-int','double-to-long','double-to-float','int-to-byte','int-to-char','int-to-short']
for i,n in enumerate(un): op(0x7b+i,n,'12x')
bi=['add','sub','mul','div','rem','and','or','xor','shl','shr','ushr']
bins=[x+'-int' for x in bi]+[x+'-long' for x in bi]+[x+'-float' for x in bi[:5]]+[x+'-double' for x in bi[:5]]
for i,n in enumerate(bins): op(0x90+i,n,'23x'); op(0xb0+i,n+'/2addr','12x')
for i,n in enumerate(['add-int/lit16','rsub-int','mul-int/lit16','div-int/lit16','rem-int/lit16','and-int/lit16','or-int/lit16','xor-int/lit16']): op(0xd0+i,n,'22s')
for i,n in enumerate(['add-int/lit8','rsub-int/lit8','mul-int/lit8','div-int/lit8','rem-int/lit8','and-int/lit8','or-int/lit8','xor-int/lit8','shl-int/lit8','shr-int/lit8','ushr-int/lit8']): op(0xd8+i,n,'22b')
op(0xfa,'invoke-polymorphic','45cc','m'); op(0xfb,'invoke-polymorphic/range','4rcc','m'); op(0xfc,'invoke-custom','35c',None); op(0xfd,'invoke-custom/range','3rc',None)
op(0xfe,'const-method-handle','21c',None); op(0xff,'const-method-type','21c',None)
SIZE={'10x':1,'12x':1,'11n':1,'11x':1,'10t':1,'20t':2,'22x':2,'21t':2,'21s':2,'21h':2,'21c':2,'23x':2,'22b':2,'22t':2,'22s':2,'22c':2,'30t':3,'32x':3,'31i':3,'31t':3,'31c':3,'35c':3,'3rc':3,'45cc':4,'4rcc':4,'51l':5}

def s16(x): return x-0x10000 if x&0x8000 else x
def s32(x): return x-0x100000000 if x&0x80000000 else x
def f32(bits): return struct.unpack('<f',struct.pack('<I',bits&0xffffffff))[0]
def f64(bits): return struct.unpack('<d',struct.pack('<Q',bits&0xffffffffffffffff))[0]

class Dex:
    def __init__(self, path):
        self.path=path; b=self.b=open(path,'rb').read()
        h=struct.unpack_from('<20I',b,56)
        (ns,so,nt,to,np,po,nf,fo,nm,mo,nc,co)=h[:12]
        self.strings=[mutf8(b,struct.unpack_from('<I',b,so+4*i)[0]) for i in range(ns)]
        self.types=[self.strings[struct.unpack_from('<I',b,to+4*i)[0]] for i in range(nt)]
        self.protos=[]
        for i in range(np):
            sh,rt,pof=struct.unpack_from('<3I',b,po+12*i); ps=[]
            if pof:
                n=struct.unpack_from('<I',b,pof)[0]; ps=[self.types[x] for x in struct.unpack_from('<%dH'%n,b,pof+4)]
            self.protos.append('('+''.join(ps)+')'+self.types[rt])
        self.fields=[]
        for i in range(nf):
            c,t,n=struct.unpack_from('<HHI',b,fo+8*i); self.fields.append(self.types[c]+'->'+self.strings[n]+':'+self.types[t])
        self.methods=[]
        for i in range(nm):
            c,p,n=struct.unpack_from('<HHI',b,mo+8*i); self.methods.append(self.types[c]+'->'+self.strings[n]+self.protos[p])
        self.classes={}
        for i in range(nc):
            ci,acc,sup,ifo,sf,ao,cdo,svo=struct.unpack_from('<8I',b,co+32*i)
            self.classes[self.types[ci]]=(sup,cdo,svo,ifo)
    def class_methods(self, desc):
        sup,cdo,_,_=self.classes[desc]; b=self.b; out=[]; fl=[]
        if not cdo: return out, fl
        o=cdo; sfs,o=uleb(b,o); ifs,o=uleb(b,o); dms,o=uleb(b,o); vms,o=uleb(b,o)
        for cnt,kind in ((sfs,'static'),(ifs,'instance')):
            idx=0
            for _ in range(cnt):
                d,o=uleb(b,o); a,o=uleb(b,o); idx+=d; fl.append((kind,self.fields[idx]))
        for cnt in (dms,vms):
            idx=0
            for _ in range(cnt):
                d,o=uleb(b,o); a,o=uleb(b,o); c,o=uleb(b,o); idx+=d; out.append((self.methods[idx],a,c))
        return out, fl
    def disasm(self, code_off):
        b=self.b
        regs,ins,outs,tries,dbg,n=struct.unpack_from('<4H2I',b,code_off)
        base=code_off+16; u=lambda i: struct.unpack_from('<H',b,base+2*i)[0]
        lines=['    .registers %d (ins %d)'%(regs,ins)]; pc=0
        while pc<n:
            w=u(pc); opc=w&0xff
            if opc==0 and w!=0:
                ident=w
                if ident==0x0100: sz=u(pc+1); lines.append('  %04x: packed-switch-payload first=%d targets=%s'%(pc,s32(u(pc+2)|u(pc+3)<<16),[s32(u(pc+4+2*k)|u(pc+5+2*k)<<16) for k in range(sz)])); pc+=sz*2+4; continue
                if ident==0x0200: sz=u(pc+1); keys=[s32(u(pc+2+2*k)|u(pc+3+2*k)<<16) for k in range(sz)]; lines.append('  %04x: sparse-switch-payload keys=%s'%(pc,keys)); pc+=sz*4+2; continue
                if ident==0x0300:
                    wd=u(pc+1); sz=u(pc+2)|u(pc+3)<<16; data=b[base+2*(pc+4):base+2*(pc+4)+wd*sz]
                    vals=list(struct.unpack('<%d%s'%(sz,{1:'b',2:'h',4:'i',8:'q'}[wd]),data)) if wd in (1,2,4,8) else data.hex()
                    if wd==4: vals=[(v, round(f32(v),6)) for v in vals]
                    lines.append('  %04x: array-data w=%d %s'%(pc,wd,vals)); pc+=(wd*sz+1)//2+4; continue
            if opc not in FMT: lines.append('  %04x: ??? %04x'%(pc,w)); pc+=1; continue
            name,fmt,kind=FMT[opc]; A=w>>8; t=''
            def ref(i):
                if kind=='s': return repr(self.strings[i])
                if kind=='t': return self.types[i]
                if kind=='f': return self.fields[i]
                if kind=='m': return self.methods[i]
                return '#%d'%i
            if fmt=='10x': t=''
            elif fmt=='12x': t='v%d, v%d'%(A&15,A>>4)
            elif fmt=='11n': v=A>>4; v=v-16 if v&8 else v; t='v%d, %d'%(A&15,v)
            elif fmt=='11x': t='v%d'%A
            elif fmt=='10t': t='-> %04x'%(pc+(A-256 if A&0x80 else A))
            elif fmt=='20t': t='-> %04x'%(pc+s16(u(pc+1)))
            elif fmt=='22x': t='v%d, v%d'%(A,u(pc+1))
            elif fmt=='21t': t='v%d, -> %04x'%(A,pc+s16(u(pc+1)))
            elif fmt=='21s': t='v%d, %d'%(A,s16(u(pc+1)))
            elif fmt=='21h':
                v=u(pc+1)
                t='v%d, 0x%x  (float %g)'%(A,v<<16,f32(v<<16)) if opc==0x15 else 'v%d, 0x%x  (double %g)'%(A,v<<48,f64(v<<48))
            elif fmt=='21c': t='v%d, %s'%(A,ref(u(pc+1)))
            elif fmt=='23x': x=u(pc+1); t='v%d, v%d, v%d'%(A,x&0xff,x>>8)
            elif fmt=='22b': x=u(pc+1); c=x>>8; c=c-256 if c&0x80 else c; t='v%d, v%d, %d'%(A,x&0xff,c)
            elif fmt=='22t': t='v%d, v%d, -> %04x'%(A&15,A>>4,pc+s16(u(pc+1)))
            elif fmt=='22s': t='v%d, v%d, %d'%(A&15,A>>4,s16(u(pc+1)))
            elif fmt=='22c': t='v%d, v%d, %s'%(A&15,A>>4,ref(u(pc+1)))
            elif fmt=='30t': t='-> %04x'%(pc+s32(u(pc+1)|u(pc+2)<<16))
            elif fmt=='32x': t='v%d, v%d'%(u(pc+1),u(pc+2))
            elif fmt=='31i':
                v=s32(u(pc+1)|u(pc+2)<<16); t='v%d, %d  (float %g)'%(A,v,f32(v))
            elif fmt=='31t': t='v%d, -> %04x'%(A,pc+s32(u(pc+1)|u(pc+2)<<16))
            elif fmt=='31c': t='v%d, %s'%(A,ref(u(pc+1)|u(pc+2)<<16))
            elif fmt in ('35c','45cc'):
                cnt=A>>4; g=A&15; x=u(pc+2); rs=[x&15,(x>>4)&15,(x>>8)&15,x>>12,g][:cnt]
                t='{%s}, %s'%(', '.join('v%d'%r for r in rs),ref(u(pc+1)))
            elif fmt in ('3rc','4rcc'):
                c0=u(pc+2); t='{v%d .. v%d}, %s'%(c0,c0+A-1,ref(u(pc+1)))
            elif fmt=='51l':
                v=0
                for k in range(4): v|=u(pc+1+k)<<(16*k)
                t='v%d, 0x%x  (double %g)'%(A,v,f64(v))
            lines.append('  %04x: %s %s'%(pc,name,t)); pc+=SIZE[fmt]
        return lines
    def dump_class(self, desc):
        ms, fl = self.class_methods(desc); sup=self.classes[desc][0]
        out=['.class %s  super %s'%(desc,self.types[sup] if sup!=0xffffffff else '-')]
        out+=['  .field %s %s'%f for f in fl]
        for m,a,c in ms:
            out.append('.method %s  (flags 0x%x)'%(m,a))
            if c: out+=self.disasm(c)
        return '\n'.join(out)

if __name__=='__main__':
    import argparse
    ap=argparse.ArgumentParser(); ap.add_argument('dex',nargs='+'); ap.add_argument('--cls',action='append',default=[]); ap.add_argument('--const'); ap.add_argument('--refs'); ap.add_argument('--list')
    a=ap.parse_args(); dx=[Dex(p) for p in a.dex]
    for d in dx:
        if a.list:
            for c in d.classes:
                if a.list in c: print(d.path, c)
        for c in a.cls:
            for k in d.classes:
                if k==c: print(d.dump_class(k))
        if a.const or a.refs:
            for k in d.classes:
                try: txt=d.dump_class(k)
                except Exception as e: continue
                needle=repr(a.const) if a.const else a.refs
                if needle in txt: print(d.path, k)
