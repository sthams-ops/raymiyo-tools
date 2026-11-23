// Chat sounds, made in the browser so there are no audio files to load.
// Phones only allow sound after the person has touched the screen once,
// so unlockSound() is called on the first tap anywhere in the app.
let ctx = null;

function audio() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      ctx = new Ctx();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockSound() {
  const c = audio();
  if (!c) return;
  // A silent blip wakes the audio system on iPhone.
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(c.destination);
  const o = c.createOscillator();
  o.connect(g);
  o.start();
  o.stop(c.currentTime + 0.01);
}

function note(c, { freq, to, start, dur, peak, type = "sine" }) {
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Short rising "pop" when your message reaches the server.
export function playSent() {
  const c = audio();
  if (!c) return;
  note(c, { freq: 520, to: 1040, start: 0, dur: 0.11, peak: 0.16 });
}

// Two soft rising notes when a message arrives.
export function playReceived() {
  const c = audio();
  if (!c) return;
  note(c, { freq: 784, start: 0, dur: 0.16, peak: 0.2, type: "triangle" });
  note(c, { freq: 1175, start: 0.12, dur: 0.24, peak: 0.18, type: "triangle" });
  if (navigator.vibrate) {
    try {
      navigator.vibrate([60, 40, 60]);
    } catch {}
  }
}
