import { motion } from "framer-motion";
import { Crown, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import StreakBadge from "./StreakBadge.jsx";

// Layout follows the 21st.dev LeaderboardCard: header (title + date range + selector), podium, ranked list
// with a highlighted "you" row. Everyone is always listed with their month percentage; only people at or above
// the qualifying bar get a rank. The bar shows a small tick at that line.
const MEDAL = {
  1: { text: "#FBBF24", ring: "rgba(251,191,36,0.5)", block: "linear-gradient(180deg, rgba(251,191,36,0.55), rgba(251,191,36,0.05))", h: 132 },
  2: { text: "#CBD5E1", ring: "rgba(203,213,225,0.42)", block: "linear-gradient(180deg, rgba(203,213,225,0.42), rgba(203,213,225,0.04))", h: 100 },
  3: { text: "#FDBA74", ring: "rgba(251,146,60,0.42)", block: "linear-gradient(180deg, rgba(251,146,60,0.45), rgba(251,146,60,0.04))", h: 76 },
};
const medalFor = (rank) => MEDAL[Math.min(rank, 3)];
const fmt = (n) => (Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`);
const tier = (p) => (p >= 80 ? "#34D399" : p >= 50 ? "#FBBF24" : "#F87171");
const shortOpts = { month: "short", day: "numeric", timeZone: "UTC" };
const shortDate = (key) => new Date(key + "T00:00:00Z").toLocaleDateString("en-US", shortOpts);
const dayDate = (key) => new Date(key + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", ...shortOpts });

function Avatar({ entry, size = 44, dim }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0, opacity: dim ? 0.85 : 1,
        background: entry.gradient || "#475569", display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.42), fontFamily: "var(--font-head)",
        boxShadow: `0 0 ${Math.round(size / 2)}px ${(entry.color || "#94A3B8")}55`,
      }}
    >
      {entry.name[0]}
    </div>
  );
}

function StatusPill({ month }) {
  const cfg = month.status === "final"
    ? { c: "#FBBF24", label: "FINAL", dot: false }
    : month.status === "live" && month.ended
      ? { c: "#FBBF24", label: "CLOSING", dot: true }
      : month.status === "live"
        ? { c: "#34D399", label: "LIVE", dot: true }
        : { c: "#94A3B8", label: "UPCOMING", dot: false };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 999,
        fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: cfg.c, background: `${cfg.c}14`, border: `1px solid ${cfg.c}44`,
      }}
    >
      {cfg.dot && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.c, display: "inline-block" }}
        />
      )}
      {cfg.label}
    </span>
  );
}

// An unclaimed podium spot: same shape, dashed, nothing written on it.
function OpenSpot({ pos }) {
  const m = medalFor(pos);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 94 }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.14)", marginBottom: 6 }} />
      <div style={{ height: 38 }} />
      <div
        style={{
          width: "100%", marginTop: 6, height: m.h, borderRadius: "10px 10px 0 0",
          border: "1px dashed rgba(255,255,255,0.12)", borderBottom: "none",
          display: "flex", justifyContent: "center", paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.12)", fontFamily: "var(--font-head)" }}>{pos}</span>
      </div>
    </div>
  );
}

function Podium({ rows, final }) {
  const spots = [rows[1], rows[0], rows[2]]; // 2nd, 1st, 3rd
  const slot = [2, 1, 3];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10, height: 290, paddingTop: 34 }}>
      {spots.map((e, i) => {
        if (!e) return <OpenSpot key={`open-${slot[i]}`} pos={slot[i]} />;
        const m = medalFor(e.rank);
        const first = e.rank === 1;
        return (
          <div key={e.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 94 }}>
            <div style={{ position: "relative", marginBottom: 6 }}>
              {first && final && (
                <motion.div
                  animate={{ y: [0, -4, 0], rotate: [-6, 6, -6] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  style={{ position: "absolute", top: -24, left: "50%", marginLeft: -11, zIndex: 2, display: "flex" }}
                >
                  <Crown size={22} color="#FBBF24" fill="#FBBF24" />
                </motion.div>
              )}
              {first && !final && (
                <span style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: "#FBBF24", whiteSpace: "nowrap" }}>
                  LEADING
                </span>
              )}
              <Avatar entry={e} size={first ? 60 : 48} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-head)" }}>{e.name}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: m.text, fontFamily: "var(--font-head)" }}>{fmt(e.score)}</div>
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

function RankChange({ change }) {
  if (typeof change !== "number" || change === 0) return null;
  const up = change > 0;
  const c = up ? "#34D399" : "#F87171";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span title="Rank change vs last month" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: c, fontSize: 11, fontWeight: 800 }}>
      <Icon size={13} /> {Math.abs(change)}
    </span>
  );
}

function Bar({ score, threshold }) {
  return (
    <div style={{ position: "relative", height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginTop: 7 }}>
      {score !== null && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, score)}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          style={{ height: "100%", borderRadius: 3, background: tier(score), boxShadow: `0 0 8px ${tier(score)}66` }}
        />
      )}
      <div style={{ position: "absolute", top: -3, bottom: -3, left: `${threshold}%`, width: 2, background: "#fff", opacity: 0.5, borderRadius: 1 }} />
    </div>
  );
}

function Row({ e, isMe, streak, threshold }) {
  const ranked = e.rank !== null;
  const m = ranked && e.rank <= 3 ? medalFor(e.rank) : null;
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12,
        background: isMe ? `${e.color}18` : e.rank === 1 ? "rgba(251,191,36,0.06)" : "rgba(255,255,255,0.025)",
        border: isMe ? `2px solid ${e.color}` : `1px solid ${m ? m.ring : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: 38 }}>
        <span style={{ width: 14, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-head)", color: m ? m.text : "rgba(255,255,255,0.3)" }}>
          {ranked ? e.rank : "–"}
        </span>
        {m && <Crown size={14} color={m.text} />}
      </div>
      <Avatar entry={e} size={34} dim={!ranked} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-head)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
          {isMe && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: e.color, border: `1px solid ${e.color}`, borderRadius: 4, padding: "0 5px" }}>YOU</span>}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
            {e.tasks ? `${e.tasks} task${e.tasks === 1 ? "" : "s"}` : "no tasks yet"}
          </span>
        </div>
        <Bar score={e.score} threshold={threshold} />
      </div>
      <StreakBadge streak={streak && streak.streak} holding={streak && streak.holding} size="sm" />
      {ranked && <RankChange change={e.rankChange} />}
      <span style={{ minWidth: 56, textAlign: "right", fontSize: 18, fontWeight: 800, fontFamily: "var(--font-head)", color: e.score === null ? "rgba(255,255,255,0.25)" : tier(e.score) }}>
        {e.score === null ? "—" : fmt(e.score)}
      </span>
    </motion.div>
  );
}

