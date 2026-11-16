#!/usr/bin/env python3
"""Bundle the editor into one self-contained HTML file: editor/dist/KLWP Desktop Editor.html

The page has no runtime dependencies. Each placeholder in src/index.html is replaced by the
contents of one source file, so the result can be opened straight from disk.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = [
    ("/*CSS*/", "src/style.css"),
    ("/*JSZIP*/", "vendor/jszip.min.js"),
    ("/*LABELS*/", "src/labels.js"),
    ("/*BUILTIN*/", "src/builtin.js"),
    ("/*DEFAULTS*/", "src/defaults.js"),
    ("/*LIVE*/", "src/live.js"),
    ("/*FORMULA*/", "src/formula.js"),
    ("/*SCHEMA*/", "src/schema.js"),
    ("/*RENDER*/", "src/render.js"),
    ("/*APP*/", "src/app.js"),
]


def read(path):
    with open(os.path.join(HERE, path), encoding="utf-8") as f:
        return f.read()


def main():
    page = read("src/index.html")
    for placeholder, path in PARTS:
        content = read(path)
        if not path.endswith(".css") and "</script" in content.lower():
            raise SystemExit(path + " contains </script, which would end the inline script early")
        if placeholder not in page:
            raise SystemExit("placeholder " + placeholder + " not found in src/index.html")
        page = page.replace(placeholder, content, 1)
    out_dir = os.path.join(HERE, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "KLWP Desktop Editor.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    print("wrote %s (%d KB)" % (out, len(page) // 1024))


if __name__ == "__main__":
    main()
