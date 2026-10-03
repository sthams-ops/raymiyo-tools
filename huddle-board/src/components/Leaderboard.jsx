import { motion } from "framer-motion";
import { Crown, Trophy, ChevronUp, ChevronDown, Minus } from "lucide-react";
import StreakBadge from "./StreakBadge.jsx";

// Gold / silver / bronze - same pill + podium language as the 21st.dev leaderboard components.
const MEDAL = {
  1: { text: "#FBBF24", ring: "rgba(251,191,36,0.5)", block: "linear-gradient(180deg, rgba(251,191,36,0.55), rgba(251,191,36,0.05))", h: 132 },
  2: { text: "#CBD5E1", ring: "rgba(203,213,225,0.42)", block: "linear-gradient(180deg, rgba(203,213,225,0.42), rgba(203,213,225,0.04))", h: 100 },
  3: { text: "#FDBA74", ring: "rgba(251,146,60,0.42)", block: "linear-gradient(180deg, rgba(251,146,60,0.45), rgba(251,146,60,0.04))", h: 76 },
};
const medalFor = (rank) => MEDAL[Math.min(rank, 3)];
const tier = (p) => (p >= 80 ? "#34D399" : p >= 50 ? "#FBBF24" : "#F87171");

function Avatar({ entry, size = 44 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: entry.gradient, display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.42), fontFamily: "var(--font-head)",
        boxShadow: `0 0 ${Math.round(size / 2)}px ${entry.color}55`,
      }}
    >
      {entry.name[0]}
    </div>
  );
}

function Podium({ entries }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean); // 2nd, 1st, 3rd
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, minHeight: 260, paddingTop: 34 }}>
      {order.map((e) => {
        const m = medalFor(e.rank);
        const first = e.rank === 1;
        return (
          <div key={e.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 94 }}>
            <div style={{ position: "relative", marginBottom: 6 }}>
              {first && (
                <motion.div
                  animate={{ y: [0, -4, 0], rotate: [-6, 6, -6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ position: "absolute", top: -24, left: "50%", marginLeft: -11, zIndex: 2, display: "flex" }}
                >
                  <Crown size={22} color="#FBBF24" fill="#FBBF24" />
                </motion.div>
              )}
              <Avatar entry={e} size={first ? 60 : 48} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-head)" }}>{e.name}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: m.text, fontFamily: "var(--font-head)" }}>{e.pct}%</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: m.h }}
              transition={{ type: "spring", stiffness: 120, damping: 18, delay: first ? 0.35 : e.rank === 2 ? 0.15 : 0.05 }}
              style={{
                width: "100%", marginTop: 6, borderRadius: "10px 10px 0 0", overflow: "hidden",
                background: m.block, border: `1px solid ${m.ring}`, borderBottom: "none",
                display: "flex", justifyContent: "center", paddingTop: 8,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 800, color: m.text, fontFamily: "var(--font-head)" }}>{e.rank}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function Movement({ moved }) {
  if (moved === null || moved === undefined) {
    return <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 10, letterSpacing: 1 }}>NEW</span>;
  }
  if (moved === 0) return <Minus size={12} color="rgba(255,255,255,0.3)" />;
  const up = moved > 0;
  const c = up ? "#34D399" : "#F87171";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", color: c, fontSize: 11, fontWeight: 800 }}>
      {up ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      {Math.abs(moved)}
    </span>
  );
}

function Row({ e }) {
  const m = e.rank <= 3 ? medalFor(e.rank) : null;
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12,
        background: e.rank === 1 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${m ? m.ring : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "inline-flex",
          alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
          fontFamily: "var(--font-head)", color: m ? m.text : "rgba(255,255,255,0.45)",
          border: `1px solid ${m ? m.ring : "rgba(255,255,255,0.12)"}`,
          background: m ? "rgba(255,255,255,0.04)" : "transparent",
        }}
      >
        {e.rank}
      </span>
      <Avatar entry={e} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${e.pct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{ height: "100%", background: tier(e.pct), boxShadow: `0 0 8px ${tier(e.pct)}` }}
          />
        </div>
      </div>
      <StreakBadge streak={e.streak} holding={e.holding} size="sm" />
      <span style={{ minWidth: 44, textAlign: "right", fontSize: 17, fontWeight: 800, fontFamily: "var(--font-head)", color: tier(e.pct) }}>{e.pct}%</span>
      <span style={{ minWidth: 30, display: "inline-flex", justifyContent: "center" }}><Movement moved={e.moved} /></span>
    </motion.div>
  );
}

// entries come from buildLeaderboard() in src/lib/leaderboard.js
export default function Leaderboard({ entries, monthLabel }) {
  if (!entries || !entries.length) {
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", color: "rgba(255,255,255,0.35)" }}>
        <Trophy size={28} color="rgba(255,255,255,0.25)" style={{ marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 600 }}>No scores yet for {monthLabel}</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Add this week&apos;s tasks and the leaderboard lights up.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Trophy size={18} color="#FBBF24" />
        <span style={{ fontFamily: "var(--font-head)", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Leaderboard</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
          {monthLabel} &middot; arrows show movement vs last month
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, alignItems: "end" }}>
        <Podium entries={entries} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
          {entries.map((e) => <Row key={e.id} e={e} />)}
        </div>
      </div>
    </div>
  );
}
