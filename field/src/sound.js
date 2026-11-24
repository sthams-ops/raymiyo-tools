// Chat sounds. The "message arrived" sound is the Raymiyo tone, the same one
// the Android app rings with; until it has loaded, a made-up two-note sound plays.
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

// The Raymiyo tone, fetched once and kept ready.
const TONE_URL = "/sounds/raymiyo-soft.mp3";
let tone = null;
let toneLoading = null;
function loadTone(c) {
  if (tone || toneLoading) return toneLoading;
  toneLoading = fetch(TONE_URL)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("tone " + r.status))))
    .then((buf) => new Promise((ok, no) => c.decodeAudioData(buf, ok, no)))
    .then((decoded) => (tone = decoded))
    .catch(() => {
      toneLoading = null; // try again next time
    });
  return toneLoading;
}

export function unlockSound() {
  const c = audio();
  if (!c) return;
  loadTone(c);
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

// The Raymiyo tone when a message arrives.
export function playReceived() {
  const c = audio();
  if (!c) return;
  if (tone) {
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = 0.85;
    src.buffer = tone;
    src.connect(g);
    g.connect(c.destination);
    src.start();
  } else {
    loadTone(c);
    note(c, { freq: 784, start: 0, dur: 0.16, peak: 0.2, type: "triangle" });
    note(c, { freq: 1175, start: 0.12, dur: 0.24, peak: 0.18, type: "triangle" });
  }
  if (navigator.vibrate) {
    try {
      navigator.vibrate([60, 40, 60]);
    } catch {}
  }
}
