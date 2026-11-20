"""Genera site/desktop.css: versión de escritorio que escala TODO en proporción al lienzo de Figma (1728px).

Toma cada regla de nivel superior de site/styles.css, resuelve los clamp() al valor que tendrían
a 1728px de ancho y convierte cada medida en px a calc(N * var(--u)), donde --u = 100vw / 1728.
Se aplica solo en pantallas de 1025px o más; tablet y móvil siguen usando styles.css.

Uso:  python3 tools/gen_desktop_css.py   (correrlo cada vez que cambie styles.css)
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "site" / "styles.css"
OUT = ROOT / "site" / "desktop.css"
CANVAS = 1728
MIN_WIDTH = 1025


def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def top_level_rules(css):
    """Devuelve (selector, cuerpo) de las reglas de nivel superior, saltando bloques @."""
    i, n = 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j == -1:
            break
        sel = css[i:j].strip()
        depth, k = 1, j + 1
        while depth and k < n:
            depth += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        body = css[j + 1:k - 1]
        if not sel.startswith("@"):
            yield sel, body
        i = k


def to_px(token):
    token = token.strip()
    m = re.fullmatch(r"(-?\d*\.?\d+)(px|rem|vw)", token)
    if not m:
        return None
    v, u = float(m.group(1)), m.group(2)
    return v if u == "px" else v * 16 if u == "rem" else v * CANVAS / 100


def split_args(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "," and depth == 0:
            out.append(cur); cur = ""; continue
        depth += ch == "("; depth -= ch == ")"
        cur += ch
    out.append(cur)
    return out


def resolve_clamps(value):
    while True:
        i = value.find("clamp(")
        if i == -1:
            return value
        depth, k = 0, i + 5
        while True:
            depth += value[k] == "("; depth -= value[k] == ")"
            k += 1
            if depth == 0:
                break
        lo, mid, hi = (to_px(a) for a in split_args(value[i + 6:k - 1]))
        if hi is None:
            raise ValueError(f"clamp no soportado: {value[i:k]}")
        px = hi if mid is None else max(lo or 0, min(mid, hi))
        value = value[:i] + f"{round(px, 3)}px" + value[k:]


def scale_px(value):
    return re.sub(r"(?<![\w.#-])(-?\d*\.?\d+)px", lambda m: f"calc({m.group(1)} * var(--u))", value)


def main():
    css = strip_comments(SRC.read_text(encoding="utf-8"))
    lines = []
    for sel, body in top_level_rules(css):
        decls = []
        for d in body.split(";"):
            if ":" not in d:
                continue
            prop, val = d.split(":", 1)
            prop, val = prop.strip(), val.strip()
            if prop.startswith("--") or ("px" not in val and "clamp(" not in val):
                continue
            decls.append(f"{prop}:{scale_px(resolve_clamps(val))}")
        if decls:
            lines.append(f"  {sel}{{{';'.join(decls)}}}")
    OUT.write_text(
        "/* GENERADO por tools/gen_desktop_css.py — no editar a mano */\n"
        f"@media (min-width:{MIN_WIDTH}px){{\n"
        f"  :root{{--u:calc(100vw / {CANVAS})}}\n"
        + "\n".join(lines) + "\n}\n",
        encoding="utf-8",
    )
    print(f"{OUT.relative_to(ROOT)}: {len(lines)} reglas")


if __name__ == "__main__":
    main()
