"""
Generate the browser tab icon and the link-preview card.

    python scripts/make_icons.py

Both are built from the same palette as the dashboard, and the sparkline on the
preview card plots the REAL Overall series out of domain_level_trend.csv rather
than a decorative squiggle. That means the card cannot quietly drift away from
what the site actually says: re-run this after a pipeline run and the shape
follows the data.

Writes:
  docs/favicon.svg          crisp at any size, used by modern browsers
  docs/favicon-32.png       fallback
  docs/apple-touch-icon.png home-screen icon
  docs/og-image.png         1200x630 card for WhatsApp, Slack, link previews
"""
from __future__ import annotations

import csv
import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DATA = DOCS / "data"

# The dashboard palette, from tokens.css.
NAVY = (0, 49, 107)
BLUE = (0, 61, 165)
GOLD = (255, 192, 0)
SKY = (207, 226, 243)
SKY_LIGHT = (228, 238, 248)
INK = (27, 36, 51)
SLATE = (74, 85, 104)
RULE = (221, 227, 236)
PAPER = (255, 255, 255)
MIST = (244, 247, 251)

PUBLIC_SANS = "https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf"
_font_bytes: bytes | None = None


def font(size: int, weight: int = 400):
    """Public Sans if it can be fetched (it is the deck face), else Segoe UI."""
    global _font_bytes
    if _font_bytes is None:
        try:
            with urllib.request.urlopen(PUBLIC_SANS, timeout=15) as response:
                _font_bytes = response.read()
        except Exception:
            _font_bytes = b""
    if _font_bytes:
        try:
            f = ImageFont.truetype(io.BytesIO(_font_bytes), size)
            try:
                f.set_variation_by_axes([weight])
            except Exception:
                pass
            return f
        except Exception:
            pass
    fallback = "segoeuib.ttf" if weight >= 600 else "segoeui.ttf"
    try:
        return ImageFont.truetype(rf"C:\Windows\Fonts\{fallback}", size)
    except Exception:
        return ImageFont.load_default()


# ---------------------------------------------------------------- the mark
FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="Grade 2 competency trends">
  <rect width="32" height="32" rx="6" fill="#00316B"/>
  <!-- the trend line the whole dashboard is about -->
  <path d="M6 19 L12 13 L18 16 L26 8" fill="none" stroke="#FFFFFF" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="26" cy="8" r="2.6" fill="#FFC000"/>
  <!-- the instrument ribbon, the site's signature device -->
  <rect x="5" y="24" width="22" height="3.2" rx="1.6" fill="#CFE2F3"/>
  <rect x="18" y="24" width="9" height="3.2" rx="1.6" fill="#FFC000"/>
</svg>
"""


def draw_mark(size: int) -> Image.Image:
    """Raster version of the same mark, for browsers without SVG icon support."""
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.1875), fill=NAVY)

    def p(x, y):
        return (x / 32 * s, y / 32 * s)

    d.line([p(6, 19), p(12, 13), p(18, 16), p(26, 8)],
           fill=PAPER, width=max(2, int(s * 0.081)), joint="curve")
    r = s * 0.081
    cx, cy = p(26, 8)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    d.rounded_rectangle([*p(5, 24), *p(27, 27.2)], radius=s * 0.05, fill=SKY)
    d.rounded_rectangle([*p(18, 24), *p(27, 27.2)], radius=s * 0.05, fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


# ------------------------------------------------------------ preview card
def overall_series() -> list[tuple[str, float]]:
    """The real quarterly Overall series, so the card matches the site."""
    path = DATA / "domain_level_trend.csv"
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.DictReader(fh)
                if r["period_type"] == "quarter" and r["row_type"] == "trend_point"]
    order = {"Q2_2025": 0, "Q3_2025": 1, "Q4_2025": 2, "Q1_2026": 3, "Q2_2026": 4}
    rows.sort(key=lambda r: order.get(r["period"], 99))
    out = []
    for r in rows:
        try:
            out.append((r["period"], float(r["overall_pct_cleared"])))
        except (TypeError, ValueError):
            continue
    return out


def make_card() -> Image.Image:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # The navy edge bar, echoing the CSF slide template and the site's rail.
    d.rectangle([0, 0, 22, H], fill=NAVY)

    left = 84
    d.text((left, 92), "Grade 2 competency trends", font=font(66, 700), fill=NAVY)
    d.rectangle([left, 178, left + 96, 184], fill=GOLD)
    d.text((left, 208), "Basti district  \u00b7  NIPUN Bharat", font=font(32, 400), fill=SLATE)

    series = overall_series()
    if series:
        # --- the real Overall series, plotted on a full 0-100 axis -----------
        px, py = left, 300
        pw, ph = W - left - 200, 180   # room for the end-of-line value
        d.rectangle([px, py, px + pw, py + ph], fill=MIST)
        for frac in (0.25, 0.5, 0.75):
            gy = py + ph * frac
            d.line([px, gy, px + pw, gy], fill=RULE, width=1)

        step = pw / max(1, len(series) - 1)
        pts = [(px + i * step, py + ph - (v / 100) * ph) for i, (_, v) in enumerate(series)]
        d.line(pts, fill=INK, width=5, joint="curve")
        for i, (x, y) in enumerate(pts):
            r = 9
            d.ellipse([x - r, y - r, x + r, y + r], fill=PAPER, outline=INK, width=4)
        # Print the latest value beside the last point.
        lx, ly = pts[-1]
        d.text((lx + 18, ly - 20), f"{round(series[-1][1])}%", font=font(34, 700), fill=INK)

        # --- the instrument ribbon, the site's signature device --------------
        ry, rh = py + ph + 18, 22
        widths = [1, 1, 1, 2]          # Q2 25 | Q3 25 | EoY | 2026 SSP (two rounds)
        fills = [SKY, SKY_LIGHT, NAVY, SKY_LIGHT]
        labels = ["July + Aug", "Q3 2025 tool", "25-26 EoY", "2026 SSP"]
        unit = pw / sum(widths)
        x = px
        for w, fill, label in zip(widths, fills, labels):
            seg = unit * w
            d.rectangle([x, ry, x + seg, ry + rh], fill=fill)
            f = font(16, 500)
            tw = d.textlength(label, font=f)
            if tw < seg - 12:
                d.text((x + seg / 2 - tw / 2, ry + 3),
                       label, font=f, fill=PAPER if fill == NAVY else NAVY)
            x += seg

        d.text((left, ry + rh + 22),
               "% achieving  \u00b7  Aug 2025 to Aug 2026  \u00b7  seven assessment rounds",
               font=font(24, 400), fill=SLATE)

    # The mark, top right, clear of the plot and the ribbon.
    mark = draw_mark(96).convert("RGBA")
    img.paste(mark, (W - 96 - 64, 88), mark)
    return img


def main() -> int:
    (DOCS / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")

    draw_mark(32).save(DOCS / "favicon-32.png")
    draw_mark(180).convert("RGB").save(DOCS / "apple-touch-icon.png")
    make_card().save(DOCS / "og-image.png", optimize=True)

    for name in ["favicon.svg", "favicon-32.png", "apple-touch-icon.png", "og-image.png"]:
        path = DOCS / name
        print(f"  {name:24s} {path.stat().st_size // 1024:>4} KB")
    print("\nDone. Re-run after a pipeline run so the card's sparkline follows the data.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
