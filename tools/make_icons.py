"""
Generate ShortStop's icon set (16, 32, 48, 128 px PNGs) with no dependencies.

The mark is a stop-sign octagon around a white vertical video frame with a
play triangle. Shapes are drawn as signed-distance tests and anti-aliased by
supersampling, then written with a tiny hand-rolled PNG encoder.

    python tools/make_icons.py
"""

import math
import struct
import zlib
from pathlib import Path

ICON_DIR = Path(__file__).resolve().parent.parent / "extension" / "icons"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 6  # Samples per axis per pixel.

STOP_RED = (214, 40, 57)
WHITE = (255, 255, 255)


def in_octagon(x, y, radius):
    """Regular octagon with flat edges `radius` from the centre."""
    ax, ay = abs(x), abs(y)
    return max(ax, ay) <= radius and (ax + ay) / math.sqrt(2) <= radius


def in_rounded_rect(x, y, half_w, half_h, corner):
    qx = abs(x) - half_w + corner
    qy = abs(y) - half_h + corner
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - corner <= 0


def in_triangle(x, y, a, b, c):
    def edge(p, q):
        return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])

    d1, d2, d3 = edge(a, b), edge(b, c), edge(c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def sample(x, y):
    """Colour at a point in unit space (-0.5..0.5), or None if transparent."""
    if not in_octagon(x, y, 0.5):
        return None
    if in_rounded_rect(x, y, 0.16, 0.28, 0.07):
        # Play triangle, nudged right so it looks optically centred.
        if in_triangle(x, y, (-0.06, -0.11), (0.10, 0.0), (-0.06, 0.11)):
            return STOP_RED
        return WHITE
    return STOP_RED


def render(size):
    rows = []
    n = SUPERSAMPLE
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = hits = 0
            for sy in range(n):
                for sx in range(n):
                    x = (px + (sx + 0.5) / n) / size - 0.5
                    y = (py + (sy + 0.5) / n) / size - 0.5
                    colour = sample(x, y)
                    if colour:
                        r += colour[0]
                        g += colour[1]
                        b += colour[2]
                        hits += 1
            if hits:
                row += bytes((r // hits, g // hits, b // hits, round(255 * hits / (n * n))))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + row for row in rows)  # Filter type 0 on every row.
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA.
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        target = ICON_DIR / f"icon{size}.png"
        write_png(target, size, render(size))
        print(f"wrote {target.relative_to(ICON_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
