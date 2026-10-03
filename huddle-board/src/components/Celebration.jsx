import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const DEFAULT_COLORS = ["#34D399", "#FBBF24", "#F472B6", "#38BDF8", "#A78BFA", "#FFFFFF"];

// Canvas confetti burst (pattern from 21st.dev "Burst"). Covers its nearest positioned parent,
// draws nothing until fire() is called, and stops its animation loop once the last piece has fallen.
const Celebration = forwardRef(function Celebration(
  { colors = DEFAULT_COLORS, count = 70, velocity = 460, gravity = 900 },
  ref
) {
  const canvasRef = useRef(null);
  const pieces = useRef([]);
  const raf = useRef(0);
  const last = useRef(0);
  const running = useRef(false);

  const frame = (ts) => {
    const canvas = canvasRef.current;
    if (!canvas) { running.current = false; return; }
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const delta = Math.min(0.05, (ts - (last.current || ts)) / 1000);
    last.current = ts;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const living = [];
    for (const p of pieces.current) {
      p.life -= delta;
      if (p.life <= 0) continue;
      p.vy += gravity * delta;
      p.vx *= 1 - 1.2 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.angle += p.spin * delta;
      if (p.y - p.size > h) continue;
      living.push(p);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    pieces.current = living;

    if (living.length) {
      raf.current = requestAnimationFrame(frame);
    } else {
      running.current = false;
      last.current = 0;
      ctx.clearRect(0, 0, w, h);
    }
  };

  useImperativeHandle(ref, () => ({
    fire: (opts = {}) => {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const x = opts.x ?? w / 2;
      const y = opts.y ?? h * 0.3;
      const total = opts.count ?? count;
      for (let i = 0; i < total; i++) {
        const angle = Math.random() * Math.PI * 2;
        const power = velocity * (0.45 + Math.random() * 0.55);
        pieces.current.push({
          x, y,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power - velocity * 0.35,
          life: 0.9 + Math.random() * 0.9,
          spin: (Math.random() - 0.5) * 14,
          angle: Math.random() * Math.PI,
          size: 5 + Math.random() * 6,
          color: colors[i % colors.length],
        });
      }
      if (!running.current) {
        running.current = true;
        raf.current = requestAnimationFrame(frame);
      }
    },
  }), [colors, count, velocity, gravity]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 30 }}
    />
  );
});

export default Celebration;

// Fires the confetti when `pct` moves from below 100 up to 100 while the card is on screen.
// Opening a page where someone is ALREADY at 100% does not fire it.
export function useCelebrateOnComplete(pct, taskCount, celebrateRef) {
  const prev = useRef(null);
  useEffect(() => {
    if (taskCount === 0) { prev.current = null; return; }
    if (prev.current !== null && prev.current < 100 && pct === 100) {
      if (celebrateRef.current) celebrateRef.current.fire();
    }
    prev.current = pct;
  }, [pct, taskCount, celebrateRef]);
}
