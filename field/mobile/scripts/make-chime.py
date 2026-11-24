# Makes the Raymiyo chat sound: res/raw/raymiyo_chime.wav
#   python3 scripts/make-chime.py
# A bright four-note rising call on a bell-and-mallet tone, played twice,
# about 2.4 seconds long and mastered loud so it cuts through a busy shop.
import numpy as np, wave, os

RATE = 44100

def note(freq, length, gain=1.0):
    t = np.arange(int(RATE * length)) / RATE
    # Mallet body plus two bell partials; the bright ones fade first.
    tone = (
        1.00 * np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.2)
        + 0.45 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 6.0)
        + 0.30 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 9.0)
        + 0.18 * np.sin(2 * np.pi * freq * 4.17 * t) * np.exp(-t * 14.0)
    )
    attack = np.minimum(1, t / 0.004)  # 4 ms strike, no click
    return tone * attack * gain

def place(buf, start, sound):
    i = int(start * RATE)
    end = min(len(buf), i + len(sound))
    buf[i:end] += sound[: end - i]

total = 2.45
out = np.zeros(int(RATE * total))
E5, A5, CS6, E6, A6 = 659.25, 880.0, 1108.73, 1318.51, 1760.0
for rep, base in enumerate((0.0, 1.05)):
    lift = 1.0 if rep == 0 else 1.12
    place(out, base + 0.00, note(E5, 1.2, 0.85 * lift))
    place(out, base + 0.11, note(A5, 1.2, 0.85 * lift))
    place(out, base + 0.22, note(CS6, 1.2, 0.80 * lift))
    place(out, base + 0.33, note(E6, 1.3, 0.95 * lift))
    place(out, base + 0.33, note(A6, 1.3, 0.35 * lift))  # sparkle on the top note

# Loud master: soft saturation lifts the average level, then peak to -0.3 dB.
out = np.tanh(out * 1.8)
fade = np.ones_like(out)
fade[-int(RATE * 0.25):] = np.linspace(1, 0, int(RATE * 0.25))
out *= fade
out = out / np.max(np.abs(out)) * 10 ** (-0.3 / 20)

path = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res", "raw", "raymiyo_chime.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(RATE)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print("Wrote", os.path.normpath(path), f"{total:.2f}s")
