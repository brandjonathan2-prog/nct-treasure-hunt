"""Make printable A4 QR posters: one page per church, one PDF per hunt.

Usage: python3 tools/make_posters.py BASE_URL FONT_TTF OUT_DIR
  BASE_URL  the app's address, e.g. https://brandjonathan2-prog.github.io/nct-treasure-hunt/
  FONT_TTF  a TTF of Barlow Condensed Bold (headings)
Each QR code opens BASE_URL?hunt=<hunt id>&start=<church id>.
"""
import json, sys, os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF

BASE, FONT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
HERE = os.path.dirname(os.path.abspath(__file__))
HUNTS = os.path.join(HERE, "..", "hunts")
pdfmetrics.registerFont(TTFont("Display", FONT))

INK, MUTED, CHART, PAPER, LINE = HexColor("#1d2a36"), HexColor("#5d6b77"), HexColor("#b0137a"), HexColor("#fbf9f3"), HexColor("#d4cdb8")
W, H = A4
M = 18 * mm


def fmt(m):
    return f"{m} m" if m < 1000 else f"{m / 1000:.1f} km"


def wrap(c, text, font, size, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if c.stringWidth(t, font, size) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines


def fit_size(c, text, font, start, width, smallest=20):
    s = start
    while c.stringWidth(text, font, s) > width and s > smallest: s -= 1
    return s


def poster(c, hunt, k):
    stops, n = hunt["stops"], len(hunt["stops"])
    s = stops[k]
    url = f"{BASE}?hunt={hunt['id']}&start={s['id']}"
    legs = hunt.get("legs")
    walk = sum(l["m"] for x, l in enumerate(legs) if x != k) if legs else None

    c.setFillColor(PAPER); c.rect(0, 0, W, H, stroke=0, fill=1)
    # Top band
    c.setFillColor(CHART); c.rect(0, H - 30 * mm, W, 30 * mm, stroke=0, fill=1)
    c.setFillColor(white); c.setFont("Display", 30); c.drawString(M, H - 19 * mm, "NCT TREASURE HUNT")
    c.setFont("Helvetica", 11); c.drawString(M, H - 25.5 * mm, "A church trail on foot · free · on your phone")
    c.setFont("Display", 16); c.drawRightString(W - M, H - 19 * mm, hunt["title"].upper())

    # Where you are
    y = H - 46 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 13); c.drawString(M, y, "You're at")
    name = s["name"].upper()
    size = fit_size(c, name, "Display", 52, W - 2 * M)
    y -= size * 0.95
    c.setFillColor(INK); c.setFont("Display", size); c.drawString(M, y, name)

    # Intro
    y -= 11 * mm
    intro = (f"Start the {hunt['title']} trail here. Your phone's map guides you round the loop to the other "
             f"{n - 1} churches. At each one, find the detail in the photo and answer a question about what you see.")
    c.setFont("Helvetica", 13); c.setFillColor(INK)
    for line in wrap(c, intro, "Helvetica", 13, W - 2 * M):
        c.drawString(M, y, line); y -= 6.2 * mm

    # QR code
    qs = 100 * mm
    qx, qy = (W - qs) / 2, y - qs - 6 * mm
    c.setStrokeColor(INK); c.setLineWidth(1.5); c.roundRect(qx - 5 * mm, qy - 5 * mm, qs + 10 * mm, qs + 10 * mm, 4 * mm, stroke=1, fill=0)
    w = QrCodeWidget(url, barLevel="M"); b = w.getBounds()
    d = Drawing(qs, qs, transform=[qs / (b[2] - b[0]), 0, 0, qs / (b[3] - b[1]), 0, 0]); d.add(w)
    renderPDF.draw(d, c, qx, qy)
    y = qy - 14 * mm
    c.setFillColor(CHART); c.setFont("Display", 30); c.drawCentredString(W / 2, y, "SCAN TO START HERE")
    y -= 7 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 9)
    c.drawCentredString(W / 2, y, "Or type this address into your phone's browser:")
    base, query = url.split("?", 1)
    fs = fit_size(c, base, "Courier-Bold", 12, W - 2 * M, 7)
    c.setFillColor(INK)
    y -= 5.5 * mm; c.setFont("Courier-Bold", fs); c.drawCentredString(W / 2, y, base)
    y -= 5.5 * mm; c.setFont("Courier-Bold", fit_size(c, "?" + query, "Courier-Bold", fs, W - 2 * M, 7)); c.drawCentredString(W / 2, y, "?" + query)

    # Facts strip
    y -= 11 * mm
    c.setStrokeColor(LINE); c.setLineWidth(0.8); c.line(M, y + 6 * mm, W - M, y + 6 * mm)
    facts = [f"{n} churches", f"{fmt(walk)} walk from here" if walk else "", "about 90 minutes" if n > 4 else "about 75 minutes", "free"]
    c.setFillColor(INK); c.setFont("Display", 17)
    c.drawString(M, y - 1 * mm, "   ·   ".join(f for f in facts if f).upper())

    # The loop from here
    y -= 10 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 9.5); c.drawString(M, y, "THE TRAIL FROM HERE")
    y -= 5.5 * mm
    order = [stops[(k + j) % n]["name"] for j in range(n)]
    c.setFillColor(INK); c.setFont("Helvetica", 11)
    for line in wrap(c, "  →  ".join(order), "Helvetica", 11, W - 2 * M):
        c.drawString(M, y, line); y -= 5.4 * mm

    # Footer
    c.setFillColor(MUTED); c.setFont("Helvetica", 8)
    c.drawString(M, 12 * mm, "Proof of concept. Please be respectful inside churches, and wait or come back later if a service is on.")
    c.drawString(M, 8 * mm, "Map data © OpenStreetMap contributors. Clue photos credited in the app.")
    c.showPage()


os.makedirs(OUT, exist_ok=True)
for hid in json.load(open(os.path.join(HUNTS, "index.json")))["hunts"]:
    hunt = json.load(open(os.path.join(HUNTS, f"{hid}.json")))
    path = os.path.join(OUT, f"{hid}-posters.pdf")
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"{hunt['title']} – QR posters"); c.setAuthor("NCT Treasure Hunt")
    for k in range(len(hunt["stops"])): poster(c, hunt, k)
    c.save(); print(path, len(hunt["stops"]), "pages")
