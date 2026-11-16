# Tools

Used to read rendering rules and setting defaults out of a KLWP install you own. Nothing from KLWP is included in
this repository except the resulting table of setting names and default values (`editor/src/defaults.js`).

- `dexdis.py` reads a `classes*.dex` file and prints a class's methods as Dalvik instructions:
  `python3 dexdis.py classes8.dex --cls "Lorg/kustom/lib/render/AnimationModule;"`
- `specdefaults.py` lists every module setting with its default value as KLWP declares it:
  `python3 specdefaults.py classes8.dex defaults.json`

Get the `.dex` files by unzipping KLWP's `base.apk`.
