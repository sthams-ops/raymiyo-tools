"""Draws the app icon, splash screen and notification-safe artwork for Android.
Run from the mobile folder after changing colours or shape:
    python3 scripts/make-icons.py
Needs Pillow (pip install pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / "android/app/src/main/res"
TOP, BOTTOM, DARK = (255, 106, 61), (255, 176, 32), (17, 27, 46)


def gradient(w, h):
    """Orange (top left) to amber (bottom right), like the web icon."""
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return small.resize((w, h), Image.BICUBIC)


def pin(size):
    """White map pin with a dark centre on a clear background, filling `size`."""
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = s * 0.36
    cx, cy = s / 2, s * 0.40
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    d.polygon([(cx - r * 0.80, cy + r * 0.60), (cx + r * 0.80, cy + r * 0.60), (cx, s * 0.98)], fill="white")
    d.ellipse([cx - r * 0.42, cy - r * 0.42, cx + r * 0.42, cy + r * 0.42], fill=DARK)
    return img.resize((size, size), Image.LANCZOS)


def with_pin(bg, pin_size):
    bg = bg.convert("RGBA")
    p = pin(pin_size)
    bg.alpha_composite(p, ((bg.width - pin_size) // 2, (bg.height - pin_size) // 2))
    return bg


def masked(img, radius_ratio):
    s = img.width * 4
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=s * radius_ratio, fill=255)
    out = img.copy()
    out.putalpha(mask.resize(img.size, Image.LANCZOS))
    return out


for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    folder = RES / f"mipmap-{name}"
    icon = with_pin(gradient(px, px), round(px * 0.62))
    masked(icon, 0.22).save(folder / "ic_launcher.png")
    masked(icon, 0.5).save(folder / "ic_launcher_round.png")
    # Adaptive icon: the phone crops the edges, so the pin stays inside the middle.
    fg = px * 108 // 48
    layer = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
    size = round(fg * 0.42)
    layer.alpha_composite(pin(size), ((fg - size) // 2, (fg - size) // 2))
    layer.save(folder / "ic_launcher_foreground.png")

for file in RES.glob("drawable*/splash.png"):
    w, h = Image.open(file).size
    with_pin(gradient(w, h), round(min(w, h) * 0.32)).convert("RGB").save(file)

print("Icons and splash screens written to", RES)