// The thin line between the ranked people and everyone still chasing it
function BarLine({ threshold }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 4px" }}>
      <div style={{ flex: 1, borderTop: "1px dashed rgba(255,255,255,0.16)" }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "rgba(255,255,255,0.35)" }}>{threshold}%</span>
      <div style={{ flex: 1, borderTop: "1px dashed rgba(255,255,255,0.16)" }} />
    </div>
  );
}

export default function LeaderboardCard({ month, months = [], selected, onSelect, team = [], currentUserId, streaks, loading }) {
  if (!month) {
    return (
      <div style={{ padding: "36px 20px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
        {loading ? "Loading leaderboard..." : "Leaderboard is not available right now."}
      </div>
    );
  }
  const byId = Object.fromEntries(team.map((m) => [m.id, m]));
  const meta = (id) => byId[id] || { id, name: id, color: "#94A3B8", gradient: "#475569" };
  const standings = month.standings.map((s) => ({ ...meta(s.id), ...s }));
  const rows = standings.filter((s) => s.rank !== null);
  const final = month.status === "final";
  const win = month.window;
  const champs = months.filter((m) => m.winners && m.winners.length && m.ym !== month.month).slice(0, 4);

  const sub = [month.label, `${shortDate(win.start)} – ${shortDate(win.end)}`];
  if (month.status === "live") {
    sub.push(`winner decided ${dayDate(win.decidedOn)}`);
    if (month.daysLeft) sub.push(`${month.daysLeft} day${month.daysLeft === 1 ? "" : "s"} left`);
  } else if (final) {
    sub.push(month.winners.length ? `decided ${dayDate(win.decidedOn)}` : "no winner");
  } else {
    sub.push(`starts ${shortDate(win.start)}`);
  }

  return (
    <div style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Trophy size={20} color="#FBBF24" />
            <span style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>Leaderboard</span>
            <StatusPill month={month} />
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 5 }}>{sub.join(" · ")}</div>
        </div>
        {months.length > 0 && (
          <select
            aria-label="Select month"
            value={selected || month.month}
            onChange={(e) => onSelect && onSelect(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "var(--font-body)", cursor: "pointer", outline: "none",
            }}
          >
            {months.map((m) => (
              <option key={m.ym} value={m.ym} style={{ background: "#0a0a1e" }}>
                {m.label}{m.status === "final" ? " - final" : m.status === "live" && m.ended ? " - closing" : m.status === "live" ? " - live" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
        <div style={{ flex: "0 0 330px", maxWidth: "100%" }}>
          <Podium rows={rows} final={final} />
        </div>
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {standings.map((e, i) => (
            <div key={e.id} style={{ display: "contents" }}>
              {rows.length > 0 && e.rank === null && standings[i - 1] && standings[i - 1].rank !== null && <BarLine threshold={month.threshold} />}
              <Row e={e} isMe={currentUserId === e.id} streak={streaks && streaks[e.id]} threshold={month.threshold} />
            </div>
          ))}
        </div>
      </div>

      {champs.length > 0 && (
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>Past champions</span>
          {champs.map((m) => (
            <span key={m.ym} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              <Crown size={11} fill="#FBBF24" />
              {m.shortLabel} &middot; {m.winners.map((id) => meta(id).name).join(" & ")} {m.score !== null && m.score !== undefined ? fmt(m.score) : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
