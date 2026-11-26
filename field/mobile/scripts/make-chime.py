# Makes the Raymiyo chat sound: res/raw/raymiyo_soft.wav
#   python3 scripts/make-chime.py
# A mellow electric-piano call: four soft notes that settle on a warm chord,
# with a small room around them. 48 kHz, about 2.4 seconds.
import numpy as np, wave, os

RATE = 48000
rng = np.random.default_rng(7)

def epiano(freq, length, gain=1.0):
    """Soft electric-piano tone: a gentle FM bark that melts into a pure, warm note."""
    t = np.arange(int(RATE * length)) / RATE
    out = np.zeros_like(t)
    for cents in (-3, 3):  # two voices a hair apart give a slow, warm shimmer
        f = freq * 2 ** (cents / 1200)
        index = 0.9 * np.exp(-t * 7.0)  # brightness only in the first moment
        body = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
        out += body * np.exp(-t * 1.9)
        out += 0.12 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 4.0)
    attack = 1 - np.exp(-t / 0.006)  # soft felt-hammer attack, no click
    return out * attack * gain * 0.5

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y

def place(buf, start, sound):
    i = int(start * RATE)
    end = min(len(buf), i + len(sound))
    buf[i:end] += sound[: end - i]

total = 2.4
dry = np.zeros(int(RATE * total))
A4, CS5, E5, FS5 = 440.0, 554.37, 659.26, 739.99
place(dry, 0.00, epiano(A4, 1.6, 0.80))
place(dry, 0.17, epiano(E5, 1.6, 0.70))
place(dry, 0.34, epiano(CS5, 1.6, 0.70))
place(dry, 0.62, epiano(FS5, 1.8, 0.75))  # the call settles on a soft A6 chord
place(dry, 0.62, epiano(A4, 1.8, 0.45))
place(dry, 0.62, epiano(E5, 1.8, 0.30))

# Small warm room: decaying noise, darkened, as the echo shape.
ir_len = int(RATE * 1.1)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / RATE * 5.5)
ir = lowpass(ir, 3500)
ir /= np.sqrt(np.sum(ir ** 2))
n = 1 << int(np.ceil(np.log2(len(dry) + ir_len)))
wet = np.fft.irfft(np.fft.rfft(dry, n) * np.fft.rfft(ir, n), n)[: len(dry)]
out = dry + 0.22 * wet / np.max(np.abs(wet)) * np.max(np.abs(dry))

out = lowpass(out, 7000)  # round off the top: mellow, not tinny
out = np.tanh(out / np.max(np.abs(out)) * 1.25)  # gentle glue, clearly audible
fade_len = int(RATE * 0.35)
out[-fade_len:] *= np.linspace(1, 0, fade_len) ** 2
out = out / np.max(np.abs(out)) * 10 ** (-1.0 / 20)

raw = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res", "raw")
for old in ("raymiyo_chime.wav",):
    p = os.path.join(raw, old)
    if os.path.exists(p):
        os.remove(p)
path = os.path.join(raw, "raymiyo_soft.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    dither = (rng.random(len(out)) - rng.random(len(out))) / 32767  # smooth quiet tail
    w.writeframes(np.clip((out + dither) * 32767, -32768, 32767).astype(np.int16).tobytes())
print("Wrote", os.path.normpath(path), f"{total:.2f}s")
