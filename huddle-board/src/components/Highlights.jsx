import { motion } from "framer-motion";
import { Crown, AlertTriangle } from "lucide-react";

// Gold banner: the champion of the last DECIDED month.
export function ChampionBanner({ champion, team }) {
  if (!champion || !champion.winners || !champion.winners.length) return null;
  const winners = champion.winners.map((id) => team.find((m) => m.id === id)).filter(Boolean);
  if (!winners.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        padding: "14px 20px", borderRadius: 16, marginBottom: 16,
        border: "1px solid rgba(251,191,36,0.3)",
        background: "linear-gradient(110deg, rgba(251,191,36,0.14), rgba(251,191,36,0.03) 60%)",
      }}
    >
      <motion.div
        aria-hidden="true"
        initial={{ x: "-130%" }}
        animate={{ x: "330%" }}
        transition={{ duration: 3.2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
        style={{
          position: "absolute", top: 0, bottom: 0, width: "30%", pointerEvents: "none",
          background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.10), transparent)",
        }}
      />
      <motion.div
        animate={{ rotate: [-8, 8, -8], y: [0, -3, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "flex", position: "relative" }}
      >
        <Crown size={30} color="#FBBF24" fill="#FBBF24" />
      </motion.div>
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 10, letterSpacing: 2.5, color: "rgba(251,191,36,0.85)", textTransform: "uppercase", fontWeight: 700 }}>
          Champion{winners.length > 1 ? "s" : ""} of {champion.label}
        </div>
        <div style={{ fontFamily: "var(--font-head)", fontSize: 22, fontWeight: 800, letterSpacing: -0.4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <span>
            {winners.map((w, i) => (
              <span key={w.id}>
                <span style={{ color: w.light || w.color }}>{w.name}</span>
                {i < winners.length - 1 && <span style={{ color: "rgba(255,255,255,0.3)" }}> &amp; </span>}
              </span>
            ))}
          </span>
          <span style={{ color: "#FBBF24" }}>{Number.isInteger(champion.score) ? `${champion.score}%` : `${champion.score.toFixed(1)}%`}</span>
        </div>
      </div>
      <div style={{ marginLeft: "auto", position: "relative", textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Month&apos;s completion score &middot; locked
      </div>
    </motion.div>
  );
}

// Red pulsing banner: people with tasks but nothing logged yet (shown from mid-week).
export function NotStartedBanner({ people, dayLabel }) {
  if (!people || !people.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{
        opacity: 1, y: 0,
        boxShadow: ["0 0 0 0 rgba(248,113,113,0)", "0 0 26px 2px rgba(248,113,113,0.28)", "0 0 0 0 rgba(248,113,113,0)"],
      }}
      transition={{
        opacity: { duration: 0.4 }, y: { duration: 0.4 },
        boxShadow: { duration: 2.4, repeat: Infinity, ease: "easeInOut" },
      }}
      style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        padding: "13px 20px", borderRadius: 16, marginBottom: 16,
        border: "1px solid rgba(248,113,113,0.4)",
        background: "linear-gradient(110deg, rgba(248,113,113,0.14), rgba(248,113,113,0.03) 65%)",
      }}
    >
      <AlertTriangle size={26} color="#F87171" />
      <div>
        <div style={{ fontSize: 10, letterSpacing: 2.5, color: "rgba(248,113,113,0.9)", textTransform: "uppercase", fontWeight: 700 }}>
          Not started yet &middot; it&apos;s {dayLabel}
        </div>
        <div style={{ fontFamily: "var(--font-head)", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
          {people.map((p, i) => (
            <span key={p.id}>
              <span style={{ color: p.light || p.color }}>{p.name}</span>
              {i < people.length - 1 && <span style={{ color: "rgba(255,255,255,0.3)" }}>, </span>}
            </span>
          ))}
          <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 500, fontSize: 14, fontFamily: "var(--font-body)" }}>
            {" "}&mdash; tasks are still at 0%. Update your progress.
          </span>
        </div>
      </div>
    </motion.div>
  );
}
